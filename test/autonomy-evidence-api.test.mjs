import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/autonomy-evidence.mjs";

test("autonomy evidence endpoint rejects an invalid vault", async () => {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await handler({ method: "GET", query: { vault: "nope" } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "invalid_vault");
});
