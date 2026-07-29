import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("plan command returns a stable machine-readable next action", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mandate-cli-"));
  const snapshotPath = path.join(directory, "snapshot.json");
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify({
      active: true,
      paused: false,
      finalized: false,
      closeoutEligible: true,
      now: 200,
      obligations: [{ id: 3, dueAt: 100, status: "Pending" }],
      allowanceTargets: [],
      trackedTokens: [],
    }),
  );

  const result = spawnSync(
    process.execPath,
    ["src/cli.mjs", "plan", "--snapshot", snapshotPath, "--json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.command, "plan");
  assert.equal(output.environment, "local-snapshot");
  assert.deepEqual(output.action, {
    kind: "settleObligation",
    obligationId: 3,
    reason: "Required obligation 3 is due and still pending.",
  });
  assert.match(output.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof output.durationMs, "number");
});

test("doctor command reports local and hosted execution readiness separately", () => {
  const result = spawnSync(
    process.execPath,
    ["src/cli.mjs", "doctor", "--json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, KH_API_KEY: "", DATABASE_URL: "" },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.command, "doctor");
  assert.equal(output.readiness.localBuild, true);
  assert.equal(output.readiness.hostedExecution, false);
  assert.deepEqual(output.missingHostedVariables, [
    "KH_API_KEY",
    "DATABASE_URL",
  ]);
});
