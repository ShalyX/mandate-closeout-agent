export async function inspectAutonomy({
  baseUrl,
  vault,
  fetchImpl = fetch,
}) {
  const root = baseUrl.replace(/\/$/, "");
  const [readyResponse, statusResponse] = await Promise.all([
    fetchImpl(`${root}/api/ready`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
    fetchImpl(
      `${root}/api/autonomy-status?vault=${encodeURIComponent(vault)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    ),
  ]);
  const [ready, status] = await Promise.all([
    readyResponse.json(),
    statusResponse.json(),
  ]);
  return {
    ok: readyResponse.ok && statusResponse.ok && ready.ok,
    readiness: ready.checks ?? {},
    authorization: status.authorization ?? null,
  };
}
