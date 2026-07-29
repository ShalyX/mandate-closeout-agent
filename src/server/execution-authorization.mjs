import { isAddress, verifyMessage } from "viem";
import { buildExecutionMessage } from "../shared/execution-message.mjs";

const MAX_AUTHORIZATION_AGE_SECONDS = 300;
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

export { buildExecutionMessage };

export async function verifyExecutionAuthorization(
  intent,
  { now = Math.floor(Date.now() / 1_000), expectedChainId = 11155111 } = {},
) {
  if (
    !isAddress(intent.owner ?? "") ||
    !isAddress(intent.vault ?? "") ||
    intent.chainId !== expectedChainId ||
    !Number.isInteger(intent.issuedAt) ||
    Math.abs(now - intent.issuedAt) > MAX_AUTHORIZATION_AGE_SECONDS ||
    !NONCE_PATTERN.test(intent.nonce ?? "") ||
    !/^0x[0-9a-fA-F]{130}$/.test(intent.signature ?? "")
  ) {
    return false;
  }
  try {
    return await verifyMessage({
      address: intent.owner,
      message: buildExecutionMessage(intent),
      signature: intent.signature,
    });
  } catch {
    return false;
  }
}
