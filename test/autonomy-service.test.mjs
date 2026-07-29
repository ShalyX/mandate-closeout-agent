import assert from "node:assert/strict";
import test from "node:test";
import { createAutonomyService } from "../src/server/autonomy-service.mjs";

const vault = "0x1000000000000000000000000000000000000001";
const owner = "0x2000000000000000000000000000000000000002";

function intent(overrides = {}) {
  return {
    scope: "autonomous-closeout",
    vault,
    owner,
    chainId: 11155111,
    issuedAt: 1_786_000_000,
    validUntil: 1_786_086_400,
    nonce: "b60aacdf-f650-46f0-b380-b206ef454723",
    signature: `0x${"12".repeat(65)}`,
    ...overrides,
  };
}

test("owner registers one durable authorization covering the mandate closeout", async () => {
  const saved = [];
  const service = createAutonomyService({
    verifyAuthorization: async () => true,
    isFactoryMandate: async () => true,
    readOwner: async () => owner,
    readLifecycle: async () => ({
      active: true,
      finalized: false,
      endAt: 1_786_010_000,
    }),
    saveAuthorization: async (record) => saved.push(record),
  });

  const result = await service.register(intent());

  assert.deepEqual(result, {
    vault,
    owner,
    status: "armed",
    validUntil: 1_786_086_400,
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].signature, intent().signature);
  assert.equal(saved[0].status, "armed");
});

test("registration fails closed for the wrong owner or an authorization expiring before closeout", async () => {
  const base = {
    verifyAuthorization: async () => true,
    isFactoryMandate: async () => true,
    readLifecycle: async () => ({
      active: true,
      finalized: false,
      endAt: 1_786_010_000,
    }),
    saveAuthorization: async () => assert.fail("must not persist"),
  };
  const wrongOwner = createAutonomyService({
    ...base,
    readOwner: async () => "0x3000000000000000000000000000000000000003",
  });
  await assert.rejects(wrongOwner.register(intent()), {
    code: "OWNER_MISMATCH",
  });

  const tooShort = createAutonomyService({
    ...base,
    readOwner: async () => owner,
  });
  await assert.rejects(
    tooShort.register(intent({ validUntil: 1_786_005_000 })),
    { code: "AUTHORIZATION_TOO_SHORT" },
  );
});
