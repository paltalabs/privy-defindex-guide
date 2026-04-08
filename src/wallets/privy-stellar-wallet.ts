import {
  TransactionBuilder,
  Networks,
  Asset,
  Operation,
  Keypair,
  Account,
  xdr,
} from "@stellar/stellar-base";
import {
  privy,
  buildAuthContext,
  authorizationPublicKey,
} from "../shared/privy-client.js";
import { config } from "../shared/config.js";

const STELLAR_HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const STELLAR_HORIZON_MAINNET = "https://horizon.stellar.org";
const STELLAR_WALLET_IDEMPOTENCY_KEY = "privy-guide-stellar-wallet-v1";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ASSET = new Asset("USDC", USDC_ISSUER);

// ── Wallet creation ──────────────────────────────────────────────────────────

/**
 * Creates a Stellar testnet wallet owned by the Authorization Key,
 * or retrieves the existing one via idempotency_key.
 * Stellar is a Tier 2 chain — only rawSign is available, no full SDK support.
 */
export async function getOrCreateStellarWallet() {
  return privy.wallets().create({
    chain_type: "stellar",
    owner: { public_key: authorizationPublicKey },
    idempotency_key: STELLAR_WALLET_IDEMPOTENCY_KEY,
  });
}

// ── Balance helpers ──────────────────────────────────────────────────────────

/** Returns the native XLM balance for a Stellar testnet address via Horizon. */
export async function getStellarBalance(address: string): Promise<string> {
  const response = await fetch(
    `${STELLAR_HORIZON_TESTNET}/accounts/${address}`
  );
  if (!response.ok) {
    if (response.status === 404) return "0 (not funded)";
    throw new Error(`Horizon error: ${response.status}`);
  }
  const data = (await response.json()) as {
    balances: { asset_type: string; balance: string }[];
  };
  return data.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
}

// ── Raw-sign + broadcast (Tier 2 pattern) ────────────────────────────────────

/**
 * Attaches a raw Ed25519 signature to a Stellar transaction envelope.
 *
 * Privy rawSign returns a hex-encoded 64-byte signature (0x-prefixed).
 * We attach it as a DecoratedSignature using the wallet address as the hint.
 */
function attachSignature(
  transaction: any,
  fromAddress: string,
  signatureHex: string
): void {
  const signatureBytes = Buffer.from(
    signatureHex.replace(/^0x/, ""),
    "hex"
  );
  const keypair = Keypair.fromPublicKey(fromAddress);
  transaction.signatures.push(
    new xdr.DecoratedSignature({
      hint: keypair.signatureHint(),
      signature: signatureBytes,
    })
  );
}

/**
 * Raw-signs a transaction hash via Privy and returns the normalized hex signature.
 * Handles all known Privy SDK response shapes (see docs/08-gotchas.md § E8).
 */
async function rawSignHash(walletId: string, txHashHex: string): Promise<string> {
  const signResult = await privy.wallets().rawSign(walletId, {
    params: { hash: txHashHex },
    authorization_context: buildAuthContext(),
  } as any);

  return (
    (signResult as any)?.data?.signature ??
    (signResult as any)?.signature ??
    (signResult as unknown as string)
  );
}

/**
 * Builds a Stellar payment transaction, raw-signs it via Privy,
 * attaches the DecoratedSignature, and broadcasts to Horizon testnet.
 * @returns Transaction hash
 */
export async function buildSignAndBroadcastStellarTx(
  walletId: string,
  fromAddress: string,
  toAddress: string,
  amountXlm: string
): Promise<string> {
  const sequence = await fetchAccountSequence(fromAddress, STELLAR_HORIZON_TESTNET);
  const account = new Account(fromAddress, sequence);

  const transaction = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: toAddress,
        asset: Asset.native(),
        amount: amountXlm,
      })
    )
    .setTimeout(30)
    .build();

  const txHashHex = "0x" + Buffer.from(transaction.hash()).toString("hex");
  const signatureHex = await rawSignHash(walletId, txHashHex);
  attachSignature(transaction, fromAddress, signatureHex);

  return submitXdr(
    transaction.toEnvelope().toXDR("base64"),
    STELLAR_HORIZON_TESTNET
  );
}

// ── Horizon helpers (shared testnet / mainnet) ────────────────────────────────

type HorizonAccountResponse = {
  sequence: string;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
};

