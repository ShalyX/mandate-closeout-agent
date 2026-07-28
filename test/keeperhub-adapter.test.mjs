import assert from "node:assert/strict";
import test from "node:test";
import { createKeeperHubAdapter } from "../src/keeperhub/adapter.mjs";

test("KeeperHub adapter submits only the planner-selected contract method", async () => {
  const calls = [];
  const adapter = createKeeperHubAdapter({
    binary: "/tools/kh",
    configHome: "/secure/config",
    chainId: 11155111,
    vault: "0x00000000000000000000000000000000000000aa",
    abiFile: "/app/MandateVault.abi.json",
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return {
        stdout: JSON.stringify({
          executionId: "run_123",
          status: "completed",
        }),
      };
    },
  });

  const result = await adapter.submit({
    kind: "settleObligation",
    obligationId: 7,
  });

  assert.deepEqual(result, { executionId: "run_123", status: "completed" });
  assert.deepEqual(calls[0], {
    command: "/tools/kh",
    args: [
      "execute",
      "contract-call",
      "--chain",
      "11155111",
      "--contract",
      "0x00000000000000000000000000000000000000aa",
      "--method",
      "settleObligation",
      "--args",
      "[\"7\"]",
      "--abi-file",
      "/app/MandateVault.abi.json",
      "--yes",
      "--json",
    ],
    options: {
      env: { XDG_CONFIG_HOME: "/secure/config" },
      timeoutMs: 300000,
    },
  });
});

test("KeeperHub adapter retrieves authoritative execution status", async () => {
  const calls = [];
  const adapter = createKeeperHubAdapter({
    binary: "/tools/kh",
    configHome: "/secure/config",
    chainId: 11155111,
    vault: "0x00000000000000000000000000000000000000aa",
    abiFile: "/app/MandateVault.abi.json",
    run: async (command, args) => {
      calls.push({ command, args });
      return {
        stdout: JSON.stringify({
          executionId: "run_123",
          status: "completed",
          transactionHash: "0xabc",
          transactionLink: "https://sepolia.etherscan.io/tx/0xabc",
        }),
      };
    },
  });

  const status = await adapter.getExecutionStatus("run_123");
  assert.equal(status.transactionHash, "0xabc");
  assert.deepEqual(calls[0].args, [
    "execute",
    "status",
    "run_123",
    "--json",
  ]);
});
