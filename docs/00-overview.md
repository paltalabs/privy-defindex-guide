# Privy + Stellar + Defindex — Integration Guide

End-to-end reference for integrating Defindex vaults on Stellar using Privy server wallets.
Covers wallet creation, deposit, withdraw, withdraw-shares, and full Base→Stellar bridging.

---

## Quick Navigation

| Document | What it covers |
|---|---|
| [01-prerequisites.md](./01-prerequisites.md) | Privy dashboard setup, TEE, authorization key |
| [02-stellar-wallet.md](./02-stellar-wallet.md) | Create Stellar wallet, fund XLM, USDC trustline |
| [03-evm-wallet.md](./03-evm-wallet.md) | Create EVM wallet on Base, send transactions |
| [04-bridge.md](./04-bridge.md) | Sodax bridge: Base USDC → Stellar USDC |
| [05-deposit.md](./05-deposit.md) | Deposit into Defindex vault (Soroban XDR + rawSign) |
| [06-withdraw.md](./06-withdraw.md) | Withdraw by underlying amount |
| [07-withdraw-shares.md](./07-withdraw-shares.md) | Withdraw by vault shares (percentage redemption) |
| [08-gotchas.md](./08-gotchas.md) | Known issues and their fixes |
| [09-ownership-patterns.md](./09-ownership-patterns.md) | 4 ownership models: Auth Key, User Owner, 2-of-2 Quorum, Signer+Policy |

---

## Architecture Overview

```
[Base EVM Wallet — Privy Tier 3]
       │
       │  1. USDC allowance + swap intent
       ▼
[Sodax Spoke Contract — Base]
       │
       │  Relayer picks up intent
       ▼
[Sodax Hub — Sonic Chain]
       │
       │  Solver fills intent → SOLVED
       ▼
[Stellar — USDC SAC]
       │
       │  Poll Horizon until confirmed
       ▼
[Defindex Vault — Soroban]
       │
       │  API builds unsigned XDR
       │  Privy rawSign → DecoratedSignature
       │  POST /send
       ▼
[Vault shares issued to Stellar wallet]
```

---

## Chain Tier Reference

| Chain | Privy Tier | Signing | Broadcast |
|---|---|---|---|
| Base (EVM) | 3 | Handled by Privy | Privy |
| Stellar | 2 | `rawSign` only | Caller via Horizon |

Stellar is Tier 2 — all transaction construction and broadcasting are the caller's
responsibility. The Privy TEE only provides Ed25519 signing.

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

// Decimal reference
XLM/USDC on Stellar: 7 decimals → 1 token = 10_000_000 stroops
USDC on Base:        6 decimals → 1 USDC  = 1_000_000
```

---

## Runnable Examples

```bash
pnpm install
cp .env.example .env
# Fill in: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY, DEFINDEX_API_KEY

pnpm example:base          # Create EVM wallet + send tx
pnpm example:stellar       # Create Stellar wallet + send payment
pnpm example:deposit       # Deposit into Defindex vault (testnet)
pnpm example:withdraw      # Withdraw by amount (testnet)
pnpm example:withdraw-shares  # Withdraw by shares (testnet)
pnpm example:bridge        # Full mainnet flow
```

---

## Defindex API Base URL

```
https://api.defindex.io
```

All endpoints require: `Authorization: Bearer <DEFINDEX_API_KEY>`
