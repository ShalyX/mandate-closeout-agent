import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStep } from "../src/agent/reconciler.mjs";

test("restart recognizes an already-mined obligation and does not resubmit it", async () => {
  let submissions = 0;
  let statusQueries = 0;
  const result = await reconcileStep({
    action: { kind: "settleObligation", obligationId: 7 },
    pendingExecution: {
      executionId: "run_missed_receipt",
      status: "submitted",
    },
    readSnapshot: async () => ({
      obligations: [{ id: 7, status: "Paid" }],
      allowanceTargets: [],
      trackedTokens: [],
      finalized: false,
    }),
    getExecutionStatus: async () => {
      statusQueries += 1;
      return { status: "completed" };
    },
    submit: async () => {
      submissions += 1;
      return { executionId: "should_not_exist" };
    },
  });

  assert.deepEqual(result, {
    outcome: "already-complete",
    action: { kind: "settleObligation", obligationId: 7 },
    source: "chain-state",
  });
  assert.equal(submissions, 0);
  assert.equal(statusQueries, 0);
});

test("agent waits when chain state is unchanged and KeeperHub is still running", async () => {
  let submissions = 0;
  const result = await reconcileStep({
    action: { kind: "settleObligation", obligationId: 2 },
    pendingExecution: { executionId: "run_live", status: "submitted" },
    readSnapshot: async () => ({
      obligations: [{ id: 2, status: "Pending" }],
      allowanceTargets: [],
      trackedTokens: [],
      finalized: false,
    }),
    getExecutionStatus: async (executionId) => {
      assert.equal(executionId, "run_live");
      return { status: "running", transactionHash: "0xabc" };
    },
    submit: async () => {
      submissions += 1;
      return { executionId: "duplicate" };
    },
  });

  assert.deepEqual(result, {
    outcome: "wait",
    action: { kind: "settleObligation", obligationId: 2 },
    executionId: "run_live",
    status: "running",
    transactionHash: "0xabc",
  });
  assert.equal(submissions, 0);
});

test("agent starts one new attempt after KeeperHub terminal failure and unchanged state", async () => {
  let submissions = 0;
  const action = { kind: "revokeAllowance", targetId: 5 };
  const result = await reconcileStep({
    action,
    pendingExecution: { executionId: "run_failed", status: "submitted" },
    readSnapshot: async () => ({
      obligations: [],
      allowanceTargets: [{ id: 5, revoked: false }],
      trackedTokens: [],
      finalized: false,
    }),
    getExecutionStatus: async () => ({
      status: "failed",
      error: "transaction reverted",
    }),
    submit: async (submittedAction) => {
      submissions += 1;
      assert.deepEqual(submittedAction, action);
      return { executionId: "run_retry_1", status: "completed" };
    },
  });

  assert.deepEqual(result, {
    outcome: "submitted",
    action,
    executionId: "run_retry_1",
    status: "completed",
    previousExecutionId: "run_failed",
  });
  assert.equal(submissions, 1);
});

test("restart recognizes an already-revoked allowance from chain state", async () => {
  const action = { kind: "revokeAllowance", targetId: 5 };
  const result = await reconcileStep({
    action,
    readSnapshot: async () => ({
      obligations: [],
      allowanceTargets: [{ id: 5, revoked: true }],
      trackedTokens: [],
      finalized: false,
    }),
    submit: async () => assert.fail("must not resubmit"),
  });
  assert.equal(result.outcome, "already-complete");
  assert.equal(result.source, "chain-state");
});

test("restart recognizes an already-swept token from its zero chain balance", async () => {
  const token = "0x0000000000000000000000000000000000000011";
  const result = await reconcileStep({
    action: { kind: "sweepToken", token },
    readSnapshot: async () => ({
      obligations: [],
      allowanceTargets: [],
      trackedTokens: [{ address: token, balance: "0" }],
      finalized: false,
    }),
    submit: async () => assert.fail("must not resubmit"),
  });
  assert.equal(result.outcome, "already-complete");
});

test("restart recognizes finalized chain state and never calls the old executor", async () => {
  const result = await reconcileStep({
    action: { kind: "finalize" },
    readSnapshot: async () => ({
      obligations: [],
      allowanceTargets: [],
      trackedTokens: [],
      finalized: true,
    }),
    submit: async () => assert.fail("must not resubmit"),
  });
  assert.equal(result.outcome, "already-complete");
});
