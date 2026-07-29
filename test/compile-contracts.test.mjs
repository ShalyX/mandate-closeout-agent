import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { execFileSync } from "node:child_process";

test("contract build emits the factory ABI and bytecode artifact", () => {
  fs.rmSync("artifacts/contracts/MandateFactory.json", { force: true });
  execFileSync(process.execPath, ["scripts/compile-contracts.mjs"], {
    stdio: "pipe",
  });
  const artifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/MandateFactory.json", "utf8"),
  );
  assert.ok(artifact.abi.some((entry) => entry.name === "createMandate"));
  assert.ok(artifact.evm.bytecode.object.length > 0);
});
