import assert from "node:assert/strict";
import test from "node:test";
import { runAutonomyCycle } from "../src/server/autonomy-runner.mjs";

const authorization = {
  scope: "autonomous-closeout",
  vault: "0x1000000000000000000000000000000000000001",
  owner: "0x2000000000000000000000000000000000000002",
  chainId: 11155111,
  issuedAt: 1_786_000_000,
  validUntil: 1_786_086_400,
  nonce: "b60aacdf-f650-46f0-b380-b206ef454723",
  signature: `0x${"12".repeat(65)}`,
  leaseToken: "lease-1",
};

test("autonomous cycle submits exactly one eligible step and releases its lease", async () => {
  const released = [];
  const result = await runAutonomyCycle({
    now: 1_786_020_000,
    claimAuthorizations: async () => [authorization],
    readSnapshot: async () => ({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
    }),
    executeStep: async (intent) => {
      assert.equal(intent.signature, authorization.signature);
      return {
        action: { kind: "settleObligation", obligationId: 0 },
        executionId: "run-autonomous-1",
        status: "submitted",
      };
    },
    releaseAuthorization: async (...args) => released.push(args),
  });

  assert.deepEqual(result, {
    claimed: 1,
    submitted: 1,
    waiting: 0,
    completed: 0,
    failed: 0,
  });
  assert.deepEqual(released[0], [
    authorization.vault,
    "lease-1",
    {
      status: "running",
      lastAction: "settleObligation",
      executionId: "run-autonomous-1",
    },
  ]);
});

test("autonomous cycle waits before closeout and completes only from finalized chain state", async () => {
  const records = [
    authorization,
    { ...authorization, vault: "0x3000000000000000000000000000000000000003", leaseToken: "lease-2" },
  ];
  const released = [];
  const result = await runAutonomyCycle({
    now: 1_786_020_000,
    claimAuthorizations: async () => records,
    readSnapshot: async (vault) =>
      vault === authorization.vault
        ? { active: true, paused: false, finalized: false, closeoutEligible: false }
        : { active: false, paused: false, finalized: true, closeoutEligible: false },
    executeStep: async () => assert.fail("must not submit"),
    releaseAuthorization: async (...args) => released.push(args),
  });

  assert.equal(result.waiting, 1);
  assert.equal(result.completed, 1);
  assert.equal(released[0][2].status, "waiting");
  assert.equal(released[1][2].status, "completed");
});

test("autonomous cycle expires stale authority without executing it", async () => {
  const released = [];
  const result = await runAutonomyCycle({
    now: authorization.validUntil + 1,
    claimAuthorizations: async () => [authorization],
    readSnapshot: async () => assert.fail("must not read"),
    executeStep: async () => assert.fail("must not submit"),
    releaseAuthorization: async (...args) => released.push(args),
  });

  assert.equal(result.failed, 0);
  assert.equal(released[0][2].status, "expired");
});

test("autonomous cycle blocks after the bounded execution retry limit", async () => {
  const released = [];
  const result = await runAutonomyCycle({
    now: 1_786_020_000,
    claimAuthorizations: async () => [authorization],
    readSnapshot: async () => ({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
    }),
    executeStep: async () => {
      const error = new Error("retry limit");
      error.code = "RETRY_LIMIT_REACHED";
      throw error;
    },
    releaseAuthorization: async (...args) => released.push(args),
  });
  assert.equal(result.failed, 1);
  assert.deepEqual(released[0][2], {
    status: "blocked",
    errorCode: "RETRY_LIMIT_REACHED",
  });
});
