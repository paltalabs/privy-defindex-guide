import "dotenv/config";
import {
  BASE_MAINNET_CHAIN_ID,
  STELLAR_MAINNET_CHAIN_ID,
  SONIC_MAINNET_CHAIN_ID,
} from "@sodax/sdk";

// ── Vault addresses ──────────────────────────────────────────────────────────

/** Soroswap Earn USDC vault — Stellar mainnet */
export const SOROSWAP_EARN_USDC_VAULT =
  "CA2FIPJ7U6BG3N7EOZFI74XPJZOEOD4TYWXFVCIO5VDCHTVAGS6F4UKK";

/** XLM vault — Stellar testnet (used in examples 03–05) */
export const XLM_DEFINDEX_VAULT_TESTNET =
  "CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6";

// ── Config ───────────────────────────────────────────────────────────────────

export const config = {
  // Defindex API
  defindexApiUrl: process.env.DEFINDEX_API_URL ?? "https://api.defindex.io",
  defindexApiKey: process.env.DEFINDEX_API_KEY ?? "",
  defindexVaultAddress: SOROSWAP_EARN_USDC_VAULT,

  // Privy server-wallet config
  privy: {
    appId: process.env.PRIVY_APP_ID ?? "",
    appSecret: process.env.PRIVY_APP_SECRET ?? "",
    // Format from Privy Dashboard: "wallet-auth:<base64-PKCS8-DER>"
    authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? "",
  },

  // Stellar
  stellarServerKey: process.env.STELLAR_SERVER_KEY ?? "",
  stellarHorizonUrl:
    process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org",

  // Base / EVM
  baseRpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",

  // Sodax bridge constants
  sodax: {
    baseUsdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",       // USDC on Base (6 dec)
    stellarUsdc: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", // USDC SAC on Stellar (7 dec)
    usdcDecimals: 6,
    stellarDecimals: 7,
    baseChainId: BASE_MAINNET_CHAIN_ID,
    stellarChainId: STELLAR_MAINNET_CHAIN_ID,
    hubChainId: SONIC_MAINNET_CHAIN_ID,
  },

  // Default bridge amount (USDC)
  bridge: {
    amount: "0.1",
    usdcDecimals: 6,
  },
};

// Warn on missing Privy credentials — individual scripts will throw if needed
if (!config.privy.appId || !config.privy.appSecret) {
  console.warn(
    "Warning: PRIVY_APP_ID or PRIVY_APP_SECRET is not set. Privy wallet calls will fail."
  );
}
