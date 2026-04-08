# Sodax Bridge — Base USDC → Stellar USDC

Intent-based cross-chain bridge using the Sodax SDK (`@sodax/sdk`).
Routes: Base Mainnet → Sonic Hub → Stellar Mainnet.

---

## Step 1 — Initialize Sodax

```ts
import { Sodax } from "@sodax/sdk";

const sodax = new Sodax();
const result = await sodax.initialize();
if (!result.ok) throw new Error(`Init failed: ${result.error}`);
```

No manual chain config needed — `initialize()` fetches everything automatically.

---

## Step 2 — Get a Quote

```ts
import { SolverIntentQuoteRequest } from "@sodax/sdk";
import { SpokeChainId } from "@sodax/types";

const BASE_MAINNET_CHAIN_ID = "eip155:8453";
const STELLAR_MAINNET_CHAIN_ID = "stellar:pubnet";

const request: SolverIntentQuoteRequest = {
  token_src: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on Base (6 dec)
  token_src_blockchain_id: BASE_MAINNET_CHAIN_ID as SpokeChainId,
  token_dst: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", // USDC SAC
  token_dst_blockchain_id: STELLAR_MAINNET_CHAIN_ID as SpokeChainId,
  amount: amountIn,       // bigint, USDC units (6 decimals)
  quote_type: "exact_input",
};

const result = await sodax.swaps.getQuote(request);
// result.value.quoted_amount → bigint output in Stellar stroops (7 decimals)
```

**Gotcha:** The quote endpoint occasionally returns error code `-999` (transient
solver unavailability). Retry up to 5 times with 5s backoff.

---

## Step 3 — Check & Approve Allowance

```ts
const allowanceValid = await sodax.swaps.isAllowanceValid({
  intentParams,
  spokeProvider,
});

if (!allowanceValid.value) {
  const approveResult = await sodax.swaps.approve({ intentParams, spokeProvider });
  await wallet.waitForTransactionReceipt(approveResult.value);
}
```

---

## Step 4 — Execute Swap

```ts
import { CreateIntentParams } from "@sodax/sdk";
import { EvmSpokeProvider } from "@sodax/sdk";

const slippageBps = 100; // 1%
const minOutputAmount = (quote.quoted_amount * BigInt(10000 - slippageBps)) / 10000n;

const intentParams: CreateIntentParams = {
  inputToken:       "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  outputToken:      "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  inputAmount:      amountIn,
  minOutputAmount,
  deadline:         BigInt(Math.floor(Date.now() / 1000) + 3600),
  allowPartialFill: false,
  srcChain:         BASE_MAINNET_CHAIN_ID as SpokeChainId,
  dstChain:         STELLAR_MAINNET_CHAIN_ID as SpokeChainId,
  srcAddress:       evmAddress,
  dstAddress:       stellarAddress,  // Stellar G-address
  solver:           "0x0000000000000000000000000000000000000000",
  data:             "0x",
};

const spokeProvider = new EvmSpokeProvider(
  privyAdapter,
  sodax.config.spokeChainConfig[BASE_MAINNET_CHAIN_ID as SpokeChainId] as any
);

const swapResult = await sodax.swaps.swap({ intentParams, spokeProvider });
const [solverResponse, _intent, deliveryInfo] = swapResult.value;

const srcTxHash  = deliveryInfo.srcTxHash;
const statusHash = solverResponse.intent_hash || deliveryInfo.srcTxHash;
```

---

## Step 5 — Poll Bridge Status

```ts
// Status codes
// -1 = NOT_FOUND (API indexing)
//  1 = NOT_STARTED_YET
//  2 = STARTED_NOT_FINISHED (processing on Hub/Sonic)
//  3 = SOLVED ✅
//  4 = FAILED ❌

const statusResult = await sodax.swaps.getStatus({
  intent_tx_hash: statusHash as `0x${string}`,
});

if (statusResult.value.status === SolverIntentStatusCode.SOLVED) {
  const fillTxHash = statusResult.value.fill_tx_hash;

  // Fetch actual settled amount from Hub chain (NOT from status alone)
  const intentState = await sodax.swaps.getFilledIntent(fillTxHash);
  const amountReceived = intentState.receivedOutput; // bigint, Stellar stroops

  // Resolve Stellar destination tx hash
  const packetResult = await sodax.swaps.getSolvedIntentPacket({
    chainId: SONIC_MAINNET_CHAIN_ID,
    fillTxHash,
  });
  const destTxHash = packetResult.value.dst_tx_hash;
}
```

---

## Step 6 — Wait for USDC on Stellar

**Critical:** Sodax marks `SOLVED` on the Hub (Sonic) **before** the Stellar
transaction is included in a ledger. Always poll Horizon before depositing into Defindex.

```ts
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

async function getHorizonUsdcBalance(address: string): Promise<bigint> {
  const res = await fetch(`https://horizon.stellar.org/accounts/${address}`);
  if (res.status === 404) return 0n;
  const data = await res.json();
  const entry = data.balances.find(
    b => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
  );
  if (!entry) return 0n;
  return BigInt(Math.round(parseFloat(entry.balance) * 10_000_000));
}

// Poll every 10s, up to 6 minutes
for (let i = 0; i < 36; i++) {
  if (await getHorizonUsdcBalance(stellarAddress) >= amountReceived) break;
  await new Promise(r => setTimeout(r, 10_000));
}
```

**Do NOT use Soroban RPC** for balance polling — see [08-gotchas.md](./08-gotchas.md) §E7.

---

## Decimal Conversion Reference

| Token | Decimals | 1 unit |
|---|---|---|
| USDC (Base) | 6 | `1_000_000` |
| USDC (Stellar SAC) | 7 | `10_000_000` |
| XLM | 7 | `10_000_000` stroops |

Bridge input uses 6-decimal USDC. Everything received on Stellar is 7-decimal stroops.

---

## IEvmWalletProvider Implementation (Privy Adapter)

Sodax requires an `IEvmWalletProvider` to sign EVM transactions. For Privy server wallets:

```ts
class PrivyEvmSodaxAdapter implements IEvmWalletProvider {
  getWalletAddress() → evmAddress
  sendTransaction(tx) → privy.sendTransaction (convert BigInt value to hex first!)
  waitForTransactionReceipt(hash) → ethers provider
}
```

See `src/shared/privy-evm-sodax-adapter.ts` for the full implementation.
