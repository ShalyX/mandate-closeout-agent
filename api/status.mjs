import crypto from "node:crypto";
import { createServerRuntime } from "../src/server/runtime.mjs";

const EXECUTION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Request-ID", requestId);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed", requestId });
  }
  const executionId = String(req.query?.executionId ?? "");
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    return res.status(400).json({ error: "invalid_execution_id", requestId });
  }
  try {
    const { keeperHub, repository } = createServerRuntime();
    const execution = await keeperHub.getExecutionStatus(executionId);
    await repository.updateExecution(execution);
    res.setHeader("Retry-After", String(execution.pollAfterSeconds));
    return res.status(200).json({ ok: true, ...execution, requestId });
  } catch {
    return res.status(502).json({ error: "status_unavailable", requestId });
  }
}
