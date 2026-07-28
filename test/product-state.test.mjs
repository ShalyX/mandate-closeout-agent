import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMandate } from "../web/src/product-state.js";

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

