import {
  Sodax,
  EvmSpokeProvider,
  SolverIntentQuoteRequest,
  CreateIntentParams,
  SolverIntentStatusCode,
  SONIC_MAINNET_CHAIN_ID,
} from "@sodax/sdk";
import { IEvmWalletProvider, SpokeChainId } from "@sodax/types";
import {
  IBridgeService,
  SwapParams,
  BridgeQuote,
  BridgeExecutionResult,
  BridgePollResult,
} from "./bridge-types.js";
import { formatError, getStatusLabel, sleep, handleAllowance } from "./sodax.js";

export class SodaxBridgeService implements IBridgeService {
  constructor(private sodax: Sodax) {}

  async getQuote(params: SwapParams, maxAttempts = 5): Promise<BridgeQuote> {
    const request: SolverIntentQuoteRequest = {
      token_src: params.srcToken.address,
      token_src_blockchain_id: params.srcToken.chainId as SpokeChainId,
      token_dst: params.dstToken.address,
      token_dst_blockchain_id: params.dstToken.chainId as SpokeChainId,
      amount: params.amountIn,
      quote_type: "exact_input",
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.sodax.swaps.getQuote(request);
      if (result.ok) {
        return {
          amountIn: params.amountIn,
          amountOut: result.value.quoted_amount,
          fee: 0n,
          rawQuote: result.value,
        };
      }
      const errMsg = formatError(result.error);
      if (attempt < maxAttempts) {
        console.log(`  Quote attempt ${attempt}/${maxAttempts} failed (${errMsg}) — retrying in 5s...`);
        await sleep(5000);
      } else {
        throw new Error(`Quote failed after ${maxAttempts} attempts: ${errMsg}`);
      }
    }
    throw new Error("Quote failed");
  }

  async executeSwap(
    signer: IEvmWalletProvider,
    params: SwapParams,
    quote: BridgeQuote
  ): Promise<BridgeExecutionResult> {
    const evmAddress = await signer.getWalletAddress();

    const spokeProvider = new EvmSpokeProvider(
      signer as any,
      this.sodax.config.spokeChainConfig[params.srcToken.chainId as SpokeChainId] as any
    );

    const slippageBps = params.slippageBps ?? 100;
    const minOutputAmount = (quote.amountOut * BigInt(10000 - slippageBps)) / 10000n;

    const intentParams: CreateIntentParams = {
      inputToken: params.srcToken.address,
      outputToken: params.dstToken.address,
      inputAmount: params.amountIn,
      minOutputAmount,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      allowPartialFill: false,
      srcChain: params.srcToken.chainId as SpokeChainId,
      dstChain: params.dstToken.chainId as SpokeChainId,
      srcAddress: evmAddress,
      dstAddress: params.dstAddress,
      solver: "0x0000000000000000000000000000000000000000",
      data: "0x",
    };

    await handleAllowance(this.sodax.swaps, intentParams, spokeProvider, signer as any);

    const swapResult = await this.sodax.swaps.swap({
      intentParams,
      spokeProvider: spokeProvider as any,
    });

    if (!swapResult.ok) {
      throw new Error(
        `Swap failed: ${swapResult.error.code} - ${formatError(swapResult.error.data)}`
      );
    }

    const [solverResponse, _intent, deliveryInfo] = swapResult.value;

    return {
      srcTxHash: deliveryInfo.srcTxHash as string,
      statusHash: (solverResponse.intent_hash || deliveryInfo.srcTxHash) as string,
    };
  }

  async pollStatus(
    statusHash: string,
    maxAttempts = 120
  ): Promise<BridgePollResult> {
    console.log(`  Polling bridge status...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statusResult = await this.sodax.swaps.getStatus({
        intent_tx_hash: statusHash as `0x${string}`,
      });

      if (statusResult.ok) {
        const status = statusResult.value.status;
        console.log(`  Attempt ${attempt}/${maxAttempts} — ${getStatusLabel(status)}`);

        if (status === SolverIntentStatusCode.SOLVED) {
          const fillTxHash = statusResult.value.fill_tx_hash as `0x${string}` | undefined;

          let amountReceived = 0n;
          if (fillTxHash) {
            try {
              const intentState = await this.sodax.swaps.getFilledIntent(fillTxHash);
              amountReceived = intentState.receivedOutput;
            } catch {
              console.warn(`  Could not fetch filled intent state — amountReceived=0`);
            }
          }

          let destTxHash = "SOLVED (Stellar hash pending)";
          if (fillTxHash) {
            const packetResult = await this.sodax.swaps.getSolvedIntentPacket({
              chainId: SONIC_MAINNET_CHAIN_ID,
              fillTxHash,
            });
            if (packetResult.ok) {
              destTxHash = packetResult.value.dst_tx_hash;
            }
          }

          return { destTxHash, amountReceived };
        }

        if (status === SolverIntentStatusCode.FAILED) {
          throw new Error(`Bridge swap failed on-chain (status: ${status})`);
        }
      }

      await sleep(10000);
    }

    throw new Error("Bridge status polling timed out");
  }
}
