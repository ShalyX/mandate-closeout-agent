import assert from "node:assert/strict";
import test from "node:test";
import { createKeeperHubHttpAdapter } from "../src/keeperhub/http-adapter.mjs";

test("KeeperHub HTTP adapter simulates and executes the same contract call safely", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "POST" && JSON.parse(options.body).simulate) {
      return new Response(
        JSON.stringify({ success: true, wouldRevert: false, gasEstimate: "42000" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ executionId: "direct_123", status: "completed" }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };
  const adapter = createKeeperHubHttpAdapter({
    apiKey: "kh_test_secret",
    fetchImpl,
  });
  const call = {
    chainId: 11155111,
    contractAddress: "0x1000000000000000000000000000000000000001",
    functionName: "finalize",
    abi: [{ type: "function", name: "finalize", inputs: [], outputs: [] }],
    args: [],
  };

  const simulation = await adapter.simulateContractCall(call);
  const execution = await adapter.executeContractCall(call, {
    idempotencyKey: "mandate:11155111:0xabc:finalize:v1",
  });

  assert.equal(simulation.wouldRevert, false);
  assert.deepEqual(execution, {
    executionId: "direct_123",
    status: "completed",
  });
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    "https://app.keeperhub.com/api/execute/contract-call",
  );
  assert.deepEqual(
    { ...JSON.parse(requests[0].options.body), simulate: undefined },
    { ...JSON.parse(requests[1].options.body), simulate: undefined },
  );
  assert.equal(JSON.parse(requests[0].options.body).simulate, true);
  assert.equal(JSON.parse(requests[1].options.body).simulate, undefined);
  assert.equal(requests[1].options.headers.Authorization, "Bearer kh_test_secret");
  assert.equal(
    requests[1].options.headers["Idempotency-Key"],
    "mandate:11155111:0xabc:finalize:v1",
  );
});

test("KeeperHub HTTP adapter returns authoritative status and polling guidance", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        executionId: "direct_123",
        status: "completed",
        transactionHash: "0xabc",
        transactionLink: "https://sepolia.etherscan.io/tx/0xabc",
        error: null,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-poll-interval-hint": "0",
        },
      },
    );
  const adapter = createKeeperHubHttpAdapter({
    apiKey: "kh_test_secret",
    fetchImpl,
  });

  assert.deepEqual(await adapter.getExecutionStatus("direct_123"), {
    executionId: "direct_123",
    status: "completed",
    transactionHash: "0xabc",
    transactionLink: "https://sepolia.etherscan.io/tx/0xabc",
    error: null,
    pollAfterSeconds: 0,
  });
});

test("KeeperHub HTTP adapter sanitizes upstream errors without leaking details", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: "wallet_not_configured",
        detail: "sensitive provider detail",
      }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  const adapter = createKeeperHubHttpAdapter({
    apiKey: "kh_test_secret",
    fetchImpl,
  });

  await assert.rejects(
    adapter.simulateContractCall({
      chainId: 11155111,
      contractAddress: "0x1000000000000000000000000000000000000001",
      functionName: "finalize",
      abi: [],
      args: [],
    }),
    (error) =>
      error.message === "KeeperHub request failed" &&
      error.code === "wallet_not_configured" &&
      error.status === 422 &&
      !JSON.stringify(error).includes("sensitive provider detail"),
  );
});
