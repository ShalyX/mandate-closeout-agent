import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionRepository } from "../src/server/execution-repository.mjs";

test("repository durably saves, leases, and releases autonomous authority", async () => {
  const statements = [];
  const sql = async (parts, ...values) => {
    const text = parts.join("?");
    statements.push({ text, values });
    if (text.includes("RETURNING") && text.includes("mandate_authorizations")) {
      return [{
        vault: "0xc1fd23a0a7106c2312a64018c33e528ef4975c07",
        owner_address: "0x1dcb045123730e606a88380bce534332f50332d2",
        chain_id: 11155111,
        issued_at: 100,
        valid_until: 200,
        nonce: "nonce-value-123456",
        signature: "0xsig",
        lease_token: values.find((value) => typeof value === "string" && value.length === 36),
      }];
    }
    return [];
  };
  const repository = createExecutionRepository({ sql });
  await repository.saveAuthorization({
    vault: "0xVAULT",
    owner: "0xOWNER",
    chainId: 11155111,
    issuedAt: 100,
    validUntil: 200,
    nonce: "nonce-value-123456",
    signature: "0xsig",
    status: "armed",
  });
  const claimed = await repository.claimAuthorizations({ limit: 3 });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].scope, "autonomous-closeout");
  assert.equal(claimed[0].vault, "0xc1fD23A0a7106C2312A64018c33E528ef4975c07");
  assert.equal(claimed[0].owner, "0x1DcB045123730e606A88380BCe534332F50332d2");
  assert.match(claimed[0].leaseToken, /^[0-9a-f-]{36}$/);

  await repository.releaseAuthorization("0xVAULT", claimed[0].leaseToken, {
    status: "running",
    lastAction: "settleObligation",
    executionId: "run-1",
  });

  assert.ok(statements.some(({ text }) => text.includes("CREATE TABLE IF NOT EXISTS mandate_authorizations")));
  assert.ok(statements.some(({ text }) => text.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(statements.some(({ text }) => text.includes("lease_token = NULL")));
  assert.ok(
    statements.some(
      ({ text }) =>
        text.includes("last_action = COALESCE") &&
        text.includes("last_execution_id = COALESCE"),
    ),
  );
});

test("repository rejects invalid autonomous status before issuing SQL", async () => {
  const repository = createExecutionRepository({ sql: async () => [] });
  await assert.rejects(
    repository.releaseAuthorization("0xvault", "lease", {
      status: "anything-goes",
    }),
    /status/i,
  );
});

test("repository exposes a public-safe authorization status without its signature", async () => {
  const sql = async (parts) => {
    if (parts.join("?").includes("SELECT vault, owner_address")) {
      return [{
        vault: "0xvault",
        owner_address: "0xowner",
        status: "running",
        valid_until: 200,
        last_action: "settleObligation",
        last_execution_id: "run-1",
        last_error_code: null,
        updated_at: "2026-07-29T12:00:00.000Z",
      }];
    }
    return [];
  };
  const repository = createExecutionRepository({ sql });
  const status = await repository.getAuthorizationStatus("0xVAULT");
  assert.deepEqual(status, {
    vault: "0xvault",
    owner: "0xowner",
    status: "running",
    validUntil: 200,
    lastAction: "settleObligation",
    executionId: "run-1",
    errorCode: null,
    updatedAt: "2026-07-29T12:00:00.000Z",
  });
  assert.equal("signature" in status, false);
});

test("repository revokes only the authorization owned by the signer", async () => {
  const statements = [];
  const sql = async (parts, ...values) => {
    statements.push({ text: parts.join("?"), values });
    return parts.join("?").includes("RETURNING vault") ? [{ vault: "0xvault" }] : [];
  };
  const repository = createExecutionRepository({ sql });
  assert.equal(await repository.revokeAuthorization("0xVAULT", "0xOWNER"), true);
  const update = statements.find(({ text }) => text.includes("status = 'revoked'"));
  assert.ok(update);
  assert.ok(update.text.includes("owner_address ="));
  assert.ok(update.text.includes("lease_token = NULL"));
});

test("repository creates the executions table before applying its migration", async () => {
  let executionsCreated = false;
  const sql = async (parts) => {
    const text = parts.join("?");
    if (text.includes("CREATE TABLE IF NOT EXISTS mandate_executions")) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      executionsCreated = true;
    }
    if (text.includes("ALTER TABLE mandate_executions") && !executionsCreated) {
      throw new Error("relation mandate_executions does not exist");
    }
    return [];
  };
  const repository = createExecutionRepository({ sql });
  await repository.ping();
  assert.equal(executionsCreated, true);
});
