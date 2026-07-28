function isComplete(action, snapshot) {
  if (action.kind === "settleObligation") {
    return snapshot.obligations.some(
      (item) =>
        item.id === action.obligationId &&
        (item.status === "Paid" || item.status === "Cancelled"),
    );
  }
  if (action.kind === "revokeAllowance") {
    return snapshot.allowanceTargets.some(
      (item) => item.id === action.targetId && item.revoked,
    );
  }
  if (action.kind === "sweepToken") {
    return snapshot.trackedTokens.some(
      (item) =>
        item.address.toLowerCase() === action.token.toLowerCase() &&
        BigInt(item.balance) === 0n,
    );
  }
  if (action.kind === "finalize") return snapshot.finalized;
  return false;
}

export async function reconcileStep({
  action,
  pendingExecution,
  readSnapshot,
  getExecutionStatus,
  submit,
}) {
  const snapshot = await readSnapshot();
  if (isComplete(action, snapshot)) {
    return {
      outcome: "already-complete",
      action,
      source: "chain-state",
    };
  }
  let previousExecutionId;
  if (pendingExecution) {
    const execution = await getExecutionStatus(pendingExecution.executionId);
    if (["pending", "submitted", "running", "retrying"].includes(execution.status)) {
      return {
        outcome: "wait",
        action,
        executionId: pendingExecution.executionId,
        status: execution.status,
        transactionHash: execution.transactionHash,
      };
    }
    if (execution.status === "failed") {
      previousExecutionId = pendingExecution.executionId;
    } else {
      throw new Error(`Ambiguous execution status: ${execution.status}`);
    }
  }
  const execution = await submit(action);
  return {
    outcome: "submitted",
    action,
    executionId: execution.executionId,
    status: execution.status,
    ...(previousExecutionId ? { previousExecutionId } : {}),
  };
}
