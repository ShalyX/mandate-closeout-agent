import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareAutonomyAuthorization,
  prepareAllowanceTarget,
  prepareMandateCreation,
  prepareObligation,
  prepareTrackedToken,
  summarizeMandate,
} from "../web/src/product-state.js";

test("judge summary reconciles the completed closeout amounts", () => {
  const summary = summarizeMandate({
    funded: 1000n,
    paid: 250n,
    swept: 750n,
    vaultBalance: 0n,
    allowance: 0n,
    finalized: true,
    executor:
      "0x0000000000000000000000000000000000000000",
  });

  assert.deepEqual(summary, {
    balanced: true,
    authorityRemoved: true,
    status: "Mandate closed",
    equation: "1,000 = 250 + 750",
  });
});

test("autonomous authorization is bounded to at most 30 days and covers closeout", () => {
  assert.deepEqual(
    prepareAutonomyAuthorization({
      vault: "0x1000000000000000000000000000000000000001",
      owner: "0x2000000000000000000000000000000000000002",
      chainId: 11155111,
      issuedAt: 1_786_000_000,
      endAt: 1_786_010_000,
      nonce: "b60aacdf-f650-46f0-b380-b206ef454723",
    }),
    {
      scope: "autonomous-closeout",
      vault: "0x1000000000000000000000000000000000000001",
      owner: "0x2000000000000000000000000000000000000002",
      chainId: 11155111,
      issuedAt: 1_786_000_000,
      validUntil: 1_788_592_000,
      nonce: "b60aacdf-f650-46f0-b380-b206ef454723",
    },
  );
});

test("vault configuration rejects unsafe addresses and invalid obligations", () => {
  assert.deepEqual(
    prepareTrackedToken("0x2000000000000000000000000000000000000002"),
    "0x2000000000000000000000000000000000000002",
  );
  assert.deepEqual(
    prepareAllowanceTarget({
      token: "0x2000000000000000000000000000000000000002",
      spender: "0x3000000000000000000000000000000000000003",
    }),
    {
      token: "0x2000000000000000000000000000000000000002",
      spender: "0x3000000000000000000000000000000000000003",
    },
  );
  assert.deepEqual(
    prepareObligation({
      recipient: "0x4000000000000000000000000000000000000004",
      token: "0x2000000000000000000000000000000000000002",
      amount: 25_000_000n,
      dueAt: 1_786_363_200n,
      mandateEndAt: 1_786_363_200n,
    }),
    {
      recipient: "0x4000000000000000000000000000000000000004",
      token: "0x2000000000000000000000000000000000000002",
      amount: 25_000_000n,
      dueAt: 1_786_363_200n,
    },
  );
  assert.throws(
    () =>
      prepareObligation({
        recipient: "0x4000000000000000000000000000000000000004",
        token: "0x2000000000000000000000000000000000000002",
        amount: 0n,
        dueAt: 20n,
        mandateEndAt: 10n,
      }),
    /amount/i,
  );
});

test("mandate creation requires a future close date and valid treasury", () => {
  assert.deepEqual(
    prepareMandateCreation(
      {
        treasury: "0x1000000000000000000000000000000000000001",
        endAt: "2026-08-10T12:00:00Z",
        graceHours: "24",
      },
      new Date("2026-07-29T12:00:00Z"),
    ),
    {
      treasury: "0x1000000000000000000000000000000000000001",
      endAt: 1786363200n,
      gracePeriod: 86400n,
    },
  );

  assert.throws(
    () =>
      prepareMandateCreation(
        {
          treasury: "not-an-address",
          endAt: "2026-07-28T12:00",
          graceHours: "0",
        },
        new Date("2026-07-29T12:00:00Z"),
      ),
    /valid treasury/i,
  );
});
