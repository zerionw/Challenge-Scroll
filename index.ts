import { config as initializeEnv } from "dotenv";
import {
  createWalletClient,
  http,
  getContract,
  erc20Abi,
  parseUnits,
  maxUint256,
  publicActions,
  concat,
  numberToHex,
  size,
} from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scroll } from "viem/chains";
import { wethAbi } from "./abi/weth-abi";

// Instructions for the 0x Challenge on Scroll Chain

/* 
1. Show liquidity source percentages
2. Implement affiliate fees and surplus collection
3. Show token buy/sell taxes
4. List all liquidity sources available on Scroll
*/

const queryString = require("qs");

// Initialize environment variables
initializeEnv();
const { PRIVATE_KEY, ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } = process.env;

// Check that all necessary environment variables are set
if (!PRIVATE_KEY) throw new Error("Error: PRIVATE_KEY is not defined.");
if (!ZERO_EX_API_KEY) throw new Error("Error: ZERO_EX_API_KEY is not defined.");
if (!ALCHEMY_HTTP_TRANSPORT_URL) throw new Error("Error: ALCHEMY_HTTP_TRANSPORT_URL is not defined.");

// Define HTTP request headers
const requestHeaders = new Headers({
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
});

// Configure wallet client
const walletClient = createWalletClient({
  account: privateKeyToAccount(`0x${PRIVATE_KEY}` as `0x${string}`),
  chain: scroll,
  transport: http(ALCHEMY_HTTP_TRANSPORT_URL),
}).extend(publicActions); // Extend with public actions for additional features

const [userWalletAddress] = await walletClient.getAddresses();

// Set up contract instances
const wethContract = getContract({
  address: "0x5300000000000000000000000000000000000004",
  abi: wethAbi,
  client: walletClient,
});

const wstEthContract = getContract({
  address: "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32",
  abi: erc20Abi,
  client: walletClient,
});

// Function to show the breakdown of liquidity sources by percentage
function printLiquidityBreakdown(tradeRoute: any) {
  const liquiditySources = tradeRoute.fills;
  const totalBps = liquiditySources.reduce(
    (total: number, source: any) => total + parseInt(source.proportionBps),
    0
  );

  console.log(`${liquiditySources.length} Liquidity Sources:`);
  liquiditySources.forEach((source: any) => {
    const proportionPercentage = (parseInt(source.proportionBps) / 100).toFixed(2);
    console.log(`${source.source}: ${proportionPercentage}%`);
  });
}

// Function to display taxes applied on token buy/sell operations
function showTokenTaxInfo(tokenDetails: any) {
  const buyTokenBuyTax = (parseInt(tokenDetails.buyToken.buyTaxBps) / 100).toFixed(2);
  const buyTokenSellTax = (parseInt(tokenDetails.buyToken.sellTaxBps) / 100).toFixed(2);
  const sellTokenBuyTax = (parseInt(tokenDetails.sellToken.buyTaxBps) / 100).toFixed(2);
  const sellTokenSellTax = (parseInt(tokenDetails.sellToken.sellTaxBps) / 100).toFixed(2);

  if (buyTokenBuyTax > 0 || buyTokenSellTax > 0) {
    console.log(`Buy Token Buy Tax: ${buyTokenBuyTax}%`);
    console.log(`Buy Token Sell Tax: ${buyTokenSellTax}%`);
  }

  if (sellTokenBuyTax > 0 || sellTokenSellTax > 0) {
    console.log(`Sell Token Buy Tax: ${sellTokenBuyTax}%`);
    console.log(`Sell Token Sell Tax: ${sellTokenSellTax}%`);
  }
}

// Function to retrieve and print all available liquidity sources on Scroll
const fetchLiquiditySources = async () => {
  const scrollChainId = walletClient.chain.id.toString(); // Ensure this matches Scroll's chain ID
  const queryParams = new URLSearchParams({
    chainId: scrollChainId,
  });

  const sourceResponse = await fetch(
    `https://api.0x.org/swap/v1/sources?${queryParams.toString()}`,
    {
      headers: requestHeaders,
    }
  );

  const sourcesResult = await sourceResponse.json();
  const availableSources = Object.keys(sourcesResult.sources);
  console.log("Liquidity Sources on Scroll:");
  console.log(availableSources.join(", "));
};

// Main async function
const mainExecution = async () => {
  // Step 4: Fetch and display all liquidity sources on Scroll
  await fetchLiquiditySources();

  // Step 2: Define sell amount and affiliate parameters
  const wethDecimals = (await wethContract.read.decimals()) as number;
  const amountToSell = parseUnits("0.1", wethDecimals);

  const affiliateFeeBasisPoints = "100"; // 1% affiliate fee
  const surplus = "true"; // Enable surplus collection

  // Step 1: Get price with affiliate and surplus parameters
  const priceQueryParams = new URLSearchParams({
    chainId: walletClient.chain.id.toString(),
    sellToken: wethContract.address,
    buyToken: wstEthContract.address,
    sellAmount: amountToSell.toString(),
    taker: walletClient.account.address,
    affiliateFee: affiliateFeeBasisPoints, // Affiliate fee parameter
    surplusCollection: surplus, // Surplus collection parameter
  });

  const priceResponse = await fetch(
    `https://api.0x.org/swap/permit2/price?${priceQueryParams.toString()}`,
    {
      headers: requestHeaders,
    }
  );

  const priceData = await priceResponse.json();
  console.log("Price data for swapping 0.1 WETH for wstETH:");
  console.log(priceData);

  // Step 2: Ensure Permit2 approval for WETH if needed
  if (priceData.issues.allowance !== null) {
    try {
      const approvalSimulation = await wethContract.simulate.approve([
        priceData.issues.allowance.spender,
        maxUint256,
      ]);
      console.log("Initiating approval for Permit2 to use WETH...");
      const approvalTransactionHash = await wethContract.write.approve(
        approvalSimulation.args
      );
      console.log("Permit2 approval transaction hash:", approvalTransactionHash);
    } catch (approvalError) {
      console.error("Permit2 approval error:", approvalError);
    }
  } else {
    console.log("No Permit2 approval required for WETH.");
  }

  // Step 3: Fetch and print a swap quote
  const quoteQueryParams = new URLSearchParams();
  for (const [key, value] of priceQueryParams.entries()) {
    quoteQueryParams.append(key, value);
  }

  const quoteResponse = await fetch(
    `https://api.0x.org/swap/permit2/quote?${quoteQueryParams.toString()}`,
    {
      headers: requestHeaders,
    }
  );

  const quoteData = await quoteResponse.json();
  console.log("Quote data for swapping 0.1 WETH for wstETH:");
  console.log(quoteData);

  // Step 1: Print liquidity sources breakdown
  if (quoteData.route) {
    printLiquidityBreakdown(quoteData.route);
  }

  // Step 3: Print token tax information
  if (quoteData.tokenMetadata) {
    showTokenTaxInfo(quoteData.tokenMetadata);
  }

  // Step 2: Print affiliate fee and trade surplus information
  if (quoteData.affiliateFeeBps) {
    const affiliateFee = (parseInt(quoteData.affiliateFeeBps) / 100).toFixed(2);
    console.log(`Affiliate Fee: ${affiliateFee}%`);
  }

  if (quoteData.tradeSurplus && parseFloat(quoteData.tradeSurplus) > 0) {
    console.log(`Collected Trade Surplus: ${quoteData.tradeSurplus}`);
  }

  // Continue with transaction signing and submission logic...
};

mainExecution();
