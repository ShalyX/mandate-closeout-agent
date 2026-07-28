#!/usr/bin/env node

import fs from "node:fs";
import { planNextAction } from "./agent/planner.mjs";

const startedAt = performance.now();
const [command, ...args] = process.argv.slice(2);
const snapshotFlag = args.indexOf("--snapshot");

if (command !== "plan" || snapshotFlag === -1 || !args[snapshotFlag + 1]) {
  process.stderr.write(
    "Usage: mandate plan --snapshot <snapshot.json> --json\n",
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
