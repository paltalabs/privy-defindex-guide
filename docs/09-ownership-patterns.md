# Wallet Ownership Patterns

Privy provides four control models for wallets. The choice defines who can authorize
transactions, how much automation is possible, and what security guarantees are enforced.

---

## Quick Reference

| Pattern | Who signs | User required | Automatable | Use case |
|---|---|---|---|---|
| [1-of-1 Auth Key](#1-authorization-key--1-of-1-server) | Server only | No | Fully | Scripts, yield automation |
| [User Owner](#2-user-owner--1-of-1-user) | User (JWT) | Always | Active session only | Dapps, embedded wallets |
| [2-of-2 Quorum](#3-2-of-2-quorum--user--server) | Both | Always | No | Exchanges, high-value funds |
| [Signer + Policy](#4-signer--policy-delegated-permissions) | Server (within policy) | Setup only | Yes, within limits | Limit orders, subscriptions, delegated yield |

---

## 1. Authorization Key — 1-of-1 server

**The pattern used in this repo.** The server is the sole owner of the wallet.

```ts
const wallet = await privy.wallets().create({
  chain_type: "stellar",
  owner: { public_key: authorizationPublicKey },  // server P-256 key
  idempotency_key: "...",
});
```

Signing only requires `authorization_private_keys`:

```ts
const signResult = await privy.wallets().rawSign(walletId, {
  params: { hash: txHashHex },
  authorization_context: {
    authorization_private_keys: [authorizationPrivateKey],
  },
});
```

**When to use:**
- Yield automation with no user in the loop (protocol-owned or operator-owned funds)
- Server scripts and cron jobs
- Operator assumes full custodial responsibility

**Risk:** if the server is compromised, nothing stops unauthorized transactions.

---

## 2. User Owner — 1-of-1 user

The user is the sole owner. The server can operate the wallet from the backend, but
**requires the user's JWT on every request**. Privy verifies the user is authenticated.

```ts
// Create wallet with user as owner
const wallet = await privy.wallets().create({
  chain_type: "ethereum",
  owner: { user_id: "did:privy:xxxxx" },
});

// Server needs the user's active JWT for each operation
const authorizationContext = {
  user_jwts: ["insert-user-jwt"],
};
```

**Flow:**
```
Frontend (authenticated user)
  │  1. Obtains session JWT
  │  2. Sends JWT to backend
  ▼
Backend (server)
  │  3. POST /v1/wallets/authenticate { user_jwt }
  │     → Privy returns ephemeral user key
  │  4. Signs the request with that user key
  │  5. Executes the transaction
```

**When to use:**
- Self-custodial wallets for end users
- User must be active and aware of every operation
- Maximum user sovereignty, minimal legal liability for the operator

---

## 3. 2-of-2 Quorum — user + server

A `key quorum` with `authorization_threshold: 2`. Both parties must sign every request.
Neither the user alone nor the server alone can move funds.

```ts
// 1. Create the quorum
const keyQuorum = await privy.keyQuorums().create({
  display_name: "2-of-2 quorum for user did:privy:xxxxx",
  public_keys: ["insert-server-authorization-public-key"],
  user_ids: ["did:privy:xxxxx"],
  authorization_threshold: 2,
});

// 2. Create wallet owned by the quorum
const wallet = await privy.wallets().create({
  chain_type: "ethereum",
  owner_id: keyQuorum.id,
});
```

**Transaction flow:**
```
Client                          Server                        Privy API
  │                                │                               │
  │  1. Build request payload      │                               │
  │  2. Sign with user key         │                               │
  │     (useAuthorizationSignature)│                               │
  │                                │                               │
  │──── payload + userSignature ──►│                               │
  │                                │  3. Sign with server key      │
  │                                │──── both signatures ─────────►│
  │                                │◄─── response ─────────────────│
```

```ts
// On the server: combine both signatures
headers: {
  "privy-authorization-signature": `${userSignature},${serverSignature}`
}
```

**When to use:**
- High-value user funds (exchanges, trading platforms)
- Strict compliance requirements (no unilateral action by any party)
- Protection against rogue employee attacks

---

## 4. Signer + Policy — delegated permissions

**The most powerful pattern for production Defindex integrations.**

The user is the wallet owner, but delegates permissions to the server as a `signer`
within the bounds of a **policy**. The server can sign automatically, but only the
operations the policy permits.

```ts
// 1. Create a policy with restrictions
const policy = await privy.policies().create({
  name: "Defindex deposit — max 100 USDC/day",
  rules: [
    {
      type: "transaction_limit",
      max_amount: "100000000",  // in stroops
      window: "daily",
    },
    {
      type: "approved_contracts",
      contracts: ["CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK"],
    },
  ],
});

// 2. Create wallet with user as owner and server as scoped signer
const wallet = await privy.wallets().create({
  chain_type: "stellar",
  owner: { user_id: "did:privy:xxxxx" },
  signers: [
    {
      public_key: serverAuthorizationPublicKey,
      policy_ids: [policy.id],
    },
  ],
});

// 3. Server signs without requiring the user (within policy limits)
const signResult = await privy.wallets().rawSign(walletId, {
  params: { hash: txHashHex },
  authorization_context: {
    authorization_private_keys: [serverAuthorizationPrivateKey],
  },
});
```

**When to use:**
- User deposits into a Defindex vault and delegates rebalancing to the protocol
- Recurring payments with user-approved spending limits
- Limit orders executed by the server when price conditions are met
- DCA (Dollar Cost Averaging) automated within a pre-approved range

**Key difference vs 1-of-1 Auth Key:**
- Auth Key: the server can do anything, no limits
- Signer + Policy: the server can only do what the user approved when setting up the policy

---

## Decision tree

```
Are the funds owned by the protocol or operator?
  └─► YES → Authorization Key (1-of-1)

Are the funds owned by the user?
  └─► Should the user approve EVERY transaction?
        ├─► YES + highest security needed → 2-of-2 Quorum
        ├─► YES + manual operations → User Owner
        └─► NO, user wants automation with limits → Signer + Policy  ← best for Defindex
```

---

## Applying this to Privy + Defindex

For a yield management app where **users deposit their own funds** into Defindex and
want automation (rebalancing, compounding, reinvestment), the recommended flow is:

1. User creates their Stellar wallet via Privy embedded wallet (React SDK)
2. User approves a policy: "Allow the server to deposit up to X USDC/day into vault Y"
3. The server operates automatically (cron job, price trigger, etc.) within that policy
4. The user can revoke the signer at any time from the app

This combines **Web2 UX** (user does not sign every operation) with **Web3 guarantees**
(the server can never exceed the limits the user explicitly approved).
