# Prerequisites — Privy Setup

## 1. Create a Privy App

1. Go to [dashboard.privy.io](https://dashboard.privy.io) and create a new app
2. Copy **App ID** and **App Secret** → add to `.env`:
   ```
   PRIVY_APP_ID=<your-app-id>
   PRIVY_APP_SECRET=<your-app-secret>
   ```

## 2. Enable TEE Execution

Required for Stellar (Tier 2) and all server-side signing:

> Dashboard → Your App → Wallets → Execution environments → **Enable TEE**

Without TEE, `rawSign` will fail for Stellar wallets with an authorization error.

## 3. Generate an Authorization Key

The Authorization Key is a P-256 keypair that your server uses to sign Privy API
requests — eliminating any user OTP or interactive approval.

**Option A — Privy Dashboard (recommended):**
> Dashboard → Your App → Wallets → Authorization keys → **New key**

Copy the displayed `wallet-auth:...` private key.

**Option B — CLI:**
```bash
pnpm keygen
```

Add to `.env`:
```
PRIVY_AUTHORIZATION_PRIVATE_KEY=wallet-auth:<base64-PKCS8-DER>
```

Register the **public key** shown in step A or output by `pnpm keygen` in the Dashboard.

## 4. Authorization Key Pattern

```
┌─────────────────────────────────────────────┐
│  Your Server                                │
│                                             │
│  P-256 private key ──► signs every request  │
│  P-256 public key  ──► wallet OWNER         │
└──────────────┬──────────────────────────────┘
               │  HTTPS + privy-authorization-signature
               ▼
┌─────────────────────────────────────────────┐
│  Privy TEE                                  │
│                                             │
│  Verifies signature → executes rawSign      │
│  Stellar private key NEVER leaves TEE       │
└─────────────────────────────────────────────┘
```

No user. No OTP. No interactive approval at any step.

## 5. Defindex API Key

Request an API key from the Defindex team. Add to `.env`:
```
DEFINDEX_API_KEY=<your-key>
```

## 6. Minimum Balances (mainnet)

| Asset | Minimum | Purpose |
|---|---|---|
| ETH (Base) | 0.0005 ETH | Gas for USDC approve + swap |
| USDC (Base) | ≥ bridge amount | Bridge amount |
| XLM (Stellar) | 3 XLM | Account reserve + fees |

## 7. Environment Variables Summary

```bash
# Required for all examples
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_AUTHORIZATION_PRIVATE_KEY=   # wallet-auth:<base64>

# Required for deposit/withdraw examples
DEFINDEX_API_KEY=

# Required for 06-full-bridge.ts (mainnet) only
STELLAR_SERVER_KEY=   # Stellar secret key with ≥ 5 XLM (sponsors Privy Stellar wallet)
BASE_RPC_URL=https://mainnet.base.org
```
