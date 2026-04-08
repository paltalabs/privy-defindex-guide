# Defindex Deposit

Deposit assets into a Defindex vault using a Privy Stellar wallet.
The Defindex API handles Soroban XDR construction — Privy only needs to raw-sign the hash.

---

## API Call

```
POST https://api.defindex.io/vault/{vaultAddress}/deposit?network={testnet|mainnet}
Authorization: Bearer <DEFINDEX_API_KEY>
Content-Type: application/json

{
  "amounts":     [10000000],   // ⚠️ Number[], NOT string[] — API rejects strings
  "caller":      "G...",       // Stellar address of the depositor
  "invest":      true,         // Deploy to underlying strategies immediately
  "slippageBps": 50            // 0.5% slippage tolerance
}

→ { "xdr": "<unsigned base64 XDR>" }
```

---

## Full Flow

```ts
import { TransactionBuilder, Networks, Keypair, xdr } from "@stellar/stellar-base";

// 1. Request unsigned XDR from Defindex API
const response = await fetch(
  `https://api.defindex.io/vault/${vaultAddress}/deposit?network=mainnet`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${defindexApiKey}`,
    },
    body: JSON.stringify({
      amounts: [Number(amountStroops)],  // ⚠️ Must be Number, not BigInt or string
      caller: stellarAddress,
      invest: true,
      slippageBps: 50,
    }),
  }
);
const { xdr: unsignedXdr } = await response.json();

// 2. Parse XDR → Transaction object
const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC);

// 3. Hash the transaction for Privy
const txHashHex = "0x" + Buffer.from((tx as any).hash()).toString("hex");

// 4. Raw-sign via Privy TEE
const signResult = await privy.wallets().rawSign(walletId, {
  params: { hash: txHashHex },
  authorization_context: { authorization_private_keys: [authorizationPrivateKey] },
});

// 5. Normalize signature (all known SDK response shapes)
const signatureHex =
  signResult?.data?.signature ?? signResult?.signature ?? signResult;

// 6. Attach DecoratedSignature
const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
(tx as any).signatures.push(
  new xdr.DecoratedSignature({
    hint: Keypair.fromPublicKey(stellarAddress).signatureHint(),
    signature: signatureBytes,
  })
);

// 7. Submit signed XDR to Defindex /send
const signedXdr = (tx as any).toEnvelope().toXDR("base64");
const submitRes = await fetch(`https://api.defindex.io/send?network=mainnet`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${defindexApiKey}`,
  },
  body: JSON.stringify({ xdr: signedXdr }),
});
const { txHash } = await submitRes.json();
```

---

## Helper Function

See `src/wallets/privy-defindex-wallet.ts` → `depositToDefindexVault()`.

```ts
const txHash = await depositToDefindexVault(
  walletId,
  stellarAddress,
  vaultAddress,
  amountStroops,   // bigint
  defindexApiKey,
  "mainnet"        // or "testnet"
);
```

---

## Testnet Example

Vault: `CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6` (XLM)

```bash
pnpm example:deposit
```

---

## Key Gotchas

| Issue | Fix |
|---|---|
| `amounts` rejected by API | Pass `[Number(amountStroops)]` — never string or BigInt |
| `signatureHex` is undefined | Use triple-fallback: `signResult?.data?.signature ?? signResult?.signature ?? signResult` |
| Deposit fails with insufficient balance | Deposit + fees require buffer beyond minimum reserve |
