---
name: privy-defindex
description: End-to-end playbook for integrating Defindex vaults on Stellar using Privy server wallets. Covers wallet creation (Tier 2 Stellar + Tier 3 EVM), deposit, withdraw, withdraw-shares, and full Base→Stellar bridging via Sodax. Use when building Privy + Defindex integrations or answering questions about the Privy/Stellar/Defindex stack.
---

# Privy + Stellar + Defindex Integration Playbook

## When to use this skill

- Building server-side wallet automation with Privy on Stellar or Base
- Implementing Defindex vault deposit, withdraw, or withdraw-shares
- Bridging USDC from Base to Stellar via Sodax for Defindex deposits
- Answering questions about the Privy Authorization Key pattern

---

## Architecture Overview

```
Privy TEE (Trusted Execution Environment)
  ├── Stellar wallet (Tier 2) — rawSign only, caller handles XDR + Horizon
  └── EVM wallet   (Tier 3) — full sendTransaction, Privy handles gas + broadcast

Authorization Key Pattern (server-side automation, zero OTP):
  P-256 private key → signs every Privy API request
  P-256 public key  → registered as wallet OWNER in Privy Dashboard
  → No user interaction, no OTP, no email confirmation required

Defindex API (api.defindex.io):
  POST /vault/{addr}/deposit        → unsigned XDR
  POST /vault/{addr}/withdraw       → unsigned XDR
  POST /vault/{addr}/withdraw_shares → unsigned XDR
  POST /send                        → { txHash }
  All endpoints: Authorization: Bearer <DEFINDEX_API_KEY>
```

---

## Prerequisites

1. Privy app at dashboard.privy.io → copy App ID + App Secret
2. Enable TEE: Dashboard → Wallets → Execution environments → Enable TEE
3. Authorization key: Dashboard → Wallets → Authorization keys → New key
   OR run `pnpm keygen` (generates P-256 keypair locally)
4. Defindex API key from the Defindex team

---

## Key Constants

```ts
// Stellar mainnet
SOROSWAP_EARN_USDC_VAULT = "CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK"
USDC_SAC                 = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
USDC_ISSUER              = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

// Stellar testnet
XLM_VAULT_TESTNET        = "CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6"

// Base mainnet
USDC_BASE                = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  // 6 decimals

// Decimals
Stellar (XLM, USDC SAC): 7 decimals = 1 token = 10_000_000 stroops
Base USDC:               6 decimals = 1 USDC  = 1_000_000
```

---

## Step-by-step: Create Stellar Wallet (Tier 2)

```ts
import crypto from "crypto";
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({ appId, appSecret });

// Derive public key from private key (no need to store it separately)
function derivePublicKey(privKeyStr: string): string {
  const base64Der = privKeyStr.replace(/^wallet-auth:/, "");
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(base64Der, "base64"), format: "der", type: "pkcs8" });
  const publicKey = crypto.createPublicKey(privateKey);
  return Buffer.from(publicKey.export({ type: "spki", format: "der" })).toString("base64");
}

const authorizationPublicKey = derivePublicKey(authorizationPrivateKey);

// Create wallet (idempotent — repeated calls return the same wallet)
const wallet = await privy.wallets().create({
  chain_type: "stellar",
  owner: { public_key: authorizationPublicKey },
  idempotency_key: "my-app-stellar-wallet-v1",
});
// wallet.address = G... Stellar public key
// wallet.id      = Privy wallet ID (needed for rawSign calls)
```

---

## Step-by-step: Privy rawSign Pattern (Tier 2 Core)

This pattern is identical for ALL Stellar transactions (payment, trustline, deposit, withdraw):

```ts
import { TransactionBuilder, Networks, Keypair, xdr } from "@stellar/stellar-base";

// 1. Build transaction (any operation)
const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.PUBLIC })
  .addOperation(someOperation)
  .setTimeout(30)
  .build();

// 2. Hash → format for Privy
const txHashHex = "0x" + Buffer.from((tx as any).hash()).toString("hex");

// 3. Raw-sign via Privy TEE
const signResult = await privy.wallets().rawSign(walletId, {
  params: { hash: txHashHex },
  authorization_context: { authorization_private_keys: [authorizationPrivateKey] },
} as any);

// 4. Normalize signature (handles ALL known Privy SDK response shapes — CRITICAL)
const signatureHex: string =
  signResult?.data?.signature ?? signResult?.signature ?? (signResult as unknown as string);

// 5. Attach DecoratedSignature
const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
(tx as any).signatures.push(
  new xdr.DecoratedSignature({
    hint: Keypair.fromPublicKey(walletAddress).signatureHint(),
    signature: signatureBytes,
  })
);

// 6. Submit to Horizon (or to Defindex /send for vault operations)
const envelopeXdr = (tx as any).toEnvelope().toXDR("base64");
```

---

## Step-by-step: Deposit into Defindex Vault

```ts
// 1. POST to Defindex API → get unsigned XDR
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/deposit?network=mainnet`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      amounts: [Number(amountStroops)],  // ⚠️ MUST be Number[], never string or BigInt
      caller: stellarAddress,
      invest: true,
      slippageBps: 50,
    }),
  }
);
const { xdr: unsignedXdr } = await response.json();

// 2. Parse XDR, hash, rawSign, attach DecoratedSignature
//    (same as rawSign pattern above — just parse the XDR instead of building)
const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC);
// ... rawSign → attach → ...

