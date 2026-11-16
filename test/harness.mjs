// Test harness for kixbt ShieldScan — zero deps, deterministic, offline.
// (Live-RPC checks are a separate optional step; see README.)
// Run: node test/harness.mjs   — must print "ALL PASS".

import { spawn } from "node:child_process";
import {
  isValidAddress,
  normalizeAddress,
  padAddress,
  balanceOfData,
  allowanceData,
  decodeUint256,
  formatUnits,
  isUnlimited,
  analyze,
  MAX_UINT256,
} from "../src/scan.mjs";
import { demoScan, SAMPLE_ADDRESS } from "../src/demo-data.mjs";
import { formatText } from "../src/report.mjs";
import { TOKENS, KNOWN_SPENDERS } from "../src/tokens.mjs";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`FAIL: ${name}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SPENDER = KNOWN_SPENDERS[0].address; // Uniswap V2 Router
const UNKNOWN = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const max = MAX_UINT256.toString();

function baseRaw(overrides = {}) {
  return {
    address: ADDR.toLowerCase(),
    ethBalanceWei: "1000000000000000000",
    txCount: 42,
    isContract: false,
    blockNumber: 23000000,
    balances: TOKENS.map((t) => ({ token: t, balance: "1000000000000000000" })),
    allowances: [],
    logApprovals: [],
    mode: "test",
    ...overrides,
  };
}

// ---- 0. Curated lists are all valid addresses (guards against typos) ----
for (const t of TOKENS) check(`token ${t.symbol} address valid`, isValidAddress(t.address));
for (const s of KNOWN_SPENDERS) check(`spender ${s.label} address valid`, isValidAddress(s.address));
check("token list non-empty", TOKENS.length >= 5);
check("spender list non-empty", KNOWN_SPENDERS.length >= 5);

// ---- 1. Address validation ----
check("valid address accepted", isValidAddress(ADDR));
check("lowercase address accepted", isValidAddress(ADDR.toLowerCase()));
check("short address rejected", !isValidAddress("0x1234"));
check("missing 0x rejected", !isValidAddress("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"));
check("non-hex rejected", !isValidAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"));
check("non-string rejected", !isValidAddress(12345));
check("normalize lowercases", normalizeAddress(ADDR) === ADDR.toLowerCase());
let threw = false;
try { normalizeAddress("nope"); } catch { threw = true; }
check("normalize throws on invalid", threw);

// ---- 2. ABI encoding / decoding ----
check("padAddress pads to 32 bytes", padAddress(ADDR) === "0".repeat(24) + ADDR.slice(2).toLowerCase());
check("balanceOf selector 0x70a08231", balanceOfData(ADDR).startsWith("0x70a08231"));
check("balanceOf calldata length", balanceOfData(ADDR).length === 2 + 8 + 64);
check("allowance selector 0xdd62ed3e", allowanceData(ADDR, SPENDER).startsWith("0xdd62ed3e"));
check("allowance calldata length", allowanceData(ADDR, SPENDER).length === 2 + 8 + 64 + 64);
check("decodeUint256 0x0", decodeUint256("0x0") === 0n);
check("decodeUint256 0x10", decodeUint256("0x10") === 16n);
check("decodeUint256 max", decodeUint256("0x" + "f".repeat(64)) === MAX_UINT256);
check("decodeUint256 garbage -> 0", decodeUint256("not hex") === 0n);
check("formatUnits whole", formatUnits("1500000", 6) === "1.5");
check("formatUnits exact", formatUnits("1000000000000000000", 18) === "1");
check("formatUnits zero", formatUnits("0", 18) === "0");
check("isUnlimited true", isUnlimited(max));
check("isUnlimited false", !isUnlimited("1000"));

// ---- 3. Analyzer: clean wallet ----
{
  const r = analyze(baseRaw());
  check("clean wallet score 0", r.riskScore === 0);
  check("clean wallet grade LOW", r.grade === "LOW");
  check("clean wallet has NO_ACTIVE_APPROVALS", r.findings.some((f) => f.code === "NO_ACTIVE_APPROVALS"));
  check("clean wallet 0 active approvals", r.summary.activeApprovals === 0);
  check("clean wallet network label", r.network === "ethereum-mainnet");
}

// ---- 4. Analyzer: unlimited approval ----
{
  const r = analyze(baseRaw({
    allowances: [{ token: TOKENS[0], spender: SPENDER, spenderLabel: "Uniswap V2 Router", allowance: max }],
  }));
  check("unlimited adds 35", r.riskScore === 35);
  check("unlimited grade MEDIUM", r.grade === "MEDIUM");
  check("unlimited finding present", r.findings.some((f) => f.code === "UNLIMITED_APPROVAL" && f.severity === "HIGH"));
  check("unlimited count 1", r.summary.unlimitedApprovals === 1);
}

// ---- 5. Analyzer: unknown spender ----
{
  const r = analyze(baseRaw({
    allowances: [{ token: TOKENS[3], spender: UNKNOWN, spenderLabel: null, allowance: "500000000000000000" }],
  }));
  check("unknown spender adds 20", r.riskScore === 20);
  check("unknown spender finding present", r.findings.some((f) => f.code === "UNKNOWN_SPENDER"));
  check("unknown spender counted", r.summary.unknownSpenders === 1);
}

// ---- 6. Analyzer: approval exceeds balance ----
{
  const r = analyze(baseRaw({
    balances: [{ token: TOKENS[0], balance: "1000000" }], // 1 USDC
    allowances: [{ token: TOKENS[0], spender: SPENDER, spenderLabel: "Uniswap V2 Router", allowance: "5000000" }], // 5 USDC
  }));
  check("exceeds-balance adds 10", r.riskScore === 10);
  check("exceeds-balance finding present", r.findings.some((f) => f.code === "APPROVAL_EXCEEDS_BALANCE"));
}

// ---- 7. Analyzer: score cap + contract wallet + log approval ----
{
  const allowances = TOKENS.slice(0, 4).map((t) => ({
    token: t, spender: SPENDER, spenderLabel: "Uniswap V2 Router", allowance: max,
  }));
  const r = analyze(baseRaw({
    isContract: true,
    allowances,
    logApprovals: [{ token: { symbol: "UNKNOWN", address: "0x0000000000000000000000000000000000000001", decimals: 18 }, spender: UNKNOWN, blockNumber: 22999999 }],
  }));
  check("score capped at 100", r.riskScore === 100);
  check("capped grade CRITICAL", r.grade === "CRITICAL");
  check("contract wallet INFO finding", r.findings.some((f) => f.code === "CONTRACT_WALLET"));
  check("other-token log approval finding", r.findings.some((f) => f.code === "OTHER_TOKEN_APPROVAL"));
  check("log approval adds 15 (4x35=140 -> capped)", r.riskScore === 100);
}

// ---- 7b. Analyzer: EIP-7702 delegation reported instead of generic contract ----
{
  const r = analyze(baseRaw({ isContract: true, eip7702: true }));
  check("eip7702 finding present", r.findings.some((f) => f.code === "EIP7702_DELEGATION"));
  check("eip7702 replaces contract finding", !r.findings.some((f) => f.code === "CONTRACT_WALLET"));
}

// ---- 8. Analyzer: grade boundaries ----
{
  const mk = (score) => {
    // Build a raw input whose score equals `score` using unlimited (+35) and unknown (+20) pieces.
    const allowances = [];
    const n35 = Math.floor(score / 35);
    const rem = score % 35;
    for (let i = 0; i < n35; i++) {
      allowances.push({ token: TOKENS[i], spender: SPENDER, spenderLabel: "Uniswap V2 Router", allowance: max });
    }
    if (rem === 20) allowances.push({ token: TOKENS[7], spender: UNKNOWN, spenderLabel: null, allowance: "1" });
    if (rem === 10) {
      // exceeds-balance: needs a balance smaller than allowance
      allowances.push({ token: TOKENS[7], spender: SPENDER, spenderLabel: "Uniswap V2 Router", allowance: "2000000000000000000" });
    }
    return analyze(baseRaw({ allowances }));
  };
  check("grade LOW at 0", mk(0).grade === "LOW");
  check("grade MEDIUM at 20", mk(20).grade === "MEDIUM");
  check("grade MEDIUM at 35", mk(35).grade === "MEDIUM");
  check("grade HIGH at 55", mk(55).grade === "HIGH");
  check("grade HIGH at 70", mk(70).grade === "HIGH");
  check("grade CRITICAL at 90", mk(90).grade === "CRITICAL");
}

// ---- 9. Demo data ----
{
  const a = demoScan();
  const b = demoScan();
  const strip = (r) => { const { scannedAt, ...rest } = r; return rest; };
  check("demo deterministic (modulo timestamp)", eq(strip(a), strip(b)));
  check("demo score 90", a.riskScore === 90);
  check("demo grade CRITICAL", a.grade === "CRITICAL");
  check("demo has 2 unlimited", a.summary.unlimitedApprovals === 2);
  check("demo has 1 unknown spender", a.summary.unknownSpenders === 1);
  check("demo address is sample", a.address === SAMPLE_ADDRESS.toLowerCase());
  check("demo mode flag", a.mode === "demo");
  check("demo wallet ETH balance", a.wallet.ethBalance === "12.345");
  const text = formatText(a);
  check("text report has score line", text.includes("RISK SCORE : 90/100"));
  check("text report has grade", text.includes("CRITICAL"));
  check("text report has address", text.includes(SAMPLE_ADDRESS.toLowerCase()));
  check("text report mentions revoke", text.toLowerCase().includes("revoke"));
}

// ---- 10. Server smoke test (demo mode, no network) ----
async function waitForHealth(port, tries = 25) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function serverTests() {
  const port = 34567;
  const child = spawn("node", ["server.mjs"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), DEMO_MODE: "1" },
    stdio: "ignore",
  });
  try {
    check("server starts and /health responds", await waitForHealth(port));
    const info = await (await fetch(`http://127.0.0.1:${port}/`)).json();
    check("GET / returns agent name", info.agent === "kixbt-shieldscan");
    check("GET / reports demo mode", info.demoMode === true);

    const okRes = await fetch(`http://127.0.0.1:${port}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: SAMPLE_ADDRESS }),
    });
    check("POST /scan 200", okRes.status === 200);
    const okBody = await okRes.json();
    check("POST /scan ok:true", okBody.ok === true);
    check("POST /scan riskScore 90", okBody.riskScore === 90);
    check("POST /scan grade CRITICAL", okBody.grade === "CRITICAL");
    check("POST /scan findings array", Array.isArray(okBody.findings) && okBody.findings.length >= 3);

    const badRes = await fetch(`http://127.0.0.1:${port}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "not-an-address" }),
    });
    check("POST /scan invalid address -> 400", badRes.status === 400);
    const badBody = await badRes.json();
    check("POST /scan invalid body ok:false", badBody.ok === false);

    const getRes = await fetch(`http://127.0.0.1:${port}/scan?address=${SAMPLE_ADDRESS}&demo=1`);
    check("GET /scan?address 200", getRes.status === 200);
    const getBody = await getRes.json();
    check("GET /scan returns same score", getBody.riskScore === 90);

    const nfRes = await fetch(`http://127.0.0.1:${port}/nope`);
    check("unknown route -> 404", nfRes.status === 404);
  } finally {
    child.kill("SIGTERM");
  }
}

await serverTests();

// ---- Summary ----
console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log("Failures:", failures.join(", "));
  process.exit(1);
}
console.log("ALL PASS");
