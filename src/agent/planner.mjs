export function planNextAction(snapshot) {
  if (snapshot.finalized) {
    return {
      kind: "stop",
      code: "MANDATE_FINALIZED",
      reason: "The mandate is finalized; executor authority has been removed.",
    };
  }

  if (snapshot.paused) {
    return {
      kind: "stop",
      code: "MANDATE_PAUSED",
      reason: "Governance paused the mandate; executor writes are disabled.",
    };
  }

  const obligation = snapshot.obligations.find(
    (item) => item.status === "Pending" && item.dueAt <= snapshot.now,
  );
  if (obligation) {
    return {
      kind: "settleObligation",
      obligationId: obligation.id,
      reason: `Required obligation ${obligation.id} is due and still pending.`,
    };
  }
  const blockedObligation = snapshot.obligations.find(
    (item) => item.status === "Pending",
  );
  if (blockedObligation) {
    return {
      kind: "stop",
      code: "OBLIGATION_BLOCKED",
      obligationId: blockedObligation.id,
      reason: `Required obligation ${blockedObligation.id} is pending but cannot be settled yet.`,
    };
  }

  const allowance = snapshot.allowanceTargets.find((item) => !item.revoked);
  if (allowance) {
    return {
      kind: "revokeAllowance",
      targetId: allowance.id,
      reason: `Allowance target ${allowance.id} remains active after obligations resolved.`,
    };
  }

  const token = snapshot.trackedTokens.find((item) => BigInt(item.balance) > 0n);
  if (token) {
    return {
      kind: "sweepToken",
      token: token.address,
      reason: `Tracked token has ${token.balance} units remaining for the fixed treasury.`,
    };
  }

  return {
    kind: "finalize",
    reason: "All obligations, allowances, and tracked balances are resolved.",
  };
}
