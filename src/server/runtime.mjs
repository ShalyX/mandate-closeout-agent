import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { readMandateSnapshot } from "../chain/state-reader.mjs";
import { createKeeperHubHttpAdapter } from "../keeperhub/http-adapter.mjs";
import { createExecutionService } from "./execution-service.mjs";
import { createAutonomyService } from "./autonomy-service.mjs";
import { verifyExecutionAuthorization } from "./execution-authorization.mjs";
import { createExecutionRepository } from "./execution-repository.mjs";
import { factoryAbi, vaultAbi } from "./abis.mjs";

export const CHAIN_ID = 11155111;
export const FACTORY = "0x4977Bf6C7120b7335bA4c06e516E938FDDC6D9a5";
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export function createServerRuntime() {
  const keeperHubApiKey = (
    process.env.KH_API_KEY ??
    process.env.KH_TOKEN ??
    ""
  ).trim();
  if (!keeperHubApiKey) throw new Error("KeeperHub API key is required");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL, { timeout: 8_000 }),
  });
  const repository = createExecutionRepository();
  const keeperHub = createKeeperHubHttpAdapter({
    apiKey: keeperHubApiKey,
  });
  const service = createExecutionService({
    verifyAuthorization: (intent) =>
      verifyExecutionAuthorization(intent, { expectedChainId: CHAIN_ID }),
    isFactoryMandate: (vault) =>
      client.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: "isMandate",
        args: [vault],
      }),
    readOwner: (vault) =>
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "owner",
      }),
    readSnapshot: (vault) =>
      readMandateSnapshot({
        client,
        vault,
        abi: vaultAbi,
        now: Math.floor(Date.now() / 1_000),
      }),
    findExecution: repository.findExecution,
    saveExecution: repository.saveExecution,
    updateExecution: repository.updateExecution,
    keeperHub,
    vaultAbi,
    chainId: CHAIN_ID,
  });
  const autonomy = createAutonomyService({
    verifyAuthorization: (intent) =>
      verifyExecutionAuthorization(intent, { expectedChainId: CHAIN_ID }),
    isFactoryMandate: (vault) =>
      client.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: "isMandate",
        args: [vault],
      }),
    readOwner: (vault) =>
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "owner",
      }),
    readLifecycle: async (vault) => {
      const [active, finalized, endAt] = await Promise.all([
        client.readContract({ address: vault, abi: vaultAbi, functionName: "active" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "finalized" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "endAt" }),
      ]);
      return { active, finalized, endAt: Number(endAt) };
    },
    saveAuthorization: repository.saveAuthorization,
  });
  const readSnapshot = (vault) =>
    readMandateSnapshot({
      client,
      vault,
      abi: vaultAbi,
      now: Math.floor(Date.now() / 1_000),
    });
  return { client, keeperHub, repository, service, autonomy, readSnapshot };
}
