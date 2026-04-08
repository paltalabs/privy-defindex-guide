/**
 * Example 4 — Defindex Withdraw by Amount (Testnet, XLM vault)
 *
 * Demonstrates: withdraw a specific amount of underlying assets from a Defindex
 * vault. The API converts the requested amount to the corresponding share burn
 * internally — you only specify how many tokens you want to receive.
 *
 * Run: pnpm example:withdraw
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY, DEFINDEX_API_KEY
 * Prerequisite: Run example:deposit at least once so you hold vault shares.
 */
import "dotenv/config";
import { getOrCreateStellarWallet } from "../wallets/privy-stellar-wallet.js";
import { withdrawFromDefindexVault } from "../wallets/privy-defindex-wallet.js";
import { config, XLM_DEFINDEX_VAULT_TESTNET } from "../shared/config.js";

// Withdraw 0.5 XLM worth of assets from the vault
const WITHDRAW_AMOUNT_STROOPS = 5_000_000n; // 0.5 XLM (7 decimals: 1 XLM = 10_000_000)

async function main() {
  console.log("Privy Defindex Withdraw by Amount — Testnet XLM Vault");
  console.log("────────────────────────────────────────────────────────────");

  console.log("\n[1/3] Creating / retrieving Stellar wallet...");
  const wallet = await getOrCreateStellarWallet();
  console.log(`  ID:       ${wallet.id}`);
  console.log(`  Address:  ${wallet.address}`);

  const withdrawXlm = Number(WITHDRAW_AMOUNT_STROOPS) / 10_000_000;
  console.log(`\n[2/3] Requesting withdraw of ${withdrawXlm} XLM from vault...`);
  console.log(`  Vault: ${XLM_DEFINDEX_VAULT_TESTNET}`);

  const txHash = await withdrawFromDefindexVault(
    wallet.id,
    wallet.address,
    XLM_DEFINDEX_VAULT_TESTNET,
    WITHDRAW_AMOUNT_STROOPS,
    config.defindexApiKey,
    "testnet"
  );

  console.log(`\n[3/3] Withdraw confirmed!`);
  console.log(`  Transaction hash: ${txHash}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Done. The corresponding vault shares have been burned.");
  console.log("Use example:withdraw-shares to redeem by share count instead.");
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
