import crypto from "node:crypto";
import { isAddress } from "viem";
import { createServerRuntime } from "../src/server/runtime.mjs";

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-ID", requestId);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed", requestId });
  }
  const vault = String(req.query?.vault ?? "");
  if (!isAddress(vault)) {
    return res.status(400).json({ error: "invalid_vault", requestId });
  }
  try {
    const { repository } = createServerRuntime();
    const authorization = await repository.getAuthorizationStatus(vault);
    return res.status(200).json({ ok: true, authorization, requestId });
  } catch {
    return res.status(503).json({ error: "status_unavailable", requestId });
  }
}
