/**
 * Example 3 — Defindex Deposit (Testnet, XLM vault)
 *
 * Demonstrates: deposit XLM into a Defindex vault using a Privy Stellar wallet.
 * The Defindex API builds the Soroban contract XDR; Privy raw-signs the hash.
 *
 * Run: pnpm example:deposit
 * Requires: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_PRIVATE_KEY, DEFINDEX_API_KEY
 */
import "dotenv/config";
import {
  getOrCreateStellarWallet,
  getStellarBalance,
} from "../wallets/privy-stellar-wallet.js";
import { depositToDefindexVault } from "../wallets/privy-defindex-wallet.js";
import { config, XLM_DEFINDEX_VAULT_TESTNET } from "../shared/config.js";

const DEPOSIT_AMOUNT_STROOPS = 10_000_000n; // 1 XLM (7 decimals)
const MINIMUM_XLM_BALANCE = 5; // 1 XLM deposit + 4 XLM reserve buffer

async function main() {
  console.log("Privy Defindex Deposit — Testnet XLM Vault");
  console.log("────────────────────────────────────────────────────────────");

  console.log("\n[1/4] Creating / retrieving Stellar wallet...");
  const wallet = await getOrCreateStellarWallet();
  console.log(`  ID:       ${wallet.id}`);
  console.log(`  Address:  ${wallet.address}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/account/${wallet.address}`);

  console.log("\n[2/4] Checking XLM balance...");
  let balance = await getStellarBalance(wallet.address);
  console.log(`  Balance: ${balance} XLM`);

  if (parseFloat(balance) < MINIMUM_XLM_BALANCE) {
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

  const depositXlm = Number(DEPOSIT_AMOUNT_STROOPS) / 10_000_000;
  console.log(`\n[3/4] Depositing ${depositXlm} XLM to Defindex vault...`);
  console.log(`  Vault: ${XLM_DEFINDEX_VAULT_TESTNET}`);

  const txHash = await depositToDefindexVault(
    wallet.id,
    wallet.address,
    XLM_DEFINDEX_VAULT_TESTNET,
    DEPOSIT_AMOUNT_STROOPS,
    config.defindexApiKey,
    "testnet"
  );

  console.log(`\n[4/4] Deposit confirmed!`);
  console.log(`  Transaction hash: ${txHash}`);
  console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Done. You should now hold vault shares (dfTokens) in your account.");
  console.log("Run example:withdraw or example:withdraw-shares to redeem them.");
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
