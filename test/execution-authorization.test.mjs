import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildAutonomyRevocationMessage,
  buildExecutionMessage,
  verifyAutonomyRevocation,
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

test("owner can sign a short-lived revocation bound to one vault", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const revocation = {
    vault: "0x1000000000000000000000000000000000000001",
    owner: account.address,
    chainId: 11155111,
    issuedAt: 1_786_000_000,
    nonce: "f7b7fa0e-5406-4c21-a4aa-85f464f36b2a",
  };
  const signature = await account.signMessage({
    message: buildAutonomyRevocationMessage(revocation),
  });
  assert.equal(
    await verifyAutonomyRevocation(
      { ...revocation, signature },
      { now: 1_786_000_120 },
    ),
    true,
  );
  assert.equal(
    await verifyAutonomyRevocation(
      { ...revocation, signature, chainId: 1 },
      { now: 1_786_000_120 },
    ),
    false,
  );
});

test("autonomous authorization covers the whole closeout until its explicit expiry", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const intent = {
    scope: "autonomous-closeout",
    vault: "0x1000000000000000000000000000000000000001",
    owner: account.address,
    chainId: 11155111,
    issuedAt: 1_786_000_000,
    validUntil: 1_786_086_400,
    nonce: "b60aacdf-f650-46f0-b380-b206ef454723",
  };
  const signature = await account.signMessage({
    message: buildExecutionMessage(intent),
  });

  assert.match(
    buildExecutionMessage(intent),
    /complete every deterministic closeout step/i,
  );
  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature },
      { now: 1_786_050_000 },
    ),
    true,
  );
  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature },
      { now: 1_786_086_401 },
    ),
    false,
  );
  assert.equal(
    await verifyExecutionAuthorization(
      { ...intent, signature, scope: "autonomous-closeout", validUntil: 1_900_000_000 },
      { now: 1_786_050_000 },
    ),
    false,
  );
});
