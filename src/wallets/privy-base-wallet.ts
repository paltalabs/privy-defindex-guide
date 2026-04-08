import { ethers } from "ethers";
import {
  privy,
  buildAuthContext,
  authorizationPublicKey,
} from "../shared/privy-client.js";

const BASE_MAINNET_CAIP2 = "eip155:8453";
const EVM_WALLET_IDEMPOTENCY_KEY = "privy-guide-ethereum-wallet-v1";

/**
 * Creates a Base mainnet EVM wallet owned by the Authorization Key,
 * or retrieves the existing one via idempotency_key.
 * Privy handles gas estimation and broadcasting (Tier 3 chain).
 */
export async function getOrCreateEvmWallet() {
  return privy.wallets().create({
    chain_type: "ethereum",
    owner: { public_key: authorizationPublicKey },
    idempotency_key: EVM_WALLET_IDEMPOTENCY_KEY,
  });
}

/**
 * Returns the native ETH balance for an address on Base mainnet.
 */
export async function getEvmBalance(address: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", {
    chainId: 8453,
    name: "base",
  });
  return ethers.formatEther(await provider.getBalance(address));
}

/**
 * Sends a 0-value transaction from the Privy EVM wallet.
 * Privy handles gas estimation and broadcasting via Tier 3 support.
 * @returns Transaction hash
 */
export async function sendTestTransaction(
  walletId: string,
  toAddress: string
): Promise<string> {
  const response = await privy
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2: BASE_MAINNET_CAIP2,
      params: {
        transaction: { to: toAddress, value: "0x0", data: "0x" },
      },
      authorization_context: buildAuthContext(),
    });

  return (response as any).hash ?? (response as any).transaction_hash;
}
