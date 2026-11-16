// Pure scoring engine: address validation + risk analysis.
// No I/O, no network — fully unit-testable. Imported by server.mjs and demo.mjs.

import { tokenByAddress, spenderLabel } from "./tokens.mjs";

export const MAX_UINT256 = (2n ** 256n) - 1n;

export function isValidAddress(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function normalizeAddress(addr) {
  if (!isValidAddress(addr)) throw new Error(`Invalid Ethereum address: ${addr}`);
  return addr.toLowerCase();
}

// ---- ABI helpers (hand-rolled, no deps) ----
export const padAddress = (addr) => "0".repeat(24) + addr.slice(2).toLowerCase();
export const balanceOfData = (owner) => "0x70a08231" + padAddress(owner);
export const allowanceData = (owner, spender) =>
  "0xdd62ed3e" + padAddress(owner) + padAddress(spender);
export const decodeUint256 = (hex) => {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) return 0n;
  return BigInt(hex === "0x" ? "0x0" : hex);
};

export function formatUnits(value, decimals) {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function isUnlimited(value) {
  return BigInt(value) === MAX_UINT256;
}

// ---- Risk analysis ----
// Input: raw scan data
// {
//   address, ethBalanceWei, txCount, isContract, blockNumber,
//   balances: [{ token, balance }],
//   allowances: [{ token, spender, spenderLabel, allowance }],
//   logApprovals: [{ token, spender, blockNumber }]  // Approval events found on-chain
// }
// Output: report { address, riskScore, grade, findings[], summary, ... }
export function analyze(raw) {
  const findings = [];
  const add = (severity, code, title, detail, recommendation) =>
    findings.push({ severity, code, title, detail, recommendation });

  let score = 0;
  const unlimited = raw.allowances.filter((a) => isUnlimited(a.allowance));
  const unknownSpenders = raw.allowances.filter(
    (a) => BigInt(a.allowance) > 0n && !a.spenderLabel,
  );
  const nonzero = raw.allowances.filter((a) => BigInt(a.allowance) > 0n);

  for (const a of unlimited) {
    score += 35;
    add(
      "HIGH",
      "UNLIMITED_APPROVAL",
      `Unlimited ${a.token.symbol} approval to ${a.spenderLabel || "unknown spender"}`,
      `${a.token.symbol} allowance is 2^256-1 (unlimited) for spender ${a.spender} (${a.spenderLabel || "not a recognised protocol"}). That contract can move ALL of your ${a.token.symbol} at any time, now and in the future.`,
      `Revoke or cap this approval (e.g. revoke.cash or Etherscan Token Approvals) unless you actively use this spender every day.`,
    );
  }

  for (const a of unknownSpenders) {
    if (isUnlimited(a.allowance)) continue; // already counted above
    score += 20;
    add(
      "MEDIUM",
      "UNKNOWN_SPENDER",
      `${a.token.symbol} approved to an unrecognised spender`,
      `Spender ${a.spender} is not on the known-protocol list and holds an allowance of ${formatUnits(a.allowance, a.token.decimals)} ${a.token.symbol}. Unknown spenders are the classic approval-phishing / drainer pattern.`,
      `Verify what this spender is before using it again; revoke if you do not recognise it.`,
    );
  }

  for (const a of nonzero) {
    if (isUnlimited(a.allowance) || !a.spenderLabel) continue;
    const bal = raw.balances.find(
      (b) => b.token.address.toLowerCase() === a.token.address.toLowerCase(),
    );
    const balVal = bal ? BigInt(bal.balance) : 0n;
    if (BigInt(a.allowance) > balVal && balVal > 0n) {
      score += 10;
      add(
        "LOW",
        "APPROVAL_EXCEEDS_BALANCE",
        `${a.token.symbol} approval exceeds current balance`,
        `Allowance ${formatUnits(a.allowance, a.token.decimals)} ${a.token.symbol} to ${a.spenderLabel} is larger than the wallet's current balance of ${formatUnits(balVal, a.token.decimals)} ${a.token.symbol}. Any future deposit is spendable up to the allowance.`,
        `Lower the allowance to the amount you actually intend to spend.`,
      );
    }
  }

  // Approval events discovered on-chain that are NOT in the curated token list:
  // the wallet approved some other token to someone — worth a look.
  for (const la of raw.logApprovals || []) {
    const known = raw.allowances.some(
      (a) =>
        a.token.address.toLowerCase() === la.token.address.toLowerCase() &&
        a.spender.toLowerCase() === la.spender.toLowerCase(),
    );
    if (known) continue;
    const tok = tokenByAddress(la.token.address);
    score += 15;
    add(
      "MEDIUM",
      "OTHER_TOKEN_APPROVAL",
      `Approval found for ${tok ? tok.symbol : "an unlisted token"}`,
      `On-chain Approval event at block ${la.blockNumber}: token ${la.token.address} approved to spender ${la.spender}. This token is outside the curated watchlist, so its current allowance was not re-checked live.`,
      `Check this approval on Etherscan's Token Approval Checker and revoke if unneeded.`,
    );
  }

  if (raw.eip7702) {
    add(
      "INFO",
      "EIP7702_DELEGATION",
      "Address is an EIP-7702 delegated EOA",
      "The address holds an EIP-7702 delegation (code starts 0xef01): it is an externally-owned account that has temporarily delegated execution to a smart contract. Approvals behave the same, but a delegation can change what the account can do.",
      "No action — informational only. Re-scan after changing or revoking the delegation.",
    );
  } else if (raw.isContract) {
    add(
      "INFO",
      "CONTRACT_WALLET",
      "Address is a smart contract (not an EOA)",
      "The address holds contract bytecode. Approvals behave the same, but contract wallets (multisig, account abstraction) have different key-management risk.",
      "No action — informational only.",
    );
  }

  if (nonzero.length === 0) {
    add(
      "INFO",
      "NO_ACTIVE_APPROVALS",
      "No active token approvals found",
      "No non-zero allowance was found for any watched token/spender pair.",
      "No action — keep it that way; re-scan after using a new dApp.",
    );
  }

  score = Math.min(100, score);
  const grade = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  return {
    agent: "kixbt-shieldscan",
    address: raw.address,
    scannedAt: new Date().toISOString(),
    blockNumber: raw.blockNumber ?? null,
    network: "ethereum-mainnet",
    mode: raw.mode || "live",
    wallet: {
      ethBalance: formatUnits(raw.ethBalanceWei ?? 0n, 18),
      txCount: raw.txCount ?? null,
      isContract: !!raw.isContract,
    },
    riskScore: score,
    grade,
    findings,
    summary: {
      tokensChecked: raw.balances.length,
      allowancesChecked: raw.allowances.length,
      activeApprovals: nonzero.length,
      unlimitedApprovals: unlimited.length,
      unknownSpenders: unknownSpenders.length,
      ...counts,
    },
  };
}
