// Curated mainnet token + spender lists used by the live scan.
// All addresses are well-known public mainnet contracts. No secrets here.

export const TOKENS = [
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { symbol: "UNI",  address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  { symbol: "AAVE", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
];

// Spenders the agent recognises as legitimate, widely-used protocols.
// Any approval to an address NOT on this list is flagged as "unknown spender".
export const KNOWN_SPENDERS = [
  { address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", label: "Uniswap V2 Router" },
  { address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", label: "Uniswap V3 SwapRouter" },
  { address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", label: "Uniswap Universal Router" },
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", label: "Uniswap Permit2" },
  { address: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", label: "OpenSea Seaport 1.5" },
  { address: "0x111111125421cA6dc452d289314280a0f8842A65", label: "1inch Aggregation Router v6" },
  { address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", label: "Aave V3 Pool" },
];

export const tokenByAddress = (addr) => {
  const a = addr.toLowerCase();
  return TOKENS.find((t) => t.address.toLowerCase() === a) || null;
};

export const spenderLabel = (addr) => {
  const a = addr.toLowerCase();
  const s = KNOWN_SPENDERS.find((x) => x.address.toLowerCase() === a);
  return s ? s.label : null;
};
