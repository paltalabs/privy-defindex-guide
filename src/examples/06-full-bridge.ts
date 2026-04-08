/**
 * Example 6 — Full Bridge Flow: Base → Stellar → Defindex (Mainnet)
 *
 * Complete end-to-end production flow:
 *  1. Base EVM wallet (Privy, Tier 3) — check ETH + USDC balances
 *  2. Stellar wallet (Privy, Tier 2) — fund XLM, ensure USDC trustline
 *  3. Sodax bridge — USDC from Base to Stellar (intent-based, ERC-7683)
 *  4. Wait for USDC to land on Stellar (Horizon polling)
 *  5. Defindex deposit — USDC into Soroswap Earn vault
 *
 * Run: pnpm example:bridge
 * Requires: All env vars in .env.example (including STELLAR_SERVER_KEY)
 */
import "dotenv/config";
import { ethers } from "ethers";
import { config, SOROSWAP_EARN_USDC_VAULT } from "../shared/config.js";
import { getOrCreateEvmWallet } from "../wallets/privy-base-wallet.js";
import {
  getOrCreateStellarWallet,
  ensureXlmFunding,
  ensureUsdcTrustline,
} from "../wallets/privy-stellar-wallet.js";
import { depositToDefindexVault } from "../wallets/privy-defindex-wallet.js";
import { PrivyEvmSodaxAdapter } from "../shared/privy-evm-sodax-adapter.js";
import { initializeSodax } from "../shared/sodax.js";
import { SodaxBridgeService } from "../shared/sodax-service.js";
import { SwapParams, BridgeToken } from "../shared/bridge-types.js";

const BASE_CAIP2 = "eip155:8453";
const BRIDGE_AMOUNT_USDC = config.bridge.amount; // "0.1"
const MIN_ETH = ethers.parseEther("0.0005");
const MIN_XLM = 3;

const STELLAR_HORIZON_MAINNET = "https://horizon.stellar.org";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

// ── Horizon USDC polling ─────────────────────────────────────────────────────

