# privy-defindex-guide

Integration guide and runnable examples for depositing, withdrawing, and bridging assets
into [Defindex](https://defindex.io) vaults on Stellar using [Privy](https://privy.io)
server wallets — with zero user interaction (Authorization Key pattern).

---

## What's in this repo

| Path | Description |
|---|---|
| `docs/` | Step-by-step integration guides (prerequisites → deposit → withdraw → bridge) |
| `src/wallets/` | Reusable wallet modules (EVM, Stellar, Defindex) |
| `src/examples/` | 6 runnable scripts covering every operation |
| `src/shared/` | Shared config, Privy client, Sodax bridge service |
| `.claude/skills/privy-defindex.md` | LLM skill file — the complete integration playbook |

---

## Quick Start

```bash
pnpm install
cp .env.example .env
# Fill in: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY, DEFINDEX_API_KEY
```

### Run examples (testnet)

```bash
pnpm example:base           # EVM wallet on Base mainnet
pnpm example:stellar        # Stellar wallet (testnet, auto-funded via Friendbot)
pnpm example:deposit        # Deposit into Defindex XLM vault (testnet)
pnpm example:withdraw       # Withdraw by amount (testnet)
pnpm example:withdraw-shares  # Withdraw by shares / percentage (testnet)
```

### Run full mainnet bridge

```bash
# Also set: STELLAR_SERVER_KEY, BASE_RPC_URL
pnpm example:bridge         # Base USDC → Stellar → Defindex vault (mainnet)
```

---

## Prerequisites

1. [Privy app](https://dashboard.privy.io) — App ID + App Secret
2. TEE enabled: Dashboard → Wallets → Execution environments → Enable TEE
3. Authorization key: Dashboard → Wallets → Authorization keys → New key (or `pnpm keygen`)
4. Defindex API key from the Defindex team

See [docs/01-prerequisites.md](./docs/01-prerequisites.md) for full setup.

---

## Architecture

```
Your Server (P-256 Authorization Key)
       │  signs every request
       ▼
Privy TEE
  ├── Stellar wallet (Tier 2) — rawSign only
  └── EVM wallet    (Tier 3) — full sendTransaction

Defindex API (api.defindex.io)
  ├── POST /vault/{addr}/deposit        → unsigned Soroban XDR
  ├── POST /vault/{addr}/withdraw       → unsigned Soroban XDR
  ├── POST /vault/{addr}/withdraw_shares → unsigned Soroban XDR
  └── POST /send                        → { txHash }
```

All Defindex vault operations follow the same signing flow:
1. POST to Defindex API → get unsigned XDR
2. Parse XDR → hash it
3. `privy.rawSign(walletId, { hash })` → Ed25519 signature
4. Attach `xdr.DecoratedSignature` to envelope
5. POST signed XDR to `/send`

---

## Documentation

| Guide | Topic |
|---|---|
| [01-prerequisites.md](./docs/01-prerequisites.md) | Privy setup, auth key, TEE |
| [02-stellar-wallet.md](./docs/02-stellar-wallet.md) | Wallet creation, XLM funding, USDC trustline |
| [03-evm-wallet.md](./docs/03-evm-wallet.md) | Base EVM wallet, sendTransaction |
| [04-bridge.md](./docs/04-bridge.md) | Sodax bridge: Base → Stellar |
| [05-deposit.md](./docs/05-deposit.md) | Defindex deposit flow |
| [06-withdraw.md](./docs/06-withdraw.md) | Withdraw by amount |
| [07-withdraw-shares.md](./docs/07-withdraw-shares.md) | Withdraw by shares (% redemption) |
| [08-gotchas.md](./docs/08-gotchas.md) | 9 known bugs with root causes and fixes |

---

## Key Vault Addresses

```
Soroswap Earn USDC (mainnet): CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK
XLM vault (testnet):          CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
```

---

## Claude Skill

The `.claude/skills/privy-defindex.md` file is a Claude Code skill — an LLM-optimized
integration playbook. In any Claude Code session within this repository, invoke it with:

```
/privy-defindex
```

The skill covers the complete integration in a format optimized for LLM consumption,
including all critical gotchas, code snippets, and the full bridge flow.
