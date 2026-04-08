/**
 * Example 1 — Privy EVM Wallet on Base Mainnet
 *
 * Demonstrates: create/retrieve a server-controlled EVM wallet via the
 * Authorization Key pattern, check its ETH balance, and send a 0-value tx.
 *
 * Run: pnpm example:base
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY
 */
import "dotenv/config";
import {
  getOrCreateEvmWallet,
  getEvmBalance,
  sendTestTransaction,
} from "../wallets/privy-base-wallet.js";

const TEST_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const MINIMUM_ETH_FOR_TX = 0.0001;

async function main() {
  console.log("Privy EVM Wallet — Base Mainnet");
  console.log("────────────────────────────────────────────────────────────");

  console.log("\n[1/3] Creating / retrieving EVM wallet...");
  const wallet = await getOrCreateEvmWallet();
  console.log(`  ID:       ${wallet.id}`);
  console.log(`  Address:  ${wallet.address}`);
  console.log(`  Explorer: https://basescan.org/address/${wallet.address}`);

  console.log("\n[2/3] Checking ETH balance...");
  const balance = await getEvmBalance(wallet.address);
  console.log(`  Balance: ${balance} ETH`);

  console.log("\n[3/3] Sending test transaction...");
  if (parseFloat(balance) < MINIMUM_ETH_FOR_TX) {
    console.log(`  ⚠️  Need ≥ ${MINIMUM_ETH_FOR_TX} ETH for gas. Fund this address:`);
    console.log(`  ➜  ${wallet.address}`);
    process.exit(0);
  }

  const txHash = await sendTestTransaction(wallet.id, TEST_RECIPIENT);
  console.log(`  ✅ Sent! Hash: ${txHash}`);
  console.log(`  Explorer: https://basescan.org/tx/${txHash}`);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Done. Wallet visible in Privy Dashboard → Wallets.");
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
