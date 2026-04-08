import crypto from "crypto";
import { PrivyClient } from "@privy-io/node";
import { config } from "./config.js";

/**
 * Singleton Privy client initialized with App ID and App Secret.
 *
 * Prerequisite: TEE execution must be enabled in the Privy Dashboard for Tier 2
 * chains (Stellar) and server-side wallet access.
 * Dashboard → Your App → Wallets → Execution environments → Enable TEE
 */
export const privy = new PrivyClient({
  appId: config.privy.appId,
  appSecret: config.privy.appSecret,
});

/**
 * Returns an AuthorizationContext signed with the stored P-256 authorization
 * private key. This replaces the need for any user OTP or interactive approval —
 * the Authorization Key pattern is the server-side equivalent of Crossmint's
 * external-wallet adminSigner.
 */
export function buildAuthContext() {
  return {
    authorization_private_keys: [config.privy.authorizationPrivateKey],
  };
}

/**
 * Derives the base64-encoded SPKI DER public key from a Privy authorization
 * private key string (format: "wallet-auth:<base64-PKCS8-DER>").
 *
 * The returned value is what Privy's `owner: { public_key }` field expects
 * when creating wallets. No need to store the public key separately.
 */
export function derivePublicKey(privKeyStr: string): string {
  const base64Der = privKeyStr.replace(/^wallet-auth:/, "");
  const derBuffer = Buffer.from(base64Der, "base64");

  const privateKey = crypto.createPrivateKey({
    key: derBuffer,
    format: "der",
    type: "pkcs8",
  });

  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  return Buffer.from(publicKeyDer).toString("base64");
}

/** Lazily derived public key (computed once from the stored private key). */
export const authorizationPublicKey = derivePublicKey(
  config.privy.authorizationPrivateKey
);
