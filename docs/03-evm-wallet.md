# EVM Wallet — Privy Tier 3 (Base Mainnet)

Base is a **Tier 3** chain in Privy — full `sendTransaction` support, gas estimation,
and broadcasting are all handled by Privy. No manual transaction construction needed.

---

## Create / Retrieve Wallet

```ts
const wallet = await privy.wallets().create({
  chain_type: "ethereum",
  owner: { public_key: authorizationPublicKey },
  idempotency_key: "my-app-ethereum-wallet-v1",
});

console.log(wallet.address); // 0x... EVM address
console.log(wallet.id);      // Privy wallet ID
```

---

## Send a Transaction

```ts
const response = await privy
  .wallets()
  .ethereum()
  .sendTransaction(walletId, {
    caip2: "eip155:8453",  // Base mainnet
    params: {
      transaction: {
        to: "0xRecipient...",
        value: "0x0",       // hex-encoded value — BigInt is NOT JSON-serializable
        data: "0x",
      },
    },
    authorization_context: {
      authorization_private_keys: [authorizationPrivateKey],
    },
  });

const txHash = response.hash ?? response.transaction_hash;
```

**Critical:** Privy cannot serialize JavaScript `BigInt`. Always convert `value` to a
`0x`-prefixed hex string:

```ts
const valueHex = "0x" + BigInt(someValue).toString(16);
```

---

## Check ETH Balance

```ts
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const balanceWei = await provider.getBalance(wallet.address);
const balanceEth = ethers.formatEther(balanceWei);
```

## Check USDC Balance

```ts
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
const usdcContract = new ethers.Contract(USDC_BASE, usdcAbi, provider);
const balanceUnits = await usdcContract.balanceOf(wallet.address); // 6 decimals
const balanceUsdc = ethers.formatUnits(balanceUnits, 6);
```

---

## CAIP-2 Chain Identifiers

| Network | CAIP-2 |
|---|---|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

---

## Minimum Funding for Bridge

| Asset | Minimum | Purpose |
|---|---|---|
| ETH | 0.0005 ETH | Gas for ERC-20 approve + createIntent (~2 txs) |
| USDC | ≥ bridge amount | Input to the Sodax swap |
