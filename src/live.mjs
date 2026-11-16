// Live scan: pulls real on-chain data via public JSON-RPC (no API key),
// then hands the raw data to the pure analyzer in scan.mjs.

import { rpcCall, rpcBatch } from "./rpc.mjs";
import { TOKENS, KNOWN_SPENDERS, tokenByAddress, spenderLabel } from "./tokens.mjs";
import {
  analyze,
  normalizeAddress,
  balanceOfData,
  allowanceData,
  decodeUint256,
} from "./scan.mjs";

// keccak256("Approval(address,address,uint256)")
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const LOG_BLOCK_WINDOW = 20000; // ~2.8 days of mainnet blocks

async function chunked(calls, size = 8) {
  const out = [];
  for (let i = 0; i < calls.length; i += size) {
    const res = await rpcBatch(calls.slice(i, i + size));
    out.push(...res);
    if (i + size < calls.length) await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

export async function liveScan(addressInput) {
  const address = normalizeAddress(addressInput);

  const [blockHex, balanceHex, nonceHex, code] = await Promise.all([
    rpcCall("eth_blockNumber", []),
    rpcCall("eth_getBalance", [address, "latest"]),
    rpcCall("eth_getTransactionCount", [address, "latest"]),
    rpcCall("eth_getCode", [address, "latest"]),
  ]);
  const blockNumber = Number(BigInt(blockHex));

  // Token balances for the curated list.
  const balCalls = TOKENS.map((t) => ({
    method: "eth_call",
    params: [{ to: t.address, data: balanceOfData(address) }, "latest"],
  }));
  const balResults = await chunked(balCalls);
  const balances = TOKENS.map((t, i) => ({
    token: t,
    balance: decodeUint256(balResults[i]).toString(),
  }));

  // Allowances: every watched token x every known spender.
  const pairs = [];
  for (const t of TOKENS) {
    for (const s of KNOWN_SPENDERS) pairs.push({ token: t, spender: s });
  }
  const allowCalls = pairs.map((p) => ({
    method: "eth_call",
    params: [
      { to: p.token.address, data: allowanceData(address, p.spender.address) },
      "latest",
    ],
  }));
  const allowResults = await chunked(allowCalls);
  const allowances = pairs.map((p, i) => ({
    token: p.token,
    spender: p.spender.address,
    spenderLabel: p.spender.label,
    allowance: decodeUint256(allowResults[i]).toString(),
  }));

  // Discover Approval events for this owner in the recent window —
  // catches approvals to spenders/tokens outside the curated lists.
  let logApprovals = [];
  try {
    const fromBlock = "0x" + Math.max(0, blockNumber - LOG_BLOCK_WINDOW).toString(16);
    const logs = await rpcCall("eth_getLogs", [
      {
        fromBlock,
        toBlock: "latest",
        topics: [APPROVAL_TOPIC, "0x" + "0".repeat(24) + address.slice(2).toLowerCase()],
      },
    ]);
    const seen = new Set();
    for (const log of logs || []) {
      const tokenAddr = log.address;
      const spender = "0x" + (log.topics?.[2] || "").slice(26);
      const key = tokenAddr.toLowerCase() + ":" + spender.toLowerCase();
      if (seen.has(key) || !/^0x[0-9a-fA-F]{40}$/.test(spender)) continue;
      seen.add(key);
      const tok = tokenByAddress(tokenAddr);
      logApprovals.push({
        token: tok || { symbol: "UNKNOWN", address: tokenAddr, decimals: 18 },
        spender,
        blockNumber: Number(BigInt(log.blockNumber || "0x0")),
      });
    }
  } catch {
    // Log discovery is best-effort; the curated checks above are the core scan.
    logApprovals = [];
  }

  return analyze({
    address,
    ethBalanceWei: decodeUint256(balanceHex).toString(),
    txCount: Number(BigInt(nonceHex)),
    isContract: code !== "0x" && code !== "0x0",
    eip7702: code.toLowerCase().startsWith("0xef01"),
    blockNumber,
    balances,
    allowances,
    logApprovals,
    mode: "live",
  });
}
