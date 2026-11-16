// Human-readable text report for a scan result (JSON is the raw object).

export function formatText(r) {
  const lines = [];
  const bar = "=".repeat(60);
  lines.push(bar);
  lines.push(`kixbt ShieldScan — wallet security report (${r.mode} mode)`);
  lines.push(bar);
  lines.push(`Address    : ${r.address}`);
  lines.push(`Network    : ${r.network} @ block ${r.blockNumber ?? "?"}`);
  lines.push(`Scanned at : ${r.scannedAt}`);
  lines.push(`ETH balance: ${r.wallet.ethBalance} ETH | tx count: ${r.wallet.txCount ?? "?"} | contract wallet: ${r.wallet.isContract ? "yes" : "no"}`);
  lines.push("");
  lines.push(`RISK SCORE : ${r.riskScore}/100  —  ${r.grade}`);
  lines.push(`Checked    : ${r.summary.tokensChecked} tokens, ${r.summary.allowancesChecked} allowance pairs, ${r.summary.activeApprovals} active approvals (${r.summary.unlimitedApprovals} unlimited, ${r.summary.unknownSpenders} to unknown spenders)`);
  lines.push("");
  if (r.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("Findings:");
    for (const f of r.findings) {
      lines.push("");
      lines.push(`[${f.severity}] ${f.title}`);
      lines.push(`  ${f.detail}`);
      lines.push(`  -> ${f.recommendation}`);
    }
  }
  lines.push("");
  lines.push(bar);
  return lines.join("\n");
}