async function fetchAccountSequence(
  address: string,
  horizonUrl: string
): Promise<string> {
  const response = await fetch(`${horizonUrl}/accounts/${address}`);
  if (!response.ok) {
    throw new Error(
      `Cannot fetch account from Horizon ${horizonUrl} (status ${response.status}). Is the wallet funded?`
    );
  }
  return ((await response.json()) as HorizonAccountResponse).sequence;
}

async function fetchMainnetAccount(
  address: string
): Promise<HorizonAccountResponse | null> {
  const response = await fetch(
    `${STELLAR_HORIZON_MAINNET}/accounts/${address}`
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Horizon error: ${response.status}`);
  return (await response.json()) as HorizonAccountResponse;
}

async function submitXdr(
  envelopeXdr: string,
  horizonUrl: string
): Promise<string> {
  const response = await fetch(`${horizonUrl}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(envelopeXdr)}`,
  });
  const data = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(
      `Horizon submission failed: ${JSON.stringify(
        data?.extras?.result_codes ?? data
      )}`
    );
  }
  return data.hash as string;
}

// ── Mainnet helpers ──────────────────────────────────────────────────────────

/**
 * Ensures the Privy Stellar wallet has at least `minimumXlm` XLM on mainnet.
 * If below the threshold, funds it from the server's STELLAR_SERVER_KEY.
 */
export async function ensureXlmFunding(
  privyAddress: string,
  minimumXlm: number = 3
): Promise<void> {
  const account = await fetchMainnetAccount(privyAddress);
  const xlmBalance = account
    ? parseFloat(
        account.balances.find((b) => b.asset_type === "native")?.balance ?? "0"
      )
    : 0;

  if (xlmBalance >= minimumXlm) {
    console.log(`  XLM balance: ${xlmBalance} ✅`);
    return;
  }

  console.log(
    `  XLM balance: ${xlmBalance} — below ${minimumXlm} XLM minimum. Sponsoring from server key...`
  );

  if (!config.stellarServerKey) {
    throw new Error(
      "STELLAR_SERVER_KEY is not set. Cannot sponsor XLM for the Privy Stellar wallet."
    );
  }

  const serverKeypair = Keypair.fromSecret(config.stellarServerKey);
  const serverAccount = await fetchMainnetAccount(serverKeypair.publicKey());

  if (!serverAccount) {
    throw new Error(
      `Server account (${serverKeypair.publicKey()}) does not exist on mainnet.`
    );
  }

  const sendAmount = String(minimumXlm + 1);
  const operation = account
    ? Operation.payment({
        destination: privyAddress,
        asset: Asset.native(),
        amount: sendAmount,
      })
    : Operation.createAccount({
        destination: privyAddress,
        startingBalance: sendAmount,
      });

  const tx = new TransactionBuilder(
    new Account(serverKeypair.publicKey(), serverAccount.sequence),
    { fee: "100", networkPassphrase: Networks.PUBLIC }
  )
    .addOperation(operation)
    .setTimeout(30)
    .build();

  tx.sign(serverKeypair);
  const txHash = await submitXdr(tx.toEnvelope().toXDR("base64"), STELLAR_HORIZON_MAINNET);
  console.log(`  XLM sponsored! txHash: ${txHash}`);
}

/**
 * Ensures the Privy Stellar wallet has a USDC trustline on mainnet.
 * If missing, builds a changeTrust transaction, raw-signs it via Privy,
 * and broadcasts to Horizon mainnet.
 */
export async function ensureUsdcTrustline(
  walletId: string,
  address: string
): Promise<void> {
  const account = await fetchMainnetAccount(address);
  if (!account) {
    throw new Error(`Stellar account ${address} does not exist. Fund it first.`);
  }

  const hasUsdcTrustline = account.balances.some(
    (b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
  );

  if (hasUsdcTrustline) {
    console.log("  USDC trustline: exists ✅");
    return;
  }

  console.log("  USDC trustline: missing — creating...");

  const tx = new TransactionBuilder(new Account(address, account.sequence), {
    fee: "100",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(Operation.changeTrust({ asset: USDC_ASSET }))
    .setTimeout(30)
    .build();

  const txHashHex = "0x" + Buffer.from(tx.hash()).toString("hex");
  const signatureHex = await rawSignHash(walletId, txHashHex);
  attachSignature(tx, address, signatureHex);

  const txHash = await submitXdr(tx.toEnvelope().toXDR("base64"), STELLAR_HORIZON_MAINNET);
  console.log(`  USDC trustline created! txHash: ${txHash}`);
}
