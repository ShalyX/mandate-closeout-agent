import assert from "node:assert/strict";
import test from "node:test";
import { inspectAutonomy } from "../src/cli/autonomy-status.mjs";

test("autonomy inspection returns deploy and authorization evidence", async () => {
  const requests = [];
  const result = await inspectAutonomy({
    baseUrl: "https://mandate.example",
    vault: "0x1000000000000000000000000000000000000001",
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.endsWith("/api/ready")) {
        return {
          ok: true,
          json: async () => ({ ok: true, checks: { autonomyWorkerSecured: true } }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          authorization: { status: "running", executionId: "run-1" },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorization.status, "running");
  assert.equal(result.readiness.autonomyWorkerSecured, true);
  assert.equal(requests.length, 2);
});
