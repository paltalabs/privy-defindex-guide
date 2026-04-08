# Stellar Wallet — Privy Tier 2

Privy supports Stellar as a **Tier 2** chain: the TEE provides Ed25519 signing only.
All transaction construction and Horizon broadcasting are the caller's responsibility.

---

## Create / Retrieve Wallet

```ts
import { PrivyClient } from "@privy-io/node";
import { derivePublicKey } from "../shared/privy-client.js";

const privy = new PrivyClient({ appId, appSecret });
const authorizationPublicKey = derivePublicKey(authorizationPrivateKey);

// idempotency_key ensures repeated calls return the same wallet
const wallet = await privy.wallets().create({
  chain_type: "stellar",
  owner: { public_key: authorizationPublicKey },
  idempotency_key: "my-app-stellar-wallet-v1",
});

console.log(wallet.address); // G... Stellar public key
console.log(wallet.id);      // Privy wallet ID (used for signing)
```

---

## Fund with XLM

### Testnet — Friendbot

```ts
await fetch(`https://friendbot.stellar.org/?addr=${wallet.address}`);
```

### Mainnet — From a server key

```ts
import { TransactionBuilder, Operation, Asset, Account, Networks, Keypair } from "@stellar/stellar-base";

const serverKeypair = Keypair.fromSecret(process.env.STELLAR_SERVER_KEY);
const serverAccount = await fetchHorizonAccount(serverKeypair.publicKey());

const tx = new TransactionBuilder(
  new Account(serverKeypair.publicKey(), serverAccount.sequence),
  { fee: "100", networkPassphrase: Networks.PUBLIC }
)
  .addOperation(Operation.payment({
    destination: wallet.address,
    asset: Asset.native(),
    amount: "4",  // 4 XLM — 1 XLM reserve + buffer for fees
  }))
  .setTimeout(30)
  .build();

tx.sign(serverKeypair);
await submitToHorizon(tx.toEnvelope().toXDR("base64"), "https://horizon.stellar.org");
```

---

## Add USDC Trustline

The wallet must have a trustline before USDC can be received (e.g., via bridge).

```ts
import { TransactionBuilder, Operation, Asset, Account, Networks, Keypair, xdr } from "@stellar/stellar-base";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ASSET = new Asset("USDC", USDC_ISSUER);

const account = await fetchHorizonAccount(wallet.address); // from Horizon mainnet
const tx = new TransactionBuilder(
  new Account(wallet.address, account.sequence),
  { fee: "100", networkPassphrase: Networks.PUBLIC }
)
  .addOperation(Operation.changeTrust({ asset: USDC_ASSET }))
  .setTimeout(30)
  .build();

// Raw-sign via Privy (Tier 2)
const txHashHex = "0x" + Buffer.from(tx.hash()).toString("hex");
const signResult = await privy.wallets().rawSign(wallet.id, {
  params: { hash: txHashHex },
  authorization_context: buildAuthContext(),
});

// Normalize response shape (see 08-gotchas.md § E8)
const signatureHex =
  signResult?.data?.signature ?? signResult?.signature ?? signResult;

const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
tx.signatures.push(
  new xdr.DecoratedSignature({
    hint: Keypair.fromPublicKey(wallet.address).signatureHint(),
    signature: signatureBytes,
  })
);

await submitToHorizon(tx.toEnvelope().toXDR("base64"), "https://horizon.stellar.org");
```

---

## Check Balance (Horizon)

```ts
// XLM
const res = await fetch(`https://horizon.stellar.org/accounts/${address}`);
const data = await res.json();
const xlm = data.balances.find(b => b.asset_type === "native").balance;

// USDC
const usdc = data.balances.find(
  b => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
)?.balance ?? "0";

// Convert to stroops (bigint, 7 decimals)
const usdcStroops = BigInt(Math.round(parseFloat(usdc) * 10_000_000));
```

---

## rawSign Pattern (Tier 2 core)

This is the fundamental signing pattern used for every Stellar transaction — payments,
trustlines, and Defindex vault calls:

```ts
// 1. Build transaction → get hash
const txHashHex = "0x" + Buffer.from(transaction.hash()).toString("hex");

// 2. Raw-sign via Privy TEE
const signResult = await privy.wallets().rawSign(walletId, {
  params: { hash: txHashHex },
  authorization_context: { authorization_private_keys: [authorizationPrivateKey] },
});

// 3. Normalize signature (handles all known Privy SDK response shapes)
const signatureHex =
  signResult?.data?.signature ?? signResult?.signature ?? signResult;

// 4. Attach DecoratedSignature
const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
transaction.signatures.push(
  new xdr.DecoratedSignature({
    hint: Keypair.fromPublicKey(walletAddress).signatureHint(),
    signature: signatureBytes,
  })
);

// 5. Broadcast signed envelope to Horizon
const envelopeXdr = transaction.toEnvelope().toXDR("base64");
```
