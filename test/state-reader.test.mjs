import assert from "node:assert/strict";
import test from "node:test";
import { readMandateSnapshot } from "../src/chain/state-reader.mjs";

test("state reader reconstructs a planner snapshot from contract reads", async () => {
  const vault = "0x00000000000000000000000000000000000000aa";
  const token = "0x00000000000000000000000000000000000000bb";
  const client = {
    async readContract({ address, functionName, args = [] }) {
      const values = {
        active: true,
        paused: false,
        finalized: false,
        endAt: 150n,
        obligationCount: 1n,
        allowanceTargetCount: 1n,
        trackedTokenCount: 1n,
      };
      if (functionName in values) return values[functionName];
      if (functionName === "obligations") {
        assert.deepEqual(args, [0n]);
        return [
          "0x0000000000000000000000000000000000000011",
          token,
          125n,
          140n,
          0,
        ];
      }
      if (functionName === "allowanceTargets") {
        return [token, "0x0000000000000000000000000000000000000022", false];
      }
      if (functionName === "trackedTokenList") return token;
      if (functionName === "balanceOf") {
        assert.equal(address, token);
        assert.deepEqual(args, [vault]);
        return 500n;
      }
      throw new Error(`Unexpected read: ${functionName}`);
    },
  };

  const snapshot = await readMandateSnapshot({
    client,
    vault,
    abi: [],
    now: 200,
  });

  assert.deepEqual(snapshot, {
    active: true,
    paused: false,
    finalized: false,
    closeoutEligible: true,
    now: 200,
    obligations: [
      {
        id: 0,
        recipient: "0x0000000000000000000000000000000000000011",
        token,
        amount: "125",
        dueAt: 140,
        status: "Pending",
      },
    ],
    allowanceTargets: [
      {
        id: 0,
        token,
        spender: "0x0000000000000000000000000000000000000022",
        revoked: false,
      },
    ],
    trackedTokens: [{ address: token, balance: "500" }],
  });
});
