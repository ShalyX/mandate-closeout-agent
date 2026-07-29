export function buildExecutionMessage(intent) {
  if (intent.scope === "autonomous-closeout") {
    return [
      "Mandate autonomous closeout authorization",
      "",
      `Owner: ${intent.owner}`,
      `Vault: ${intent.vault}`,
      `Chain ID: ${intent.chainId}`,
      `Issued at: ${intent.issuedAt}`,
      `Valid until: ${intent.validUntil}`,
      `Nonce: ${intent.nonce}`,
      "",
      "Authorize the agent to complete every deterministic closeout step until finalization.",
      "The vault's locked configuration limits recipients, assets, and actions.",
      "Pause the mandate onchain to stop execution.",
    ].join("\n");
  }
  return [
    "Mandate closeout authorization",
    "",
    `Owner: ${intent.owner}`,
    `Vault: ${intent.vault}`,
    `Chain ID: ${intent.chainId}`,
    `Issued at: ${intent.issuedAt}`,
    `Nonce: ${intent.nonce}`,
    "",
    "Authorize exactly one deterministic closeout step.",
  ].join("\n");
}

export function buildAutonomyRevocationMessage(intent) {
  return [
    "Revoke Mandate autonomous closeout",
    "",
    `Owner: ${intent.owner}`,
    `Vault: ${intent.vault}`,
    `Chain ID: ${intent.chainId}`,
    `Issued at: ${intent.issuedAt}`,
    `Nonce: ${intent.nonce}`,
    "",
    "Permanently disarm the stored autonomous authorization.",
  ].join("\n");
}
