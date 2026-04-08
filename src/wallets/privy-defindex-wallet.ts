import {
  TransactionBuilder,
  Networks,
  Keypair,
  xdr,
} from "@stellar/stellar-base";
import { privy, buildAuthContext } from "../shared/privy-client.js";

const DEFINDEX_API = "https://api.defindex.io";
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Calls the Defindex API to build an unsigned XDR for a vault operation.
 */
async function buildVaultXdr(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  network: "testnet" | "mainnet"
): Promise<string> {
  const url = `${DEFINDEX_API}/vault/${endpoint}?network=${network}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(
      `Defindex API error ${response.status} at ${url}: ${JSON.stringify(json)}`
    );
  }
  if (!json.xdr) {
    throw new Error(`Defindex API returned no XDR: ${JSON.stringify(json)}`);
  }
  return json.xdr as string;
}

/**
 * Parses an unsigned XDR, raw-signs it via Privy, attaches the
 * DecoratedSignature, and submits the signed XDR to Defindex /send.
 *
 * This is the signing core shared by deposit, withdraw, and withdrawShares.
 * @returns On-chain transaction hash
 */
async function signAndSubmit(
  walletId: string,
  fromAddress: string,
  unsignedXdr: string,
  apiKey: string,
  network: "testnet" | "mainnet"
): Promise<string> {
  const networkPassphrase =
    network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

  // Parse XDR into a Transaction object
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    networkPassphrase
  ) as ReturnType<typeof TransactionBuilder.fromXDR>;

  // Hash the transaction and format for Privy
  const txHashHex = "0x" + Buffer.from((transaction as any).hash()).toString("hex");

  // Raw-sign via Privy TEE (Ed25519, Tier 2)
  const signResult = await privy.wallets().rawSign(walletId, {
    params: { hash: txHashHex },
    authorization_context: buildAuthContext(),
  } as any);

  // Normalize across all known Privy SDK response shapes (see docs/08-gotchas.md § E8)
  const signatureHex: string =
    (signResult as any)?.data?.signature ??
    (signResult as any)?.signature ??
    (signResult as unknown as string);

  const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");

  // Attach the DecoratedSignature to the transaction envelope
  const keypair = Keypair.fromPublicKey(fromAddress);
  (transaction as any).signatures.push(
    new xdr.DecoratedSignature({
      hint: keypair.signatureHint(),
      signature: signatureBytes,
    })
  );

  // Submit signed XDR to Defindex /send
  const signedXdr = (transaction as any).toEnvelope().toXDR("base64");
  const submitUrl = `${DEFINDEX_API}/send?network=${network}`;

  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ xdr: signedXdr }),
  });

  const submitJson = (await submitResponse.json()) as any;
  if (!submitResponse.ok) {
    throw new Error(
      `Defindex /send error ${submitResponse.status}: ${JSON.stringify(submitJson)}`
    );
  }

  const txHash = submitJson.txHash ?? submitJson.hash ?? submitJson.id;
  if (!txHash) {
    throw new Error(
      `Defindex /send returned no txHash: ${JSON.stringify(submitJson)}`
    );
  }
  return txHash as string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Deposits assets into a Defindex vault.
 *
 * Flow:
 *  1. POST /vault/{addr}/deposit → unsigned XDR
 *  2. Hash the transaction
 *  3. privy.rawSign → Ed25519 signature
 *  4. Attach DecoratedSignature
 *  5. POST /send → txHash
 *
 * @param amountStroops  Amount in stroops (7 decimals: 1 XLM/USDC = 10_000_000)
 * @returns On-chain transaction hash
 */
export async function depositToDefindexVault(
  walletId: string,
  fromAddress: string,
  vaultAddress: string,
  amountStroops: bigint,
  apiKey: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<string> {
  console.log(`  [Defindex] Requesting deposit XDR...`);

  // IMPORTANT: amounts must be Number[], not string[] — the API rejects strings
  const unsignedXdr = await buildVaultXdr(
    `${vaultAddress}/deposit`,
    {
      amounts: [Number(amountStroops)],
      caller: fromAddress,
      invest: true,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    apiKey,
    network
  );

  console.log(`  [Defindex] Signing and submitting...`);
  return signAndSubmit(walletId, fromAddress, unsignedXdr, apiKey, network);
}

/**
 * Withdraws assets from a Defindex vault by specifying the underlying amount.
 *
 * Use this when you know exactly how many tokens you want to receive back.
 * The API converts the requested amount to the corresponding share count internally.
 *
 * Flow: identical to deposit — POST /withdraw → XDR → rawSign → /send
 *
 * @param amountStroops  Amount of underlying asset to withdraw (stroops, 7 decimals)
 * @returns On-chain transaction hash
 */
export async function withdrawFromDefindexVault(
  walletId: string,
  fromAddress: string,
  vaultAddress: string,
  amountStroops: bigint,
  apiKey: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<string> {
  console.log(`  [Defindex] Requesting withdraw XDR...`);

  const unsignedXdr = await buildVaultXdr(
    `${vaultAddress}/withdraw`,
    {
      amounts: [Number(amountStroops)],
      caller: fromAddress,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    apiKey,
    network
  );

  console.log(`  [Defindex] Signing and submitting...`);
  return signAndSubmit(walletId, fromAddress, unsignedXdr, apiKey, network);
}

/**
 * Withdraws from a Defindex vault by burning a specific number of vault shares.
 *
 * Use this for percentage-based withdrawals (e.g., "redeem 50% of my position").
 * Shares represent proportional ownership: burning X shares returns
 * X / totalSupply × totalManagedFunds of each underlying asset.
 *
 * To calculate shares for a target percentage:
 *   shares = getUserShares(vault, address) * percentage / 100
 *
 * Flow: identical to deposit — POST /withdraw_shares → XDR → rawSign → /send
 *
 * @param shares  Number of vault shares (dfTokens) to burn
 * @returns On-chain transaction hash
 */
export async function withdrawSharesFromDefindexVault(
  walletId: string,
  fromAddress: string,
  vaultAddress: string,
  shares: bigint,
  apiKey: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<string> {
  console.log(`  [Defindex] Requesting withdraw_shares XDR...`);

  const unsignedXdr = await buildVaultXdr(
    `${vaultAddress}/withdraw_shares`,
    {
      shares: Number(shares),
      caller: fromAddress,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    apiKey,
    network
  );

  console.log(`  [Defindex] Signing and submitting...`);
  return signAndSubmit(walletId, fromAddress, unsignedXdr, apiKey, network);
}

/**
 * Fetches the vault share balance for a given user address.
 * Used to calculate the shares parameter for withdrawSharesFromDefindexVault().
 *
 * @returns User's share balance as bigint
 */
export async function getUserVaultShares(
  vaultAddress: string,
  userAddress: string,
  apiKey: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<bigint> {
  const url = `${DEFINDEX_API}/vault/${vaultAddress}/balance?network=${network}&address=${userAddress}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const json = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(
      `Defindex balance error ${response.status}: ${JSON.stringify(json)}`
    );
  }

  // The API returns the share balance; field name may vary
  const shares =
    json.shares ?? json.balance ?? json.dfTokens ?? json.vault_shares;
  if (shares === undefined) {
    throw new Error(`Defindex balance returned no shares field: ${JSON.stringify(json)}`);
  }

  return BigInt(shares);
}
