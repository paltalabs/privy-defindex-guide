# POC Roadmap — Privy + Defindex Ownership Patterns

Each POC demonstrates one ownership model applied to a Defindex vault operation on Stellar.
Priority order: Signer+Policy → 2-of-2 Quorum → User Owner → Auth Key extensions.

See [docs/09-ownership-patterns.md](./docs/09-ownership-patterns.md) for the full pattern reference.

---

## Priority 1 — Signer + Policy (delegated server automation)

> User owns the wallet. User approves a policy once. Server operates automatically within limits.
> This is the production pattern for yield management apps.

### POC A — Policy creation + signer registration

- [ ] Research Privy policy API: available rule types for Stellar (amount limits, contract allowlist, time windows)
- [ ] `src/shared/privy-policy.ts` — `createDefindexDepositPolicy(vaultAddress, maxAmountStroops, windowType)` helper
- [ ] `src/shared/privy-signer.ts` — `addServerSignerToWallet(walletId, serverPublicKey, policyId)` helper
- [ ] `src/examples/07-signer-setup.ts` — full setup: create user wallet → create policy → add server signer
- [ ] `docs/10-signer-policy.md` — guide: policy creation, signer registration, policy rule types

### POC B — Automated deposit within policy

- [ ] `src/examples/08-signer-deposit.ts`:
  - Server signs deposit using `authorization_private_keys` (same as Auth Key)
  - Privy TEE enforces policy limits before executing `rawSign`
  - Demonstrate that amount over policy limit is rejected by Privy
- [ ] Add test case: attempt to deposit above policy limit → verify rejection
- [ ] `docs/10-signer-policy.md` — add section: how policy enforcement works server-side

### POC C — Automated withdraw within policy

- [ ] Extend policy to include withdraw operations on the same vault
- [ ] `src/examples/09-signer-withdraw.ts` — server-triggered withdraw (withdraw by shares, % of position)
- [ ] Demonstrate daily limit reset: deposit + withdraw within window, then verify limit enforcement

### POC D — Policy revocation by user

- [ ] `src/examples/10-signer-revoke.ts` — user removes the server signer from their wallet
- [ ] Document: what happens to pending operations after revocation
- [ ] `docs/10-signer-policy.md` — add section: revocation flow

---

## Priority 2 — 2-of-2 Quorum (user + server co-signing)

> Highest security: neither party can act alone. Both signatures required for every operation.

### POC E — Quorum setup

- [ ] Research: key quorum creation via `privy.keyQuorums().create()` (Dashboard only supports pure auth-key quorums)
- [ ] `src/shared/privy-quorum.ts` — `createTwoOfTwoQuorum(userId, serverPublicKey)` helper
- [ ] `src/examples/11-quorum-setup.ts` — create quorum → create Stellar wallet owned by quorum
- [ ] `docs/11-quorum.md` — quorum creation guide

### POC F — Co-signed Defindex deposit

- [ ] `src/examples/12-quorum-deposit.ts`:
  - Client signs payload with `useAuthorizationSignature()` (React) or `user_jwts` (Node mock)
  - Server adds its signature
  - Both sent as `privy-authorization-signature: userSig,serverSig`
  - Rawsign hash → DecoratedSignature → POST /send to Defindex
- [ ] Verify: request with only server signature is rejected
- [ ] Verify: request with only user signature is rejected
- [ ] `docs/11-quorum.md` — add section: co-signing flow for Stellar rawSign

### POC G — Co-signed withdraw by shares

- [ ] `src/examples/13-quorum-withdraw-shares.ts` — same co-signing pattern applied to withdrawShares
- [ ] `docs/11-quorum.md` — add section: withdraw patterns under 2-of-2 quorum

---

## Priority 3 — User Owner (server-side user wallets)

> User owns wallet. Server can operate it but requires user's active JWT for each action.
> True self-custody: user is always in the loop.

### POC H — Custom auth provider integration

- [ ] Research: JWT-based authentication config in Privy Dashboard (JWKS endpoint, custom_user_id)
- [ ] `src/shared/privy-user-auth.ts` — `createPrivyUser(customUserId)` + `requestUserKey(userJwt)` helpers
- [ ] `src/examples/14-user-owner-setup.ts` — create Privy user → create wallet with user as owner
- [ ] `docs/12-user-owner.md` — guide: custom auth provider setup, user creation, wallet creation

### POC I — Server-side deposit with user JWT

- [ ] `src/examples/15-user-owner-deposit.ts`:
  - Simulate user JWT (or use real JWT from a test auth provider)
  - Backend calls `POST /v1/wallets/authenticate { user_jwt }` → ephemeral user key
  - Uses user key signature for Defindex deposit rawSign
- [ ] `docs/12-user-owner.md` — add section: deposit flow with user JWT

### POC J — Server-side withdraw with user JWT

- [ ] `src/examples/16-user-owner-withdraw.ts` — same JWT pattern for withdraw + withdrawShares
- [ ] Document: user key expiry behavior, re-authentication flow

---

## Priority 4 — Auth Key extensions (current pattern, enhancements)

> Extensions to the existing 1-of-1 server pattern already implemented in examples 01–06.

### POC K — Multi-vault deposit (batch)

- [ ] `src/examples/17-batch-deposit.ts` — deposit to multiple Defindex vaults in parallel from one Stellar wallet
- [ ] Handle transaction sequence conflicts (parallel rawSign with same account)

### POC L — Mainnet withdraw + withdraw-shares

- [ ] Verify `/withdraw` and `/withdraw_shares` REST API paths with Defindex team
- [ ] Update `src/wallets/privy-defindex-wallet.ts` if endpoint paths differ
- [ ] `src/examples/18-mainnet-withdraw.ts` — full mainnet withdraw flow
- [ ] Update `docs/06-withdraw.md` and `docs/07-withdraw-shares.md` with confirmed endpoint paths

### POC M — Cron-based auto-compound

- [ ] `src/examples/19-auto-compound.ts` — scheduled script: check yield → withdraw → re-deposit
- [ ] Implement cooldown logic (skip if position below threshold)
- [ ] `docs/13-automation.md` — automation patterns: cron, event-driven, price-triggered

---

## Completed

- [x] POC 1 — Auth Key: EVM wallet on Base mainnet (`src/examples/01-base-wallet.ts`)
- [x] POC 2 — Auth Key: Stellar wallet testnet (`src/examples/02-stellar-wallet.ts`)
- [x] POC 3 — Auth Key: Defindex deposit testnet (`src/examples/03-deposit.ts`)
- [x] POC 4 — Auth Key: Defindex withdraw by amount (`src/examples/04-withdraw.ts`)
- [x] POC 5 — Auth Key: Defindex withdraw by shares (`src/examples/05-withdraw-shares.ts`)
- [x] POC 6 — Auth Key: Full mainnet bridge Base → Stellar → Defindex (`src/examples/06-full-bridge.ts`)
- [x] Docs: ownership patterns reference (`docs/09-ownership-patterns.md`)
