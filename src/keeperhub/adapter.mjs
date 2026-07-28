import { execFile } from "node:child_process";

function defaultRun(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`KeeperHub CLI failed: ${stderr.trim() || error.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function encodeAction(action) {
  if (action.kind === "settleObligation") {
    return { method: "settleObligation", args: [String(action.obligationId)] };
  }
  if (action.kind === "revokeAllowance") {
    return { method: "revokeAllowance", args: [String(action.targetId)] };
  }
  if (action.kind === "sweepToken") {
    return { method: "sweepToken", args: [action.token] };
  }
  if (action.kind === "finalize") return { method: "finalize", args: [] };
  throw new Error(`Unsupported KeeperHub action: ${action.kind}`);
}

export function createKeeperHubAdapter({
  binary,
  configHome,
  chainId,
  vault,
  abiFile,
  run = defaultRun,
}) {
  return {
    async submit(action) {
      const encoded = encodeAction(action);
      const result = await run(
        binary,
        [
          "execute",
          "contract-call",
          "--chain",
          String(chainId),
          "--contract",
          vault,
          "--method",
          encoded.method,
          "--args",
          JSON.stringify(encoded.args),
          "--abi-file",
          abiFile,
          "--yes",
          "--json",
        ],
        {
          env: { XDG_CONFIG_HOME: configHome },
          timeoutMs: 300000,
        },
      );
      const parsed = JSON.parse(result.stdout);
      return {
        executionId: parsed.executionId,
        status: parsed.status,
      };
    },
    async getExecutionStatus(executionId) {
      const result = await run(
        binary,
        ["execute", "status", executionId, "--json"],
        {
          env: { XDG_CONFIG_HOME: configHome },
          timeoutMs: 300000,
        },
      );
      const parsed = JSON.parse(result.stdout);
      return {
        executionId: parsed.executionId,
        status: parsed.status,
        transactionHash: parsed.transactionHash,
        transactionLink: parsed.transactionLink,
        error: parsed.error,
      };
    },
  };
}
