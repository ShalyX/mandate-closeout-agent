import { planNextAction } from "../agent/planner.mjs";

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function actionCall({ action, chainId, vault, vaultAbi }) {
  if (action.kind === "settleObligation") {
    return {
      chainId,
      contractAddress: vault,
      functionName: "settleObligation",
      args: [String(action.obligationId)],
      abi: vaultAbi,
    };
  }
  if (action.kind === "revokeAllowance") {
    return {
      chainId,
      contractAddress: vault,
      functionName: "revokeAllowance",
      args: [String(action.targetId)],
      abi: vaultAbi,
    };
  }
  if (action.kind === "sweepToken") {
    return {
      chainId,
      contractAddress: vault,
      functionName: "sweepToken",
      args: [action.token],
      abi: vaultAbi,
    };
  }
  if (action.kind === "finalize") {
    return {
      chainId,
      contractAddress: vault,
      functionName: "finalize",
      args: [],
      abi: vaultAbi,
    };
  }
  throw new Error(`Execution stopped: ${action.code}`);
}

function actionIdentity(action) {
  if (action.kind === "settleObligation") return `${action.kind}:${action.obligationId}`;
  if (action.kind === "revokeAllowance") return `${action.kind}:${action.targetId}`;
  if (action.kind === "sweepToken") return `${action.kind}:${action.token.toLowerCase()}`;
  return action.kind;
}

export function createExecutionService({
  verifyAuthorization,
  isFactoryMandate,
  readOwner,
  readSnapshot,
  findExecution,
  saveExecution,
  keeperHub,
  vaultAbi,
  chainId,
}) {
  return {
    async executeStep(intent) {
      if (!(await verifyAuthorization(intent))) {
        throw serviceError("AUTHORIZATION_INVALID", "Invalid owner authorization");
      }
      if (!(await isFactoryMandate(intent.vault))) {
        throw serviceError(
          "UNKNOWN_VAULT",
          "Vault is not registered by the Mandate factory",
        );
      }
      const chainOwner = await readOwner(intent.vault);
      if (chainOwner.toLowerCase() !== intent.owner.toLowerCase()) {
        throw serviceError("OWNER_MISMATCH", "Signer is not the mandate owner");
      }

      const snapshot = await readSnapshot(intent.vault);
      if (!snapshot.closeoutEligible) {
        throw serviceError(
          "NOT_ELIGIBLE",
          "Mandate is not eligible for closeout execution",
        );
      }
      const action = planNextAction(snapshot);
      const identity = actionIdentity(action);
      const existing = await findExecution(intent.vault, identity);
      if (existing) return { ...existing, action, reused: true };

      const call = actionCall({ action, chainId, vault: intent.vault, vaultAbi });
      const simulation = await keeperHub.simulateContractCall(call);
      if (!simulation.success || simulation.wouldRevert) {
        throw serviceError(
          "SIMULATION_REJECTED",
          "KeeperHub simulation rejected the closeout action",
        );
      }

      const idempotencyKey =
        `mandate:${chainId}:${intent.vault.toLowerCase()}:${identity}`;
      const execution = await keeperHub.executeContractCall(call, {
        idempotencyKey,
      });
      const record = {
        vault: intent.vault,
        owner: intent.owner,
        action: identity,
        executionId: execution.executionId,
        status: execution.status,
        idempotencyKey,
      };
      await saveExecution(record);
      return { ...execution, action, reused: false };
    },
  };
}
