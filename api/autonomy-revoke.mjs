import crypto from "node:crypto";
import { verifyAutonomyRevocation } from "../src/server/execution-authorization.mjs";
import { vaultAbi } from "../src/server/abis.mjs";
import { CHAIN_ID, createServerRuntime } from "../src/server/runtime.mjs";

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-ID", requestId);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed", requestId });
  }
  if (Number(req.headers["content-length"] ?? 0) > 8_192) {
    return res.status(413).json({ error: "request_too_large", requestId });
  }
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    if (!(await verifyAutonomyRevocation(body, { expectedChainId: CHAIN_ID }))) {
      return res.status(422).json({ error: "revocation_rejected", requestId });
    }
    const { client, repository } = createServerRuntime();
    const allowed = await repository.takeRateLimit(
      `autonomy-revoke:${body.owner.toLowerCase()}`,
      { limit: 5, windowSeconds: 60 },
    );
    if (!allowed) {
      return res.status(429).json({ error: "rate_limited", requestId });
    }
    const owner = await client.readContract({
      address: body.vault,
      abi: vaultAbi,
      functionName: "owner",
    });
    if (owner.toLowerCase() !== body.owner.toLowerCase()) {
      return res.status(422).json({ error: "owner_mismatch", requestId });
    }
    const revoked = await repository.revokeAuthorization(body.vault, body.owner);
    return res.status(revoked ? 200 : 409).json({
      ok: revoked,
      ...(revoked ? { status: "revoked" } : { error: "not_revocable" }),
      requestId,
    });
  } catch {
    return res.status(503).json({ error: "service_unavailable", requestId });
  }
}
