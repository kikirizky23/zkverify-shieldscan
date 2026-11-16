// HTTP server for kixbt ShieldScan (Railway-ready, same pattern as the
// gatekeeper agent: Node 22, $PORT, no build step, zero dependencies).
//
//   GET  /            -> agent info
//   GET  /health      -> { ok: true }
//   POST /scan        -> { address, demo?: bool } -> JSON risk report
//   GET  /scan?address=0x...&demo=1 -> same, for quick browser checks
//
// Env: PORT (default 3000), DEMO_MODE=1 (serve demo data for every scan),
//      RPC_URL (optional override of the public RPC endpoints).

import http from "node:http";
import { demoScan } from "./src/demo-data.mjs";
import { liveScan } from "./src/live.mjs";
import { isValidAddress } from "./src/scan.mjs";

const PORT = Number(process.env.PORT || 3000);
const DEMO_MODE = process.env.DEMO_MODE === "1";

const INFO = {
  agent: "kixbt-shieldscan",
  version: "1.0.0",
  competition: "zkVerify Agent Games — Wildcard (Open Build)",
  handle: "kixbt",
  competitionUserId: "ac0ceb56-99b8-45a7-8809-6f75f322dfea",
  description:
    "Wallet-security scanner agent: checks an Ethereum address for risky token approvals (unlimited allowances, unknown spenders, approvals exceeding balance) and returns a 0-100 risk score with findings and recommendations.",
  endpoints: {
    "GET /": "this info",
    "GET /health": "liveness check",
    "POST /scan": '{ "address": "0x...", "demo": false } -> JSON risk report',
    "GET /scan?address=0x...&demo=1": "same via query string",
  },
  demoMode: DEMO_MODE,
};

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleScan(address, demo, res) {
  if (!address || !isValidAddress(address)) {
    return send(res, 400, { ok: false, error: "address must be a 0x-prefixed 40-hex-char Ethereum address" });
  }
  try {
    const report = demo || DEMO_MODE ? demoScan(address) : await liveScan(address);
    return send(res, 200, { ok: true, ...report });
  } catch (e) {
    return send(res, 502, { ok: false, error: `scan failed: ${e.message}` });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, INFO);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/scan") {
      return handleScan(url.searchParams.get("address"), url.searchParams.get("demo") === "1", res);
    }
    if (req.method === "POST" && url.pathname === "/scan") {
      const body = await readBody(req);
      return handleScan(body.address, body.demo === true, res);
    }
    return send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    return send(res, 400, { ok: false, error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`kixbt-shieldscan listening on port ${PORT} (demoMode=${DEMO_MODE})`);
});
