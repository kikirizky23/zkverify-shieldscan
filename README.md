# kixbt ShieldScan — Wallet-Security Scanner Agent

**zkVerify Agent Games — Wildcard (Open Build) entry.**
Handle `kixbt`, competition user id `ac0ceb56-99b8-45a7-8809-6f75f322dfea`,
EVM wallet `0x5750068FB2e240015993D4d06e4dA7Dc3BA0100A`.

Give ShieldScan any Ethereum address and it tells you, in seconds, whether
that wallet is one bad signature away from being drained — and exactly what
to revoke. No API key, no signup, no private key ever involved: it only
reads public on-chain data.

## Why this idea (and why it fits Wildcard judging)

Wildcard is judged by a panel on usefulness, real-world value and
demonstrability — not on fitting a narrow event spec. Wallet security is
the most concrete, demonstrable Web3-agent problem there is:

- **Useful & real:** unlimited token approvals are the #1 way wallets get
  drained (approval phishing). Every DeFi user has them and almost nobody
  audits them. ShieldScan finds them with live on-chain data and tells the
  user exactly what to revoke, where.
- **Demonstrable in 10 seconds:** one HTTP call or CLI command returns a
  0–100 risk score with named findings and recommendations. The demo mode
  works with zero network, so judges can run it anywhere.
- **Honest engineering:** zero dependencies, pure-function scoring engine
  (fully unit-tested), public no-key RPC endpoints with retry + fallback,
  and a fail-open design — if log discovery fails, the curated checks
  still run and the report says so. Nothing is faked: the demo data is
  explicitly labelled sample data.

Related work by the same author: `kixbt-gatekeeper` (Proof Gatekeeper) and
`kixbt-steal` (Steal the VFY), repo
https://github.com/kikirizky23/zkverify-gatekeeper. ShieldScan is a
separate project — a different agent for a different problem.

## What it checks (live mode)

For a given address, on Ethereum mainnet via public JSON-RPC:

1. **ETH balance, tx count, wallet type** (`eth_getBalance`,
   `eth_getTransactionCount`, `eth_getCode`) — including EIP-7702
   delegation detection (`0xef01…` code).
2. **Token balances** for 8 widely-held tokens (USDC, USDT, DAI, WETH,
   WBTC, UNI, LINK, AAVE) via `balanceOf`.
3. **Allowances** for every watched token × 7 well-known protocol
   spenders (Uniswap V2/V3/Universal Router, Permit2, OpenSea Seaport 1.5,
   1inch v6, Aave V3 Pool) — 56 `allowance()` calls, batched.
4. **Approval events** (`eth_getLogs`, last ~20,000 blocks) for the
   address as owner — catches approvals to spenders/tokens *outside* the
   curated lists.

## Scoring (0–100)

| Finding | Points | Severity |
|---|---|---|
| Unlimited approval (`2^256-1`) to any spender | +35 each | HIGH |
| Approval to an unrecognised spender | +20 each | MEDIUM |
| Approval to an unlisted token (found via logs) | +15 each | MEDIUM |
| Approval exceeding current balance | +10 each | LOW |
| Contract wallet / EIP-7702 delegation | +0 | INFO |

Grade: 0–19 LOW, 20–49 MEDIUM, 50–74 HIGH, 75–100 CRITICAL.

## Run

```bash
node demo.mjs                                  # demo report (sample data, no network)
node demo.mjs --live 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
node demo.mjs --live 0x... --json              # JSON output
PORT=3000 node server.mjs                      # HTTP server
npm test                                       # harness — must print ALL PASS
```

HTTP API:

```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/scan \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}'
# GET /scan?address=0x...&demo=1 also works
```

Response: `{ ok, agent, address, riskScore, grade, findings[], summary, wallet, ... }`.
Each finding has `severity`, `code`, `title`, `detail`, `recommendation`.

## Example output

Demo report (`examples/sample-report.txt`, sample data — score 90/100 CRITICAL):

