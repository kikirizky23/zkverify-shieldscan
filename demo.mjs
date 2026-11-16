// CLI demo / scanner.
//   node demo.mjs                  -> demo report (sample data, no network)
//   node demo.mjs --live 0x...     -> real on-chain scan (public RPC, no key)
//   node demo.mjs --live 0x... --json -> JSON output

import { demoScan, SAMPLE_ADDRESS } from "./src/demo-data.mjs";
import { liveScan } from "./src/live.mjs";
import { formatText } from "./src/report.mjs";
import { isValidAddress } from "./src/scan.mjs";

const args = process.argv.slice(2);
const live = args.includes("--live");
const asJson = args.includes("--json");
const addrArg = args.find((a) => a.startsWith("0x"));

async function main() {
  if (live) {
    if (!addrArg || !isValidAddress(addrArg)) {
      console.error("Usage: node demo.mjs --live 0x<40 hex chars> [--json]");
      process.exit(1);
    }
    const report = await liveScan(addrArg);
    console.log(asJson ? JSON.stringify(report, null, 2) : formatText(report));
  } else {
    const address = addrArg && isValidAddress(addrArg) ? addrArg : SAMPLE_ADDRESS;
    const report = demoScan(address);
    console.log(asJson ? JSON.stringify(report, null, 2) : formatText(report));
    if (!addrArg) {
      console.error("\n(demo mode: sample data for " + SAMPLE_ADDRESS + " — run with --live <address> for a real scan)");
    }
  }
}

main().catch((e) => {
  console.error("Scan failed:", e.message);
  process.exit(1);
});