async function getHorizonUsdcBalance(
  stellarAddress: string
): Promise<bigint> {
  const response = await fetch(
    `${STELLAR_HORIZON_MAINNET}/accounts/${stellarAddress}`
  );
  if (response.status === 404) return 0n;
  if (!response.ok) throw new Error(`Horizon error: ${response.status}`);

  const data = (await response.json()) as {
    balances: Array<{
      asset_code?: string;
      asset_issuer?: string;
      balance: string;
    }>;
  };

  const usdcEntry = data.balances.find(
    (b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
  );

  if (!usdcEntry) return 0n;
  return BigInt(Math.round(parseFloat(usdcEntry.balance) * 10_000_000));
}

/**
 * Polls Horizon until the USDC balance reaches minimumStroops.
 *
 * Sodax marks SOLVED on the Hub (Sonic) BEFORE the Stellar tx is confirmed.
 * This poll ensures funds have actually landed before we deposit into Defindex.
 */
async function waitForUsdcBalance(
  stellarAddress: string,
  minimumStroops: bigint,
  maxAttempts = 36,
  intervalMs = 10_000
): Promise<void> {
  const minFloat = Number(minimumStroops) / 10_000_000;
  console.log(`  Waiting for ≥ ${minFloat} USDC on Stellar (Horizon polling)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const balance = await getHorizonUsdcBalance(stellarAddress);
    const balanceFloat = Number(balance) / 10_000_000;
    console.log(`  Attempt ${attempt}/${maxAttempts} — USDC balance: ${balanceFloat}`);
    if (balance >= minimumStroops) return;
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(
    `USDC did not arrive after ${(maxAttempts * intervalMs) / 1000}s`
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function setupEvmWallet(provider: ethers.JsonRpcProvider) {
  console.log("\n[1/5] Creating / retrieving Base (EVM) wallet...");
  const wallet = await getOrCreateEvmWallet();
  console.log(`  Address: ${wallet.address}`);

  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdcContract = new ethers.Contract(
    config.sodax.baseUsdc,
    usdcAbi,
    provider
  );
  const [ethBalance, usdcBalance] = await Promise.all([
    provider.getBalance(wallet.address),
    usdcContract.balanceOf(wallet.address),
  ]);

  const amountIn = BigInt(
    Math.round(Number(BRIDGE_AMOUNT_USDC) * 10 ** config.sodax.usdcDecimals)
  );

  console.log(`  ETH:  ${ethers.formatEther(ethBalance)} (need ≥ 0.0005)`);
  console.log(
    `  USDC: ${ethers.formatUnits(usdcBalance, 6)} (need ≥ ${BRIDGE_AMOUNT_USDC})`
  );

  if (ethBalance < MIN_ETH || usdcBalance < amountIn) {
    console.log("\n  ⚠️  Insufficient funds. Send to:", wallet.address);
    if (ethBalance < MIN_ETH) console.log("    • ETH:  need ≥ 0.0005");
    if (usdcBalance < amountIn) console.log(`    • USDC: need ≥ ${BRIDGE_AMOUNT_USDC}`);
    process.exit(0);
  }

  return { id: wallet.id, address: wallet.address, amountIn };
}

async function setupStellarWallet() {
  console.log("\n[2/5] Creating / retrieving Stellar wallet...");
  const wallet = await getOrCreateStellarWallet();
  console.log(`  Address: ${wallet.address}`);

  await ensureXlmFunding(wallet.address, MIN_XLM);
  await ensureUsdcTrustline(wallet.id, wallet.address);

  return { id: wallet.id, address: wallet.address };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Privy Full Bridge — Base → Stellar → Defindex (Mainnet)");
  console.log("────────────────────────────────────────────────────────────────");

  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);

  const evmWallet = await setupEvmWallet(provider);
  const stellarWallet = await setupStellarWallet();

  // Bridge USDC Base → Stellar
  console.log(`\n[3/5] Bridging ${BRIDGE_AMOUNT_USDC} USDC from Base to Stellar...`);
  const adapter = new PrivyEvmSodaxAdapter(
    evmWallet.id,
    evmWallet.address,
    BASE_CAIP2,
    provider
  );
  const sodax = await initializeSodax();
  const bridgeService = new SodaxBridgeService(sodax);

  const swapParams: SwapParams = {
    srcToken: {
      symbol: "USDC",
      address: config.sodax.baseUsdc,
      decimals: config.sodax.usdcDecimals,
      chainId: config.sodax.baseChainId,
    } as BridgeToken,
    dstToken: {
      symbol: "USDC",
      address: config.sodax.stellarUsdc,
      decimals: config.sodax.stellarDecimals,
      chainId: config.sodax.stellarChainId,
    } as BridgeToken,
    amountIn: evmWallet.amountIn,
    dstAddress: stellarWallet.address,
    slippageBps: 100,
  };

  const quote = await bridgeService.getQuote(swapParams);
  const swapResult = await bridgeService.executeSwap(adapter, swapParams, quote);
  console.log(`  ✅ Swap initiated! Basescan: https://basescan.org/tx/${swapResult.srcTxHash}`);

  const { destTxHash, amountReceived } = await bridgeService.pollStatus(
    swapResult.statusHash
  );
  console.log(`  ✅ Bridge SOLVED! Stellar tx: ${destTxHash}`);

  // Wait for USDC to land on Stellar before depositing
  console.log("\n[4/5] Waiting for USDC to confirm on Stellar...");
  await waitForUsdcBalance(stellarWallet.address, amountReceived);
  console.log("  ✅ USDC confirmed on Stellar.");

  // Deposit into Defindex vault
  const amountFormatted = ethers.formatUnits(amountReceived, 7);
  console.log(`\n[5/5] Depositing ${amountFormatted} USDC into Defindex vault...`);
  console.log(`  Vault: ${SOROSWAP_EARN_USDC_VAULT}`);

  const depositTxHash = await depositToDefindexVault(
    stellarWallet.id,
    stellarWallet.address,
    SOROSWAP_EARN_USDC_VAULT,
    amountReceived,
    config.defindexApiKey,
    "mainnet"
  );

  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("FULL FLOW COMPLETE");
  console.log(`  Base wallet:    ${evmWallet.address}`);
  console.log(`  Stellar wallet: ${stellarWallet.address}`);
  console.log(`  Bridge tx:      https://basescan.org/tx/${swapResult.srcTxHash}`);
  console.log(
    `  Defindex tx:    https://stellar.expert/explorer/public/tx/${depositTxHash}`
  );
}

main().catch((err) => {
  console.error("\nError:", err?.message ?? err);
  process.exit(1);
});