```text
RISK SCORE : 90/100  —  CRITICAL
Checked    : 8 tokens, 57 allowance pairs, 4 active approvals (2 unlimited, 1 to unknown spenders)

[HIGH] Unlimited USDC approval to Uniswap V3 SwapRouter
  USDC allowance is 2^256-1 (unlimited) for spender 0xE592427A0AEce92De3Edee1F18E0157C05861564 ...
  -> Revoke or cap this approval (e.g. revoke.cash or Etherscan Token Approvals) ...

[MEDIUM] WETH approved to an unrecognised spender
  Spender 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed is not on the known-protocol list ...
```

Real live scan, 2026-11-16, `0xd8dA…96045` (vitalik.eth) —
`examples/live-report-vitalik.json`: **score 70/100 HIGH** — unlimited USDT
approval to Uniswap V3 SwapRouter, unlimited DAI approval to Permit2, plus
an EIP-7702 delegation note. That is genuine mainnet data, not sample data.

## Tests

```bash
npm test   # node test/harness.mjs — 91 assertions, offline, deterministic
```

Coverage: address validation, ABI encoding/decoding, scoring rules and
grade boundaries, demo determinism, report formatting, and a live HTTP
server smoke test (spawned on a test port in `DEMO_MODE=1`).
**Result: 91/91 PASS.** The live RPC path is exercised separately by
`node demo.mjs --live <address>` (see `examples/live-report-vitalik.json`).

## Deploy (Railway)

Same pattern as the existing `kixbt-gatekeeper` agent (Node 22, `$PORT`,
no build step, zero dependencies):

1. Create a new GitHub repo (e.g. `zkverify-shieldscan`) and push this
   directory. (Do **not** reuse the gatekeeper repo — this is a separate
   agent with its own service and endpoint.)
2. Railway → New Project → Deploy from GitHub repo.
3. No environment variables are required. Optional: `RPC_URL` to override
   the default public endpoints; `DEMO_MODE=1` only for testing.
4. `railway.json` is included: Nixpacks build, `node server.mjs` start
   command, `/health` healthcheck.
5. Verify: `curl <railway-url>/health` → `{"ok":true}`, then
   `POST <railway-url>/scan` with an address → JSON risk report.

## Submit (Agent Games dashboard — manual step, not done by the agent)

1. Deploy to Railway and copy the public endpoint URL.
2. Go to https://agentgames.zkverify.io/events → Wildcard (Open Build) →
   submit before **21 Nov 2026 22:00 UTC**.
3. Submit: agent name `kixbt-shieldscan`, endpoint URL, repo link, and a
   short description (use the "Why this idea" section above). Judging is
   22–30 Nov 2026; prize 50,000 VFY for the award, 25,000 VFY each for
   two honourable mentions.

## Files

| File | What it is |
|---|---|
| `server.mjs` | HTTP server: `GET /`, `/health`, `GET/POST /scan`. |
| `demo.mjs` | CLI: demo mode (default) or `--live <address>` real scan. |
| `src/scan.mjs` | Pure scoring engine (no I/O): validation, ABI helpers, `analyze()`. |
| `src/live.mjs` | Live on-chain scan via public JSON-RPC. |
| `src/rpc.mjs` | JSON-RPC client: default endpoints, retry, batch + per-call fallback. |
| `src/tokens.mjs` | Curated mainnet tokens + known protocol spenders. |
| `src/demo-data.mjs` | Deterministic sample data for demo mode (labelled as such). |
| `src/report.mjs` | Human-readable text report formatter. |
| `test/harness.mjs` | 91-assertion test harness (offline). |
| `examples/sample-report.txt` / `.json` | Demo-mode example output. |
| `examples/live-report-vitalik.json` | Real live scan of a public address, 2026-11-16. |
| `railway.json` / `.env.example` | Railway deploy config / optional env vars. |

## Security notes

- Read-only: the agent never signs, never sends a transaction, and never
  asks for a private key, seed phrase or password. There are no secrets in
  this repo (no API key is needed at all).
- Findings are advisory: an "unknown spender" is not proof of malice, and
  a clean scan is not proof of safety — it only covers the watched
  tokens/spenders plus recent on-chain Approval events.
