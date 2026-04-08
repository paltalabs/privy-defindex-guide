import {
  Sodax,
  EvmSpokeProvider,
  BASE_MAINNET_CHAIN_ID,
  SolverIntentStatusCode,
  SONIC_MAINNET_CHAIN_ID,
} from "@sodax/sdk";

// ── Utils ────────────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const bigintReplacer = (_key: string, value: any) =>
  typeof value === "bigint" ? value.toString() : value;

export const formatError = (error: any): string => {
  if (error instanceof Error) return error.message;
  return JSON.stringify(error, bigintReplacer);
};

export const getStatusLabel = (code: number) => {
  switch (code) {
    case -1: return "NOT_FOUND (API indexing...)";
    case 1:  return "NOT_STARTED_YET";
    case 2:  return "STARTED_NOT_FINISHED (processing on Hub/Sonic)";
    case 3:  return "SOLVED";
    case 4:  return "FAILED";
    default: return `UNKNOWN (${code})`;
  }
};

// ── Sodax initialization ─────────────────────────────────────────────────────

export async function initializeSodax(): Promise<Sodax> {
  const sodax = new Sodax();
  const result = await sodax.initialize();
  if (!result.ok) throw new Error(`Sodax init failed: ${formatError(result.error)}`);
  return sodax;
}

// ── Allowance helper ─────────────────────────────────────────────────────────

/**
 * Checks whether the USDC allowance for the Sodax spoke contract is sufficient.
 * If not, sends an approval transaction and waits for confirmation.
 */
export async function handleAllowance(
  sodaxService: any,
  intentParams: any,
  spokeProvider: EvmSpokeProvider,
  walletProvider: any
): Promise<void> {
  const allowanceResult = await sodaxService.isAllowanceValid({
    intentParams,
    params: intentParams,
    spokeProvider: spokeProvider as any,
  });

  if (!allowanceResult.ok) {
    throw new Error(`Allowance check failed: ${formatError(allowanceResult.error)}`);
  }

  if (!allowanceResult.value) {
    console.log("  Allowance insufficient — sending approval...");
    const approveResult = await sodaxService.approve({
      intentParams,
      params: intentParams,
      spokeProvider: spokeProvider as any,
    });

    if (!approveResult.ok) {
      throw new Error(`Approval failed: ${formatError(approveResult.error)}`);
    }

    await walletProvider.waitForTransactionReceipt(
      approveResult.value as `0x${string}`
    );
    console.log("  Approval confirmed.");
  } else {
    console.log("  Allowance sufficient.");
  }
}
