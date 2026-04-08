# Defindex Withdraw by Shares

Redeem vault shares (dfTokens) directly to receive underlying assets.
This is the "percentage withdrawal" pattern — burn X shares to get X/totalSupply × totalFunds.

---

## When to use this

Use **withdraw by shares** when you want to exit a percentage of your position
(e.g., "redeem 50% of my vault position") or when you want to do a full exit.

For withdrawing a specific token amount, use [withdraw by amount](./06-withdraw.md).

---

## Share Math

Each vault issues dfTokens (shares) when you deposit. When you withdraw:

```
asset_received = shares_to_burn / total_supply × total_managed_funds
```

To calculate shares for a target percentage:
```ts
const userShares = await getUserVaultShares(vaultAddress, userAddress, apiKey, network);
const sharesToRedeem = (userShares * BigInt(percentage)) / 100n;
```

To calculate shares for a target asset amount:
```ts
// GET /vault/{addr}/total_supply and /vault/{addr}/total_managed_funds
const sharesToWithdraw = (totalSupply * targetAmount) / totalManagedFunds;
```

---

## API Call

```
POST https://api.defindex.io/vault/{vaultAddress}/withdraw_shares?network={testnet|mainnet}
Authorization: Bearer <DEFINDEX_API_KEY>
Content-Type: application/json

{
  "shares":      1000000,   // Number of vault shares (dfTokens) to burn
  "caller":      "G...",    // Stellar address of the withdrawer
  "slippageBps": 50         // 0.5% slippage tolerance
}

→ { "xdr": "<unsigned base64 XDR>" }
```

---

## Get User Share Balance

```ts
// GET user's dfToken balance from Defindex API
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/balance?network=testnet&address=${userAddress}`,
  { headers: { Authorization: `Bearer ${defindexApiKey}` } }
);
const json = await response.json();
const shares = BigInt(json.shares ?? json.balance ?? json.dfTokens ?? json.vault_shares);
```

---

## Full Flow

```ts
// 1. Get share balance
const userShares = await getUserVaultShares(vaultAddress, userAddress, apiKey, network);

// 2. Calculate shares to redeem (50% example)
const sharesToRedeem = (userShares * 50n) / 100n;

// 3. Build unsigned XDR
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/withdraw_shares?network=mainnet`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${defindexApiKey}`,
    },
    body: JSON.stringify({
      shares: Number(sharesToRedeem),  // ⚠️ Number, not BigInt
      caller: stellarAddress,
      slippageBps: 50,
    }),
  }
);
const { xdr: unsignedXdr } = await response.json();

// 4. Sign and submit (same as deposit — see docs/05-deposit.md)
```

---

## Helper Functions

```ts
import {
  getUserVaultShares,
  withdrawSharesFromDefindexVault,
} from "../wallets/privy-defindex-wallet.js";

// Get balance
const totalShares = await getUserVaultShares(
  vaultAddress, userAddress, apiKey, "testnet"
);

// Redeem all shares (full exit)
const txHash = await withdrawSharesFromDefindexVault(
  walletId,
  stellarAddress,
  vaultAddress,
  totalShares,     // bigint
  apiKey,
  "testnet"
);
```

---

## Testnet Example

```bash
pnpm example:withdraw-shares
```

Redeems 100% of shares in the testnet XLM vault.
Edit `WITHDRAW_PERCENTAGE` in the file to change the fraction.

---

## Full Exit Pattern

```ts
const shares = await getUserVaultShares(vaultAddress, userAddress, apiKey, network);
if (shares === 0n) return; // nothing to withdraw

const txHash = await withdrawSharesFromDefindexVault(
  walletId, userAddress, vaultAddress, shares, apiKey, network
);
```

Note: Due to rounding, a tiny "dust" amount of shares may remain after a full exit.
See [Defindex Troubleshooting](https://docs.defindex.io/api-integration-guide/troubleshooting)
for the two-step dust recovery pattern.
