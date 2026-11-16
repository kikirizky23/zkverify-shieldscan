// Sample data for demo mode — deterministic, no network.
// Address is vitalik.eth (0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045), a public
// well-known address. THE FINDINGS BELOW ARE ILLUSTRATIVE SAMPLE DATA, not a
// real scan of that address — they exist so the agent can be demoed and
// tested offline. Real scans use src/live.mjs.

import { TOKENS, KNOWN_SPENDERS } from "./tokens.mjs";
import { analyze, MAX_UINT256 } from "./scan.mjs";

export const SAMPLE_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function tok(symbol) {
  return TOKENS.find((t) => t.symbol === symbol);
}
function spender(label) {
  return KNOWN_SPENDERS.find((s) => s.label === label);
}

export function demoScan(addressInput = SAMPLE_ADDRESS) {
  const address = addressInput.toLowerCase();
  const max = MAX_UINT256.toString();
  const balances = TOKENS.map((t) => ({
    token: t,
    balance:
      t.symbol === "USDC"
        ? "1250000000" // 1,250 USDC
        : t.symbol === "DAI"
          ? "500000000000000000000" // 500 DAI
          : t.symbol === "WETH"
            ? "2500000000000000000" // 2.5 WETH
            : "0",
  }));
  const allowances = [
    // Unlimited USDC to a known protocol — HIGH
    { token: tok("USDC"), spender: spender("Uniswap V3 SwapRouter").address, spenderLabel: "Uniswap V3 SwapRouter", allowance: max },
    // Unlimited DAI to Permit2 — HIGH
    { token: tok("DAI"), spender: spender("Uniswap Permit2").address, spenderLabel: "Uniswap Permit2", allowance: max },
    // WETH approved to an unknown spender — MEDIUM
    { token: tok("WETH"), spender: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", spenderLabel: null, allowance: "1000000000000000000" },
    // Small, sane approval — no finding
    { token: tok("USDC"), spender: spender("Aave V3 Pool").address, spenderLabel: "Aave V3 Pool", allowance: "100000000" },
  ];
  // Zero allowances for everything else, so the report is complete.
  for (const t of TOKENS) {
    for (const s of KNOWN_SPENDERS) {
      if (!allowances.some((a) => a.token.symbol === t.symbol && a.spender === s.address)) {
        allowances.push({ token: t, spender: s.address, spenderLabel: s.label, allowance: "0" });
      }
    }
  }
  return analyze({
    address,
    ethBalanceWei: "12345000000000000000", // 12.345 ETH
    txCount: 1337,
    isContract: false,
    blockNumber: 23000000,
    balances,
    allowances,
    logApprovals: [],
    mode: "demo",
  });
}
