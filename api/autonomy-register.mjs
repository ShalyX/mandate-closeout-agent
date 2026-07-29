import crypto from "node:crypto";
import { createServerRuntime } from "../src/server/runtime.mjs";

function send(res, status, payload, requestId) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Request-ID", requestId);
  return res.status(status).json({ ...payload, requestId });
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "method_not_allowed" }, requestId);
  }
  if (Number(req.headers["content-length"] ?? 0) > 8_192) {
    return send(res, 413, { error: "request_too_large" }, requestId);
  }
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    if (
      body.scope !== "autonomous-closeout" ||
      typeof body.vault !== "string" ||
      typeof body.owner !== "string" ||
      body.chainId !== 11155111 ||
      !Number.isInteger(body.issuedAt) ||
      !Number.isInteger(body.validUntil) ||
      typeof body.nonce !== "string" ||
      typeof body.signature !== "string"
    ) {
      return send(res, 400, { error: "invalid_request" }, requestId);
    }
    const { autonomy, repository } = createServerRuntime();
    const allowed = await repository.takeRateLimit(
      `autonomy:${body.owner.toLowerCase()}`,
      { limit: 5, windowSeconds: 60 },
    );
    if (!allowed) return send(res, 429, { error: "rate_limited" }, requestId);
    const authorization = await autonomy.register(body);
    return send(res, 201, { ok: true, authorization }, requestId);
  } catch (error) {
    const rejected = new Set([
      "AUTHORIZATION_INVALID",
      "UNKNOWN_VAULT",
      "OWNER_MISMATCH",
      "INVALID_LIFECYCLE",
      "AUTHORIZATION_TOO_SHORT",
    ]).has(error?.code);
    return send(
      res,
      rejected ? 422 : 503,
      {
        error: rejected ? "authorization_rejected" : "service_unavailable",
        ...(rejected ? { code: error.code } : {}),
      },
      requestId,
    );
  }
}
