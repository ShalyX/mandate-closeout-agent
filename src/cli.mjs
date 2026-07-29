#!/usr/bin/env node

import fs from "node:fs";
import { planNextAction } from "./agent/planner.mjs";
import { inspectAutonomy } from "./cli/autonomy-status.mjs";

const startedAt = performance.now();
const [command, ...args] = process.argv.slice(2);
const snapshotFlag = args.indexOf("--snapshot");

if (command === "doctor") {
  const localBuild = [
    "contracts/MandateFactory.sol",
    "contracts/MandateVault.sol",
    "web/index.html",
    "src/agent/planner.mjs",
  ].every((path) => fs.existsSync(path));
  const missingHostedVariables = ["KH_API_KEY", "DATABASE_URL"].filter(
    (name) => !process.env[name],
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: localBuild,
      command,
      environment: "local",
      timestamp: new Date().toISOString(),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      readiness: {
        localBuild,
        hostedExecution: missingHostedVariables.length === 0,
      },
      missingHostedVariables,
    })}\n`,
  );
  process.exit(localBuild ? 0 : 3);
}

if (command === "autonomy") {
  const statusCommand = args[0];
  const vaultFlag = args.indexOf("--vault");
  const urlFlag = args.indexOf("--base-url");
  if (
    statusCommand !== "status" ||
    vaultFlag === -1 ||
    !args[vaultFlag + 1] ||
    urlFlag === -1 ||
    !args[urlFlag + 1]
  ) {
    process.stderr.write(
      "Usage: mandate autonomy status --vault <address> --base-url <url> --json\n",
    );
    process.exit(2);
  }
  try {
    const evidence = await inspectAutonomy({
      vault: args[vaultFlag + 1],
      baseUrl: args[urlFlag + 1],
    });
    process.stdout.write(
      `${JSON.stringify({
        ...evidence,
        command: "autonomy status",
        environment: args[urlFlag + 1],
        timestamp: new Date().toISOString(),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      })}\n`,
    );
    process.exit(evidence.ok ? 0 : 4);
  } catch {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        command: "autonomy status",
        environment: args[urlFlag + 1],
        timestamp: new Date().toISOString(),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        failedStep: "hosted-status",
        errorCode: "AUTONOMY_STATUS_UNAVAILABLE",
      })}\n`,
    );
    process.exit(4);
  }
}

if (command !== "plan" || snapshotFlag === -1 || !args[snapshotFlag + 1]) {
  process.stderr.write(
    "Usage: mandate <doctor --json|plan --snapshot <snapshot.json> --json|autonomy status --vault <address> --base-url <url> --json>\n",
  );
  process.exit(2);
}

try {
  const snapshot = JSON.parse(
    fs.readFileSync(args[snapshotFlag + 1], "utf8"),
  );
  const action = planNextAction(snapshot);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      command,
      environment: "local-snapshot",
      timestamp: new Date().toISOString(),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      action,
    })}\n`,
  );
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      command,
      environment: "local-snapshot",
      timestamp: new Date().toISOString(),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      failedStep: "read-or-plan",
      errorCode: "INVALID_SNAPSHOT",
      message: error instanceof Error ? error.message : "Unknown error",
    })}\n`,
  );
  process.exit(3);
}
