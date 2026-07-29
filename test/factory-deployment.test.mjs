import assert from "node:assert/strict";
import test from "node:test";
import { getCreate2Address, keccak256 } from "viem";
import { prepareFactoryDeployment } from "../src/deployment/factory.mjs";

test("factory deployment plan binds the platform executor deterministically", () => {
  const singletonFactory = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
  const executor = "0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e";
  const bytecode = "0x6000600055";
  const plan = prepareFactoryDeployment({
    singletonFactory,
    executor,
    bytecode,
    saltLabel: "mandate-factory-sepolia-v1",
    abi: [
      {
        type: "constructor",
        inputs: [{ name: "platformExecutor_", type: "address" }],
        stateMutability: "nonpayable",
      },
    ],
  });

  assert.equal(plan.executor, executor);
  assert.equal(plan.expectedAddress, getCreate2Address({
    from: singletonFactory,
    salt: plan.salt,
    bytecodeHash: keccak256(plan.initCode),
  }));
  assert.ok(plan.initCode.toLowerCase().includes(executor.slice(2).toLowerCase()));
});
