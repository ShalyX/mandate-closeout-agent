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
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > 8_192) {
    return send(res, 413, { error: "request_too_large" }, requestId);
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    if (
      typeof body.vault !== "string" ||
      typeof body.owner !== "string" ||
      body.chainId !== 11155111 ||
      !Number.isInteger(body.issuedAt) ||
      typeof body.nonce !== "string" ||
      typeof body.signature !== "string"
    ) {
      return send(res, 400, { error: "invalid_request" }, requestId);
    }
    const runtime = createServerRuntime();
    const subject = String(
      req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown",
    )
      .split(",")[0]
      .trim();
    const allowed = await runtime.repository.takeRateLimit(subject, {
      limit: 10,
      windowSeconds: 60,
    });
    if (!allowed) {
      res.setHeader("Retry-After", "60");
      return send(res, 429, { error: "rate_limited" }, requestId);
    }

    const result = await runtime.service.executeStep(body);
    return send(res, result.reused ? 200 : 202, { ok: true, ...result }, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const clientError =
      error instanceof SyntaxError ||
      /authorization|factory|owner|eligible|simulation/i.test(message);
    return send(
      res,
      clientError ? 422 : 500,
      { error: clientError ? "execution_rejected" : "internal_error" },
      requestId,
    );
  }
}
