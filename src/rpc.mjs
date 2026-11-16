// Minimal JSON-RPC client over public, no-key Ethereum endpoints.
// Default: https://ethereum.publicnode.com, fallback https://eth.drpc.org
// (both verified reachable 2026-11-16). Override with RPC_URL env var.
// No API key is ever needed; no secrets are sent anywhere.

export const DEFAULT_RPCS = [
  "https://ethereum.publicnode.com",
  "https://eth.drpc.org",
];

const TIMEOUT_MS = 15000;

async function postJson(url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Single JSON-RPC call, trying each endpoint in order until one answers.
export async function rpcCall(method, params, rpcUrls = null) {
  const urls = rpcUrls || (process.env.RPC_URL ? [process.env.RPC_URL] : DEFAULT_RPCS);
  let lastErr = null;
  for (const url of urls) {
    try {
      const json = await postJson(url, { jsonrpc: "2.0", id: 1, method, params });
      if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`All RPC endpoints failed for ${method}: ${lastErr?.message || lastErr}`);
}

// Batch JSON-RPC calls in one HTTP request (eth_call batching).
// Tries each endpoint; retries the first endpoint once after a short
// delay (public RPCs rate-limit transiently). If every batched attempt
// fails, falls back to one call at a time (slow but reliable) — some
// free endpoints (e.g. drpc.org) reject batches of >3 requests.
export async function rpcBatch(calls, rpcUrls = null) {
  const urls = rpcUrls || (process.env.RPC_URL ? [process.env.RPC_URL] : DEFAULT_RPCS);
  const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c.method, params: c.params }));
  let lastErr = null;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const json = await postJson(url, body);
        const arr = Array.isArray(json) ? json : [json];
        return arr.map((r) => {
          if (r.error) throw new Error(`RPC error: ${JSON.stringify(r.error)}`);
          return r.result;
        });
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  // Last resort: individual calls (works even where batches are capped).
  try {
    const out = [];
    for (const c of calls) out.push(await rpcCall(c.method, c.params, urls));
    return out;
  } catch (e) {
    throw new Error(`All RPC endpoints failed for batch: ${lastErr?.message || lastErr} (fallback: ${e.message})`);
  }
}
