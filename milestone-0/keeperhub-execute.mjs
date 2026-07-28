import fs from "node:fs";
import crypto from "node:crypto";

const mode = process.argv[2];
if (!["simulate-deploy", "deploy", "simulate-write", "write", "simulate-approve", "approve", "status"].includes(mode)) {
  throw new Error("Usage: node milestone-0/keeperhub-execute.mjs <simulate-deploy|deploy|simulate-write|write|simulate-approve|approve|status> [executionId]");
}

const token = process.env.KH_TOKEN;
if (!token) throw new Error("KH_TOKEN is required");

const baseUrl = "https://app.keeperhub.com";
const privateDir = new URL("./private/", import.meta.url);
const deployment = JSON.parse(fs.readFileSync(new URL("deployment.json", privateDir), "utf8"));
const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/milestone-0/SpikeCounter.json", import.meta.url), "utf8"));

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

let endpoint;
let request;
let outputName;

if (mode === "status") {
  const executionId = process.argv[3];
  if (!executionId) throw new Error("executionId is required");
  endpoint = `/api/execute/${encodeURIComponent(executionId)}/status`;
  outputName = `status-${executionId}.json`;
} else {
  const deploying = mode.endsWith("deploy");
  const approving = mode.endsWith("approve");
  const simulate = mode.startsWith("simulate");
  endpoint = "/api/execute/contract-call";
  request = deploying
    ? {
        contractAddress: deployment.singletonFactory,
        chainId: deployment.chainId,
        functionName: "deploy",
        functionArgs: JSON.stringify([deployment.initCode, deployment.salt]),
        abi: JSON.stringify(deployment.factoryAbi),
        value: "0",
        gasLimitMultiplier: 1.2,
      }
    : approving
      ? {
          contractAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
          chainId: deployment.chainId,
          functionName: "approve",
          functionArgs: JSON.stringify([deployment.executor, "42"]),
          abi: JSON.stringify([
            {
              type: "function",
              name: "approve",
              stateMutability: "nonpayable",
              inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              outputs: [{ name: "", type: "bool" }],
            },
          ]),
          value: "0",
          gasLimitMultiplier: 1.2,
        }
    : {
        contractAddress: deployment.expectedAddress,
        chainId: deployment.chainId,
        functionName: "setNumber",
        functionArgs: JSON.stringify(["42"]),
        abi: JSON.stringify(artifact.abi),
        value: "0",
        gasLimitMultiplier: 1.2,
      };
  if (simulate) request.simulate = true;
  if (!simulate) {
    const keyFile = new URL(`${mode}-idempotency-key.txt`, privateDir);
    let idempotencyKey;
    if (fs.existsSync(keyFile)) {
      idempotencyKey = fs.readFileSync(keyFile, "utf8").trim();
    } else {
      idempotencyKey = crypto.randomUUID();
      fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(keyFile, `${idempotencyKey}\n`, { mode: 0o600 });
    }
    headers["Idempotency-Key"] = idempotencyKey;
  }
  outputName = `${mode}.json`;
}

const response = await fetch(`${baseUrl}${endpoint}`, {
  method: request ? "POST" : "GET",
  headers,
  body: request ? JSON.stringify(request) : undefined,
});
const raw = await response.text();
let result;
try {
  result = JSON.parse(raw);
} catch {
  result = { raw };
}

fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
fs.writeFileSync(new URL(outputName, privateDir), JSON.stringify(result, null, 2), { mode: 0o600 });

const publicSummary = {
  httpStatus: response.status,
  success: result.success,
  wouldRevert: result.wouldRevert,
  executionId: result.executionId ?? result.id,
  status: result.status,
  transactionHash: result.transactionHash ?? result.txHash,
  transactionLink: result.transactionLink,
  error: result.error ?? result.message,
};
console.log(JSON.stringify(publicSummary, null, 2));
if (!response.ok) process.exitCode = 1;
