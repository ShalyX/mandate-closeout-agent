import assert from "node:assert/strict";
import test from "node:test";
import { planNextAction } from "../src/agent/planner.mjs";

test("planner selects the first pending due obligation after closeout begins", () => {
  const action = planNextAction({
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [
      { id: 0, dueAt: 100, status: "Paid" },
      {
        id: 1,
        dueAt: 150,
        status: "Pending",
        token: "0x0000000000000000000000000000000000000011",
        recipient: "0x0000000000000000000000000000000000000022",
        amount: "125000000",
      },
      { id: 2, dueAt: 150, status: "Pending" },
    ],
    allowanceTargets: [],
    trackedTokens: [],
  });

  assert.deepEqual(action, {
    kind: "settleObligation",
    obligationId: 1,
    reason: "Required obligation 1 is due and still pending.",
  });
});

test("planner stops while governance has paused the mandate", () => {
  const action = planNextAction({
    active: true,
    paused: true,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [{ id: 0, dueAt: 100, status: "Pending" }],
    allowanceTargets: [{ id: 0, revoked: false }],
    trackedTokens: [{ address: "0x0000000000000000000000000000000000000011", balance: "10" }],
  });

  assert.deepEqual(action, {
    kind: "stop",
    code: "MANDATE_PAUSED",
    reason: "Governance paused the mandate; executor writes are disabled.",
  });
});

test("planner stops after the mandate has already finalized", () => {
  const action = planNextAction({
    active: false,
    paused: false,
    finalized: true,
    closeoutEligible: false,
    now: 300,
    obligations: [{ id: 0, dueAt: 100, status: "Paid" }],
    allowanceTargets: [{ id: 0, revoked: true }],
    trackedTokens: [
      {
        address: "0x0000000000000000000000000000000000000011",
        balance: "0",
      },
    ],
  });

  assert.deepEqual(action, {
    kind: "stop",
    code: "MANDATE_FINALIZED",
    reason: "The mandate is finalized; executor authority has been removed.",
  });
});

test("planner revokes the first allowance after obligations are resolved", () => {
  const action = planNextAction({
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [{ id: 0, dueAt: 100, status: "Paid" }],
    allowanceTargets: [
      { id: 0, revoked: true },
      { id: 1, revoked: false },
    ],
    trackedTokens: [],
  });

  assert.deepEqual(action, {
    kind: "revokeAllowance",
    targetId: 1,
    reason: "Allowance target 1 remains active after obligations resolved.",
  });
});

test("planner requires human action when a required obligation is still unresolved", () => {
  const action = planNextAction({
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [{ id: 4, dueAt: 250, status: "Pending" }],
    allowanceTargets: [{ id: 0, revoked: false }],
    trackedTokens: [],
  });

  assert.deepEqual(action, {
    kind: "stop",
    code: "OBLIGATION_BLOCKED",
    obligationId: 4,
    reason: "Required obligation 4 is pending but cannot be settled yet.",
  });
});

test("planner sweeps the first tracked token with a remaining balance", () => {
  const action = planNextAction({
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [{ id: 0, dueAt: 100, status: "Paid" }],
    allowanceTargets: [{ id: 0, revoked: true }],
    trackedTokens: [
      { address: "0x0000000000000000000000000000000000000011", balance: "0" },
      { address: "0x0000000000000000000000000000000000000022", balance: "75" },
    ],
  });

  assert.deepEqual(action, {
    kind: "sweepToken",
    token: "0x0000000000000000000000000000000000000022",
    reason: "Tracked token has 75 units remaining for the fixed treasury.",
  });
});

test("planner finalizes only after every closeout prerequisite is cleared", () => {
  const action = planNextAction({
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [{ id: 0, dueAt: 100, status: "Paid" }],
    allowanceTargets: [{ id: 0, revoked: true }],
    trackedTokens: [
      { address: "0x0000000000000000000000000000000000000011", balance: "0" },
    ],
  });

  assert.deepEqual(action, {
    kind: "finalize",
    reason: "All obligations, allowances, and tracked balances are resolved.",
  });
});
