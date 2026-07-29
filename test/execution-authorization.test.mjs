import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildExecutionMessage,
  verifyExecutionAuthorization,
} from "../src/server/execution-authorization.mjs";

test("execution authorization binds owner, vault, chain, nonce, and expiry", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const intent = {
    vault: "0x1000000000000000000000000000000000000001",
    owner: account.address,
    chainId: 11155111,
    issuedAt: 1_786_000_000,
    nonce: "c4d2f4ec-9be0-4b12-bf7b-083db9d43d7f",
  };
  const signature = await account.signMessage({
    message: buildExecutionMessage(intent),
  });

  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature },
      { now: 1_786_000_120 },
    ),
    true,
  );
  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature, vault: "0x3000000000000000000000000000000000000003" },
      { now: 1_786_000_120 },
    ),
    false,
  );
  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature },
      { now: 1_786_000_400 },
    ),
    false,
  );
});
