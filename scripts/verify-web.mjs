import fs from "node:fs";
import { createPublicClient, http, parseAbi, zeroAddress } from "viem";
import { sepolia } from "viem/chains";

const startedAt = performance.now();
const vault = "0x63001f6B89bb212895e6f4B5c074Dc3E86B11a0a";
const token = "0x56E766e5ED1cC545B60F43651F67b1371d9ead5f";
const spender = "0x1000000000000000000000000000000000000003";
const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
    timeout: 8_000,
  }),
});

const vaultAbi = parseAbi([
  "function finalized() view returns (bool)",
  "function executor() view returns (address)",
]);
const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

function fail(failedStep, message) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      command: "verify:web",
      environment: "local-build+sepolia",
      timestamp: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startedAt),
      failedStep,
      errorCode: "PRODUCT_ASSERTION_FAILED",
      message,
    })}\n`,
  );
  process.exit(1);
}

try {
  const index = fs.readFileSync("dist/index.html", "utf8");
  if (!index.includes("Mandate")) {
    fail("static-build", "Built document does not contain the product title.");
  }
  const assetNames = fs.readdirSync("dist/assets");
  if (!assetNames.some((name) => name.endsWith(".js"))) {
    fail("static-build", "Built document has no JavaScript bundle.");
  }

  const [finalized, executor, balance, allowance] = await Promise.all([
    client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "finalized",
    }),
    client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "executor",
    }),
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [vault],
    }),
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "allowance",
      args: [vault, spender],
    }),
  ]);

  if (!finalized || executor !== zeroAddress || balance !== 0n || allowance !== 0n) {
    fail("live-state", "Sepolia mandate is not fully closed.");
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      command: "verify:web",
      environment: "local-build+sepolia",
      timestamp: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startedAt),
      assertions: {
        staticBuild: true,
        liveSepoliaRead: true,
        finalized,
        executorRemoved: executor === zeroAddress,
        vaultBalance: balance.toString(),
        allowance: allowance.toString(),
      },
      evidence: {
        vault,
        token,
      },
    })}\n`,
  );
} catch (error) {
  fail(
    "verification-runtime",
    error instanceof Error ? error.message : "Unknown verification error",
  );
}

