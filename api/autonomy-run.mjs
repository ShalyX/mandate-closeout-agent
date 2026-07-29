import crypto from "node:crypto";
import { runAutonomyCycle } from "../src/server/autonomy-runner.mjs";
import { verifyBearerSecret } from "../src/server/http-security.mjs";
import { createServerRuntime } from "../src/server/runtime.mjs";

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-ID", requestId);
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed", requestId });
  }
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!verifyBearerSecret(req.headers.authorization, cronSecret)) {
    return res.status(401).json({ error: "unauthorized", requestId });
  }
  try {
    const runtime = createServerRuntime();
    const result = await runAutonomyCycle({
      claimAuthorizations: runtime.repository.claimAuthorizations,
      releaseAuthorization: runtime.repository.releaseAuthorization,
      readSnapshot: runtime.readSnapshot,
      executeStep: runtime.service.executeStep,
    });
    return res.status(200).json({ ok: true, ...result, requestId });
  } catch {
    return res.status(503).json({ error: "worker_unavailable", requestId });
  }
}
