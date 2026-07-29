export async function runAutonomyCycle({
  now = Math.floor(Date.now() / 1_000),
  claimAuthorizations,
  readSnapshot,
  executeStep,
  releaseAuthorization,
  limit = 5,
}) {
  const authorizations = await claimAuthorizations({ limit, now });
  const summary = {
    claimed: authorizations.length,
    submitted: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
  };

  for (const authorization of authorizations) {
    const release = (update) =>
      releaseAuthorization(
        authorization.vault,
        authorization.leaseToken,
        update,
      );
    try {
      if (now > authorization.validUntil) {
        await release({ status: "expired" });
        continue;
      }
      const snapshot = await readSnapshot(authorization.vault);
      if (snapshot.finalized) {
        summary.completed += 1;
        await release({ status: "completed" });
        continue;
      }
      if (!snapshot.closeoutEligible) {
        summary.waiting += 1;
        await release({
          status: snapshot.paused ? "paused" : "waiting",
        });
        continue;
      }
      const execution = await executeStep(authorization);
      summary.submitted += 1;
      await release({
        status: "running",
        lastAction: execution.action.kind,
        executionId: execution.executionId,
      });
    } catch (error) {
      summary.failed += 1;
      console.warn("Autonomy authorization attempt failed", {
        vault: authorization.vault,
        code: error?.code ?? "AUTONOMY_CYCLE_FAILED",
        name: error?.name ?? "Error",
        message: error?.message ?? "Unknown authorization failure",
      });
      await release({
        status:
          error?.code === "RETRY_LIMIT_REACHED" ? "blocked" : "retrying",
        errorCode: error?.code ?? "AUTONOMY_CYCLE_FAILED",
      });
    }
  }
  return summary;
}
