# Defindex Withdraw by Amount

Withdraw a specific amount of underlying assets from a Defindex vault.
The signing flow is identical to deposit — only the API endpoint and body differ.

---

## When to use this

Use **withdraw by amount** when you know exactly how many tokens you want to receive
(e.g., "I want 5 USDC back"). The API calculates how many vault shares to burn.

For redeeming a percentage of your position, use [withdraw-shares](./07-withdraw-shares.md).

---

## API Call

```
POST https://api.defindex.io/vault/{vaultAddress}/withdraw?network={testnet|mainnet}
Authorization: Bearer <DEFINDEX_API_KEY>
Content-Type: application/json

{
  "amounts":     [5000000],   // Amount of underlying asset to withdraw (stroops)
  "caller":      "G...",      // Stellar address of the withdrawer
  "slippageBps": 50           // 0.5% slippage tolerance
}

→ { "xdr": "<unsigned base64 XDR>" }
```

---

## Full Flow

The signing steps are identical to deposit. The only difference is the endpoint:

```ts
// Build unsigned XDR
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/withdraw?network=mainnet`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${defindexApiKey}`,
    },
    body: JSON.stringify({
      amounts: [Number(amountStroops)],  // ⚠️ Number[], not string or BigInt
      caller: stellarAddress,
      slippageBps: 50,
    }),
  }
);
const { xdr: unsignedXdr } = await response.json();

// Then: parse XDR → hash → rawSign → DecoratedSignature → POST /send
// (same pattern as deposit — see docs/05-deposit.md)
```

---

## Helper Function

```ts
import { withdrawFromDefindexVault } from "../wallets/privy-defindex-wallet.js";

const txHash = await withdrawFromDefindexVault(
  walletId,
  stellarAddress,
  vaultAddress,
  amountStroops,  // bigint, 7 decimals
  defindexApiKey,
  "testnet"       // or "mainnet"
);
```

---

## Testnet Example

```bash
pnpm example:withdraw
```

Withdraws 0.5 XLM from the testnet XLM vault.

---

## Decimal Reference

```
XLM:  7 decimals → 1 XLM  = 10_000_000 stroops
USDC: 7 decimals → 1 USDC = 10_000_000 stroops  (on Stellar)
```

---

## Withdraw vs Withdraw-Shares

| | Withdraw by Amount | Withdraw by Shares |
|---|---|---|
| Input | Token amount | Share count |
| Use when | You know how much to get | You want % of position |
| API endpoint | `/vault/{addr}/withdraw` | `/vault/{addr}/withdraw_shares` |
| API calculates | Shares to burn | Assets to return |
