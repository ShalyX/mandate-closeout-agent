import { createServerRuntime, FACTORY } from "../src/server/runtime.mjs";

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { client, repository } = createServerRuntime();
    const [factoryCode] = await Promise.all([
      client.getBytecode({ address: FACTORY }),
      repository.ping(),
    ]);
    if (!factoryCode) throw new Error("Factory unavailable");
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false, error: "service_not_ready" });
  }
}
