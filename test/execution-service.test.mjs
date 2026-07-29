import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionService } from "../src/server/execution-service.mjs";

const vault = "0x1000000000000000000000000000000000000001";
const owner = "0x2000000000000000000000000000000000000002";

test("execution service verifies ownership, simulates, submits once, and persists", async () => {
  const calls = [];
  const saved = [];
  const service = createExecutionService({
    verifyAuthorization: async (intent) => {
      calls.push(["authorize", intent.owner]);
      return true;
    },
    isFactoryMandate: async (address) => address === vault,
    readOwner: async () => owner,
    readSnapshot: async () => ({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
      now: 100,
      obligations: [{ id: 0, status: "Pending", dueAt: 90 }],
      allowanceTargets: [],
      trackedTokens: [],
    }),
    findExecution: async () => null,
    saveExecution: async (record) => saved.push(record),
    keeperHub: {
      simulateContractCall: async (call) => {
        calls.push(["simulate", call.functionName]);
        return { success: true, wouldRevert: false };
      },
      executeContractCall: async (call, options) => {
        calls.push(["execute", call.functionName, options.idempotencyKey]);
        return { executionId: "kh_run_1", status: "submitted" };
      },
    },
    vaultAbi: [],
    chainId: 11155111,
  });

  const result = await service.executeStep({
    vault,
    owner,
    issuedAt: 1_786_000_000,
    signature: "0x1234",
  });

  assert.equal(result.executionId, "kh_run_1");
  assert.equal(result.action.kind, "settleObligation");
  assert.equal(saved.length, 1);
  assert.deepEqual(calls, [
    ["authorize", owner],
    ["simulate", "settleObligation"],
    [
      "execute",
      "settleObligation",
      `mandate:11155111:${vault.toLowerCase()}:settleObligation:0`,
    ],
  ]);
});

test("execution service refuses unknown vaults and failed simulations", async () => {
  const base = {
    verifyAuthorization: async () => true,
    readOwner: async () => owner,
    readSnapshot: async () => ({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
      now: 100,
      obligations: [],
      allowanceTargets: [],
      trackedTokens: [],
    }),
    findExecution: async () => null,
    saveExecution: async () => {},
    keeperHub: {
      simulateContractCall: async () => ({ success: false, wouldRevert: true }),
      executeContractCall: async () => {
        throw new Error("must not execute");
      },
    },
    vaultAbi: [],
    chainId: 11155111,
  };

  const unknown = createExecutionService({
    ...base,
    isFactoryMandate: async () => false,
  });
  await assert.rejects(
    unknown.executeStep({ vault, owner, issuedAt: 1, signature: "0x12" }),
    /factory/i,
  );

  const reverting = createExecutionService({
    ...base,
    isFactoryMandate: async () => true,
  });
  await assert.rejects(
    reverting.executeStep({ vault, owner, issuedAt: 1, signature: "0x12" }),
    /simulation/i,
  );
});

test("execution service retries a KeeperHub-terminal failure with a new idempotency key", async () => {
  const saved = [];
  const updated = [];
  const service = createExecutionService({
    verifyAuthorization: async () => true,
    isFactoryMandate: async () => true,
    readOwner: async () => owner,
    readSnapshot: async () => ({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
      now: 100,
      obligations: [{ id: 0, status: "Pending", dueAt: 90 }],
      allowanceTargets: [],
      trackedTokens: [],
    }),
    findExecution: async () => ({
      executionId: "failed-run",
      status: "submitted",
      attemptCount: 1,
    }),
    saveExecution: async (record) => saved.push(record),
    updateExecution: async (record) => updated.push(record),
    keeperHub: {
      getExecutionStatus: async () => ({
        executionId: "failed-run",
        status: "failed",
      }),
      simulateContractCall: async () => ({ success: true, wouldRevert: false }),
      executeContractCall: async (_call, options) => {
        assert.match(options.idempotencyKey, /:attempt:2$/);
        return { executionId: "retry-run", status: "submitted" };
      },
    },
    vaultAbi: [],
    chainId: 11155111,
  });

  const result = await service.executeStep({
    scope: "autonomous-closeout",
    vault,
    owner,
    chainId: 11155111,
    issuedAt: 1,
    validUntil: 2,
    nonce: "nonce-value-123456",
    signature: "0x12",
  });

  assert.equal(result.executionId, "retry-run");
  assert.equal(saved[0].attemptCount, 2);
  assert.equal(updated[0].status, "failed");
});
