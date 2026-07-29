import assert from "node:assert/strict";
import test from "node:test";
import { verifyBearerSecret } from "../src/server/http-security.mjs";

test("worker authentication fails closed and compares the complete bearer secret", () => {
  assert.equal(verifyBearerSecret(undefined, ""), false);
  assert.equal(verifyBearerSecret("Bearer secret-123", "secret-123"), true);
  assert.equal(verifyBearerSecret("Bearer secret-12", "secret-123"), false);
  assert.equal(verifyBearerSecret("Basic secret-123", "secret-123"), false);
});
