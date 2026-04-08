/**
 * Example 5 — Defindex Withdraw by Shares (Testnet, XLM vault)
 *
 * Demonstrates: redeem vault shares (dfTokens) directly. This is the "percentage
 * withdrawal" pattern — burn X shares to receive X/totalSupply × totalFunds back.
 *
 * Unlike example 4 (withdraw by amount), here we query the user's current share
 * balance and redeem a percentage of it (default: 100% — full withdrawal).
 *
 * Run: pnpm example:withdraw-shares
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY, DEFINDEX_API_KEY
 * Prerequisite: Run example:deposit at least once so you hold vault shares.
 */
import "dotenv/config";
import { getOrCreateStellarWallet } from "../wallets/privy-stellar-wallet.js";
import {
  withdrawSharesFromDefindexVault,
  getUserVaultShares,
} from "../wallets/privy-defindex-wallet.js";
import { config, XLM_DEFINDEX_VAULT_TESTNET } from "../shared/config.js";

// Percentage of shares to redeem (1–100)
const WITHDRAW_PERCENTAGE = 100;

async function main() {
  console.log("Privy Defindex Withdraw by Shares — Testnet XLM Vault");
  console.log("────────────────────────────────────────────────────────────");

  console.log("\n[1/4] Creating / retrieving Stellar wallet...");
  const wallet = await getOrCreateStellarWallet();
  console.log(`  ID:       ${wallet.id}`);
  console.log(`  Address:  ${wallet.address}`);

  console.log("\n[2/4] Fetching vault share balance...");
  const totalShares = await getUserVaultShares(
    XLM_DEFINDEX_VAULT_TESTNET,
    wallet.address,
    config.defindexApiKey,
    "testnet"
  );
  console.log(`  Total shares: ${totalShares}`);

  if (totalShares === 0n) {
    console.log(
      "  ⚠️  No vault shares found. Run example:deposit first to acquire shares."
    );
    process.exit(0);
  }

  // Calculate shares to redeem based on the target percentage
  const sharesToRedeem =
    (totalShares * BigInt(WITHDRAW_PERCENTAGE)) / 100n;
  console.log(
    `  Redeeming ${WITHDRAW_PERCENTAGE}% → ${sharesToRedeem} shares`
  );

  console.log(`\n[3/4] Submitting withdraw_shares transaction...`);
  console.log(`  Vault: ${XLM_DEFINDEX_VAULT_TESTNET}`);

  const txHash = await withdrawSharesFromDefindexVault(
    wallet.id,
    wallet.address,
    XLM_DEFINDEX_VAULT_TESTNET,
    sharesToRedeem,
    config.defindexApiKey,
    "testnet"
  );

  console.log(`\n[4/4] Withdraw confirmed!`);
  console.log(`  Transaction hash: ${txHash}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Done. Redeemed ${WITHDRAW_PERCENTAGE}% of vault position.`);
  if (WITHDRAW_PERCENTAGE < 100) {
    const remaining = totalShares - sharesToRedeem;
    console.log(`  Remaining shares: ${remaining}`);
  }
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
