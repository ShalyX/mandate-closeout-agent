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
    console.error("execute-step failed", {
      requestId,
      code: error?.code ?? "UNCLASSIFIED",
      name: error?.name ?? "UnknownError",
    });
    const malformed =
      error instanceof SyntaxError ||
      error?.name === "SyntaxError" ||
      /JSON|Unexpected end|Unexpected token/i.test(message);
    const rejectedCodes = new Set([
      "AUTHORIZATION_INVALID",
      "UNKNOWN_VAULT",
      "OWNER_MISMATCH",
      "NOT_ELIGIBLE",
      "SIMULATION_REJECTED",
    ]);
    const rejected =
      rejectedCodes.has(error?.code) ||
      /authorization|factory|owner|eligible|simulation/i.test(message);
    const dependencyFailure =
      error?.message === "KeeperHub request failed" ||
      /fetch failed|timeout|database|postgres|connection/i.test(message);
    return send(
      res,
      malformed ? 400 : rejected ? 422 : dependencyFailure ? 502 : 500,
      {
        error: malformed
          ? "invalid_request"
          : rejected
            ? "execution_rejected"
            : dependencyFailure
              ? "dependency_unavailable"
            : "internal_error",
        ...(error?.code && /^[A-Z0-9_-]{2,80}$/i.test(error.code)
          ? { code: error.code }
          : {}),
      },
      requestId,
    );
  }
}
