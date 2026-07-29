import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createExecutionRepository } from "../src/server/execution-repository.mjs";
import { FACTORY } from "../src/server/runtime.mjs";

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  const checks = {
    keeperHubConfigured: Boolean(process.env.KH_API_KEY ?? process.env.KH_TOKEN),
    databaseConfigured: Boolean(
      process.env.DATABASE_URL ??
        process.env.POSTGRES_URL ??
        process.env.NEON_DATABASE_URL,
    ),
    factoryReachable: false,
    databaseReachable: false,
  };
  const client = createPublicClient({
    chain: sepolia,
    transport: http(
      process.env.SEPOLIA_RPC_URL ??
        "https://ethereum-sepolia-rpc.publicnode.com",
      { timeout: 8_000 },
    ),
  });
  try {
    checks.factoryReachable = Boolean(
      await client.getBytecode({ address: FACTORY }),
    );
  } catch {}
  if (checks.databaseConfigured) {
    try {
      checks.databaseReachable = await createExecutionRepository().ping();
    } catch {}
  }
  const ok = Object.values(checks).every(Boolean);
  return res
    .status(ok ? 200 : 503)
    .json({ ok, ...(ok ? {} : { error: "service_not_ready" }), checks });
}
