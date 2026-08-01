import crypto from "node:crypto";
import { isAddress } from "viem";
import { createServerRuntime } from "../src/server/runtime.mjs";

function transactionLink(hash) {
  return hash ? `https://eth-sepolia.blockscout.com/tx/${hash}` : null;
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader("Cache-Control", "private, max-age=15");
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
    const { keeperHub, repository } = createServerRuntime();
    const stored = await repository.listExecutionEvidence(vault);
    const executions = await Promise.all(
      stored.map(async (record) => {
        try {
          const current = await keeperHub.getExecutionStatus(record.executionId);
          await repository.updateExecution(current);
          const hash = current.transactionHash ?? record.transactionHash;
          return {
            ...record,
            status: current.status ?? record.status,
            transactionHash: hash,
            transactionLink: current.transactionLink ?? transactionLink(hash),
          };
        } catch {
          return {
            ...record,
            transactionLink: transactionLink(record.transactionHash),
          };
        }
      }),
    );
    return res.status(200).json({ ok: true, executions, requestId });
  } catch {
    return res.status(503).json({ error: "evidence_unavailable", requestId });
  }
}
