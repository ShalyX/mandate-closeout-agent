const DEFAULT_BASE_URL = "https://app.keeperhub.com/api";

function contractCallBody(call) {
  return {
    chainId: call.chainId,
    contractAddress: call.contractAddress,
    functionName: call.functionName,
    functionArgs: JSON.stringify(call.args ?? []),
    abi: JSON.stringify(call.abi),
  };
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error("KeeperHub request failed");
    error.code =
      typeof payload.error === "string" ? payload.error : "keeperhub_request_failed";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createKeeperHubHttpAdapter({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
}) {
  if (!apiKey?.startsWith("kh_")) throw new Error("KeeperHub API key is missing");
  const endpoint = `${baseUrl.replace(/\/$/, "")}/execute/contract-call`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    async simulateContractCall(call) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...contractCallBody(call), simulate: true }),
      });
      return readJson(response);
    },

    async executeContractCall(call, { idempotencyKey }) {
      if (!idempotencyKey) throw new Error("Idempotency key is required");
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(contractCallBody(call)),
      });
      const payload = await readJson(response);
      return {
        executionId: payload.executionId,
        status: payload.status,
      };
    },

    async getExecutionStatus(executionId) {
      const response = await fetchImpl(
        `${baseUrl.replace(/\/$/, "")}/execute/${encodeURIComponent(executionId)}/status`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const payload = await readJson(response);
      return {
        executionId: payload.executionId,
        status: payload.status,
        transactionHash: payload.transactionHash,
        transactionLink: payload.transactionLink,
        error: payload.error,
        pollAfterSeconds: Number(response.headers.get("x-poll-interval-hint") ?? 2),
      };
    },
  };
}
