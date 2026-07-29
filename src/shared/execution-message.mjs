export function buildExecutionMessage(intent) {
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
