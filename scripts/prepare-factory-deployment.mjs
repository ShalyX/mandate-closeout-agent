import fs from "node:fs";
import { prepareFactoryDeployment } from "../src/deployment/factory.mjs";

const singletonFactory = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const executor = process.env.KEEPERHUB_EXECUTOR;
if (!executor) throw new Error("KEEPERHUB_EXECUTOR is required");

const artifact = JSON.parse(
  fs.readFileSync("artifacts/contracts/MandateFactory.json", "utf8"),
);
const plan = prepareFactoryDeployment({
  singletonFactory,
  executor,
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  saltLabel: "mandate-factory-sepolia-v1",
});

fs.mkdirSync("deployments/private", { recursive: true, mode: 0o700 });
fs.writeFileSync(
  "deployments/private/factory-plan.json",
  `${JSON.stringify(plan, null, 2)}\n`,
  { mode: 0o600 },
);
process.stdout.write(
  `${JSON.stringify({
    chainId: 11155111,
    executor: plan.executor,
    factory: plan.expectedAddress,
  }, null, 2)}\n`,
);