// 3. POST signed XDR to /send
const submitRes = await fetch(`https://api.defindex.io/send?network=mainnet`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ xdr: signedXdr }),
});
const { txHash } = await submitRes.json();
```

---

## Step-by-step: Withdraw by Amount

Same flow as deposit, different endpoint and body:

```ts
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/withdraw?network=mainnet`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      amounts: [Number(amountStroops)],  // ⚠️ Number[], not string
      caller: stellarAddress,
      slippageBps: 50,
    }),
  }
);
// Then: same XDR → hash → rawSign → DecoratedSignature → POST /send
```

---

## Step-by-step: Withdraw by Shares (Percentage Redemption)

```ts
// 1. Get user's share balance
const balRes = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/balance?network=mainnet&address=${userAddress}`,
  { headers: { Authorization: `Bearer ${apiKey}` } }
);
const json = await balRes.json();
const totalShares = BigInt(json.shares ?? json.balance ?? json.dfTokens ?? json.vault_shares);

// 2. Calculate shares to redeem (50% example)
const sharesToRedeem = (totalShares * 50n) / 100n;

// 3. POST to withdraw_shares
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/withdraw_shares?network=mainnet`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      shares: Number(sharesToRedeem),  // ⚠️ Number, not BigInt
      caller: stellarAddress,
      slippageBps: 50,
    }),
  }
);
// Then: same XDR → hash → rawSign → DecoratedSignature → POST /send
```

Share math: `asset_received = shares_burned / total_supply × total_managed_funds`

---

## Step-by-step: Full Bridge (Base → Stellar → Defindex)

```ts
// 1. EVM wallet (Tier 3 — Privy handles gas + broadcast)
const evmWallet = await privy.wallets().create({ chain_type: "ethereum", owner, idempotency_key });

// 2. Stellar wallet (Tier 2 — rawSign only)
const stellarWallet = await privy.wallets().create({ chain_type: "stellar", owner, idempotency_key });

// 3. Sodax bridge (Base USDC → Stellar USDC)
const sodax = new Sodax();
await sodax.initialize();
// PrivyEvmSodaxAdapter implements IEvmWalletProvider (see src/shared/privy-evm-sodax-adapter.ts)
// Key: convert BigInt value to hex string before Privy sendTransaction (BigInt not JSON-serializable)
const { srcTxHash, statusHash } = await bridgeService.executeSwap(privyAdapter, params, quote);
const { destTxHash, amountReceived } = await bridgeService.pollStatus(statusHash);

// 4. ⚠️ CRITICAL: Wait for USDC to confirm on Stellar before depositing
//    Sodax marks SOLVED on Hub (Sonic) BEFORE Stellar tx lands
//    Use Horizon, NOT Soroban RPC (xdr.AccountId missing + RPC unreliable)
for (let i = 0; i < 36; i++) {
  const bal = await getHorizonUsdcBalance(stellarAddress); // Horizon /accounts/{addr}
  if (bal >= amountReceived) break;
  await sleep(10_000);
}

// 5. Deposit into Defindex vault
await depositToDefindexVault(stellarWallet.id, stellarWallet.address, vaultAddress, amountReceived, apiKey, "mainnet");
```

---

## Critical Gotchas (Top 5)

1. **`amounts` must be `Number[]`** — the Defindex API rejects string or BigInt values
2. **rawSign response shape varies** — always use triple fallback:
   `signResult?.data?.signature ?? signResult?.signature ?? signResult`
3. **Privy BigInt serialization** — convert `value` to `"0x" + BigInt(n).toString(16)` before `sendTransaction`
4. **SOLVED ≠ Stellar confirmed** — Sodax marks SOLVED on Sonic Hub before Stellar tx lands; poll Horizon
5. **TEE must be enabled** — `rawSign` on Stellar wallets fails silently without TEE enabled in Privy Dashboard

---

## File Map

```
src/
├── shared/
│   ├── config.ts                   All env vars + vault/token constants
│   ├── privy-client.ts             PrivyClient singleton + buildAuthContext() + derivePublicKey()
│   ├── privy-evm-sodax-adapter.ts  IEvmWalletProvider impl for Sodax bridge
│   ├── sodax.ts                    initializeSodax() + handleAllowance() + sleep/formatError
│   ├── sodax-service.ts            SodaxBridgeService (quote/swap/poll)
│   └── bridge-types.ts             SwapParams, BridgeQuote, BridgeToken, etc.
├── wallets/
│   ├── privy-base-wallet.ts        EVM: create, balance, sendTransaction
│   ├── privy-stellar-wallet.ts     Stellar: create, fund, trustline, rawSign+broadcast
│   └── privy-defindex-wallet.ts    depositToDefindexVault() + withdrawFromDefindexVault()
│                                   + withdrawSharesFromDefindexVault() + getUserVaultShares()
└── examples/
    ├── 01-base-wallet.ts           Create EVM wallet + send tx
    ├── 02-stellar-wallet.ts        Create Stellar wallet + payment
    ├── 03-deposit.ts               Deposit into Defindex vault (testnet)
    ├── 04-withdraw.ts              Withdraw by amount (testnet)
    ├── 05-withdraw-shares.ts       Withdraw by shares (testnet)
    └── 06-full-bridge.ts           Full mainnet flow (Base → Stellar → Defindex)
```

---

## Dependencies

```json
{
  "@privy-io/node": "^0.11.0",
  "@sodax/sdk": "1.2.7-beta",
  "@sodax/types": "^1.2.7-beta",
  "@stellar/stellar-base": "^12.1.1",
  "ethers": "^6.13.0"
}
```

Use `@privy-io/node` (NOT `@privy-io/server-auth` — deprecated).
Use `@stellar/stellar-base` (NOT `@stellar/stellar-sdk` — `stellar-base` is lighter and has all needed primitives).
