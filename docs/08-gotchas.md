# Known Gotchas — Root Causes and Fixes

Chronological record of bugs encountered during development. Each entry includes
the symptom, root cause, and exact fix.

---

## E1 — ETH minimum too conservative

**Symptom:** Script exits "insufficiently funded" with 0.0006 ETH even though two
Base transactions (ERC-20 approve + createIntent) consume well under 0.0005 ETH.

**Fix:** Use `MIN_ETH = 0.0005 ETH` (not `0.001`).

```ts
const MIN_ETH = ethers.parseEther("0.0005");
```

---

## E2 — Sodax quote returns -999 error intermittently

**Symptom:** `sodax.swaps.getQuote()` fails with error code `-999`. Transient.

**Root cause:** Solver network unavailability.

**Fix:** Retry up to 5 times with 5s backoff.

```ts
for (let attempt = 1; attempt <= 5; attempt++) {
  const result = await sodax.swaps.getQuote(request);
  if (result.ok) return result.value;
  if (attempt < 5) await sleep(5000);
}
```

---

## E3 — Privy `sendTransaction` fails with JSON serialization error

**Symptom:** Privy rejects the call because `value` is a `BigInt`.

**Root cause:** `JSON.stringify` cannot serialize `BigInt`.

**Fix:** Convert `value` to `0x`-prefixed hex string:

```ts
const valueHex = "0x" + BigInt(evmRawTx.value as any).toString(16);
```

---

## E4 — `amountReceived` is `0n` after bridge completes

**Symptom:** `pollStatus()` returns `amountReceived: 0n` after SOLVED.

**Root cause:** `getSolvedIntentPacket()` returns the Stellar tx hash but NOT the
settled output amount.

**Fix:** Fetch amount separately from the Hub:

```ts
const intentState = await sodax.swaps.getFilledIntent(fillTxHash);
const amountReceived = intentState.receivedOutput; // bigint, Stellar stroops
```

---

## E5 — Defindex deposit fails with HTTP 400 ("invalid amounts")

**Symptom:** `POST /vault/{addr}/deposit` returns 400.

**Root cause:** `amounts` field was passed as string array (`[amountStroops.toString()]`).

**Fix:** Always pass `[Number(amountStroops)]`:

```ts
body: JSON.stringify({
  amounts: [Number(amountStroops)],  // NOT .toString(), NOT BigInt
  ...
})
```

This applies to `/deposit`, `/withdraw`, and `/withdraw_shares` bodies.

---

## E6 — Defindex deposit runs before USDC arrives on Stellar

**Symptom:** Deposit fails with insufficient USDC. Bridge is SOLVED but funds not there.

**Root cause:** Sodax marks SOLVED on the Hub (Sonic) before the Stellar tx confirms.
There is a multi-second (sometimes 10–30s) gap.

**Fix:** Poll Horizon every 10s before depositing:

```ts
// Poll until USDC balance ≥ amountReceived
for (let i = 0; i < 36; i++) {
  const bal = await getHorizonUsdcBalance(stellarAddress);
  if (bal >= amountReceived) break;
  await sleep(10_000);
}
```

---

## E7 — `waitForUsdcBalance` crashes with `fetch failed / xdr.AccountId`

**Symptom:** Balance check crashes with `fetch failed` or `xdr.AccountId is not a function`.

**Root cause:**
1. `xdr.AccountId` does not exist in current `@stellar/stellar-base`
2. Soroban RPC URL `https://rpc.stellar.org:443` was unreliable under load

**Fix:** Use Horizon API directly — never Soroban RPC for balance checks:

```ts
// ✅ Works
const res = await fetch(`https://horizon.stellar.org/accounts/${address}`);
const data = await res.json();
const entry = data.balances.find(
  b => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
);

// ❌ Broken — do NOT use Soroban RPC simulateTransaction for balance queries
```

---

## E8 — `rawSign` response shape varies across SDK versions

**Symptom:** `signatureHex` is `undefined` — signing succeeds but extraction fails.

**Root cause:** The `rawSign` return type in `@privy-io/node` is undocumented and
has varied across versions:
- `{ data: { signature: "0x..." } }` (REST API shape)
- `{ signature: "0x..." }` (some SDK versions)
- bare string `"0x..."` (Tier 2 recipe examples)

**Fix:** Triple fallback:

```ts
const signatureHex: string =
  signResult?.data?.signature ??
  signResult?.signature ??
  (signResult as unknown as string);
```

---

## E9 — `rawSign` fails for Stellar wallet (TEE not enabled)

**Symptom:** `rawSign` throws an authorization or unauthorized error for Stellar wallets.

**Root cause:** Privy requires TEE execution to be enabled in the app dashboard before
Tier 2 chains (Stellar) can be used server-side.

**Fix:** One-time manual setup — no code change needed:

> Privy Dashboard → Your App → Wallets → Execution environments → **Enable TEE**

Wallet creation will succeed without TEE, but `rawSign` will fail.

---

## Summary Table

| # | Issue | Fix |
|---|---|---|
| E1 | ETH min too high | Use 0.0005 ETH |
| E2 | Quote returns -999 | Retry 5× with 5s backoff |
| E3 | BigInt not serializable | Convert value to `0x` hex string |
| E4 | amountReceived is 0n | Use `getFilledIntent(fillTxHash)` |
| E5 | amounts as string rejected | Pass `[Number(amountStroops)]` |
| E6 | Deposit before USDC arrives | Poll Horizon before depositing |
| E7 | Soroban RPC unreliable | Use Horizon `/accounts/{addr}` endpoint |
| E8 | rawSign response shape varies | Triple fallback: data.signature ?? signature ?? bare string |
| E9 | rawSign fails for Stellar | Enable TEE in Privy Dashboard |
