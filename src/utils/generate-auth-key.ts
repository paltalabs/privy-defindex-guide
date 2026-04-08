/**
 * Generates a P-256 Authorization Keypair for Privy server-side wallet automation.
 *
 * Alternative: create the key directly in the Privy Dashboard:
 *   Dashboard → Your App → Wallets → Authorization keys → New key
 *
 * The Dashboard approach is simpler — use this script only for CI/CD automation.
 * Usage: pnpm keygen
 */
import "dotenv/config";
import { generateP256KeyPair } from "@privy-io/node";

const { privateKey, publicKey } = await generateP256KeyPair();

console.log("──────────────────────────────────────────────────────────────");
console.log("Privy P-256 Authorization Keypair");
console.log("──────────────────────────────────────────────────────────────");
console.log("\nAdd to your .env:\n");
console.log(`PRIVY_AUTHORIZATION_PRIVATE_KEY=${privateKey}`);
console.log("\n⚠️  Register the PUBLIC KEY in Privy Dashboard:");
console.log("   Dashboard → Your App → Wallets → Authorization keys → New key");
console.log(`\n   Public key:\n   ${publicKey}`);
console.log("──────────────────────────────────────────────────────────────");
