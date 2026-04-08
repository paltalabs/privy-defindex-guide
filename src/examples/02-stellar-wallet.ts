/**
 * Example 2 — Privy Stellar Wallet (Testnet)
 *
 * Demonstrates: create/retrieve a server-controlled Stellar wallet,
 * auto-fund via Friendbot, and broadcast a signed payment transaction.
 *
 * Stellar is Tier 2 in Privy — only rawSign is available. We build the
 * transaction manually and broadcast to Horizon ourselves.
 *
 * Run: pnpm example:stellar
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY
 * Prerequisite: TEE execution enabled in Privy Dashboard
 */
import "dotenv/config";
import {
  getOrCreateStellarWallet,
  getStellarBalance,
  buildSignAndBroadcastStellarTx,
} from "../wallets/privy-stellar-wallet.js";

const PAYMENT_AMOUNT_XLM = "0.0000001";
const MINIMUM_XLM_FOR_TX = 2;

async function main() {
  console.log("Privy Stellar Wallet — Testnet");
  console.log("────────────────────────────────────────────────────────────");

  console.log("\n[1/3] Creating / retrieving Stellar wallet...");
  const wallet = await getOrCreateStellarWallet();
  console.log(`  ID:       ${wallet.id}`);
  console.log(`  Address:  ${wallet.address}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/account/${wallet.address}`);

  console.log("\n[2/3] Checking XLM balance...");
  let balance = await getStellarBalance(wallet.address);
  console.log(`  Balance: ${balance} XLM`);

  if (parseFloat(balance) < MINIMUM_XLM_FOR_TX) {
    console.log("  Funding via Friendbot...");
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${wallet.address}`
    );
    if (!res.ok) {
      throw new Error(`Friendbot failed: ${res.status} ${await res.text()}`);
    }
    balance = await getStellarBalance(wallet.address);
    console.log(`  Funded! New balance: ${balance} XLM`);
  }

  console.log("\n[3/3] Signing and broadcasting Stellar payment...");
  const txHash = await buildSignAndBroadcastStellarTx(
    wallet.id,
    wallet.address,
    wallet.address, // self-transfer as smoke test
    PAYMENT_AMOUNT_XLM
  );
  console.log(`  ✅ Transaction submitted!`);
  console.log(`  Hash:     ${txHash}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Done. Wallet visible in Privy Dashboard → Wallets.");
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
