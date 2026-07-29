import crypto from "node:crypto";
import fs from "node:fs";
import { createKeeperHubHttpAdapter } from "../src/keeperhub/http-adapter.mjs";

const mode = process.argv[2];
if (!["simulate", "execute", "status"].includes(mode)) {
  throw new Error(
    "Usage: node scripts/run-factory-deployment.mjs <simulate|execute|status> [executionId]",
  );
}

const apiKey = process.env.KH_TOKEN;
if (!apiKey) throw new Error("KH_TOKEN is required");

const planPath = "deployments/private/factory-plan.json";
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const adapter = createKeeperHubHttpAdapter({ apiKey });
const call = {
  chainId: 11155111,
  contractAddress: plan.singletonFactory,
  functionName: "deploy",
  args: [plan.initCode, plan.salt],
  abi: [
    {
      type: "function",
      name: "deploy",
      stateMutability: "nonpayable",
      inputs: [
        { name: "_initCode", type: "bytes" },
        { name: "_salt", type: "bytes32" },
      ],
      outputs: [{ name: "createdContract", type: "address" }],
    },
  ],
};

fs.mkdirSync("deployments/private", { recursive: true, mode: 0o700 });

if (mode === "simulate") {
  const result = await adapter.simulateContractCall(call);
  fs.writeFileSync(
    "deployments/private/factory-simulation.json",
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(
    `${JSON.stringify({
      success: result.success,
      wouldRevert: result.wouldRevert,
      gasEstimate: result.gasEstimate,
    }, null, 2)}\n`,
  );
} else if (mode === "execute") {
  const keyPath = "deployments/private/factory-idempotency-key.txt";
  const idempotencyKey = fs.existsSync(keyPath)
    ? fs.readFileSync(keyPath, "utf8").trim()
    : crypto.randomUUID();
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, `${idempotencyKey}\n`, { mode: 0o600 });
  }
  const result = await adapter.executeContractCall(call, { idempotencyKey });
  fs.writeFileSync(
    "deployments/private/factory-execution.json",
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const executionId = process.argv[3];
  if (!executionId) throw new Error("executionId is required");
  const result = await adapter.getExecutionStatus(executionId);
  fs.writeFileSync(
    "deployments/private/factory-status.json",
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
