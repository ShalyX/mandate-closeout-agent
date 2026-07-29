import { getAddress, isAddress, verifyMessage } from "viem";
import {
  buildAutonomyRevocationMessage,
  buildExecutionMessage,
} from "../shared/execution-message.mjs";

const MAX_AUTHORIZATION_AGE_SECONDS = 300;
const MAX_AUTONOMOUS_DURATION_SECONDS = 30 * 24 * 60 * 60;
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

function addressCaseVariants(address) {
  return [...new Set([address, address.toLowerCase(), getAddress(address)])];
}

async function verifyExecutionMessage(intent) {
  for (const owner of addressCaseVariants(intent.owner)) {
    for (const vault of addressCaseVariants(intent.vault)) {
      if (
        await verifyMessage({
          address: intent.owner,
          message: buildExecutionMessage({ ...intent, owner, vault }),
          signature: intent.signature,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

export { buildAutonomyRevocationMessage, buildExecutionMessage };

export async function verifyAutonomyRevocation(
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
      message: buildAutonomyRevocationMessage(intent),
      signature: intent.signature,
    });
  } catch {
    return false;
  }
}

export async function verifyExecutionAuthorization(
  intent,
  { now = Math.floor(Date.now() / 1_000), expectedChainId = 11155111 } = {},
) {
  const autonomous = intent.scope === "autonomous-closeout";
  const validTime = autonomous
    ? Number.isInteger(intent.validUntil) &&
      intent.validUntil > intent.issuedAt &&
      intent.validUntil - intent.issuedAt <= MAX_AUTONOMOUS_DURATION_SECONDS &&
      now >= intent.issuedAt - MAX_AUTHORIZATION_AGE_SECONDS &&
      now <= intent.validUntil
    : Math.abs(now - intent.issuedAt) <= MAX_AUTHORIZATION_AGE_SECONDS;
  if (
    !isAddress(intent.owner ?? "") ||
    !isAddress(intent.vault ?? "") ||
    intent.chainId !== expectedChainId ||
    !Number.isInteger(intent.issuedAt) ||
    !validTime ||
    !NONCE_PATTERN.test(intent.nonce ?? "") ||
    !/^0x[0-9a-fA-F]{130}$/.test(intent.signature ?? "")
  ) {
    return false;
  }
  try {
    return await verifyExecutionMessage(intent);
  } catch {
    return false;
  }
}
