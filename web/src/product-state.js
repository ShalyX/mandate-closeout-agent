const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function validAddress(value, label) {
  if (!ADDRESS_PATTERN.test(value ?? "") || value === ZERO_ADDRESS) {
    throw new Error(`Enter a valid ${label} address`);
  }
  return value;
}

export function prepareTrackedToken(token) {
  return validAddress(token, "token");
}

export function prepareAllowanceTarget(input) {
  return {
    token: validAddress(input.token, "token"),
    spender: validAddress(input.spender, "spender"),
  };
}

export function prepareObligation(input) {
  const recipient = validAddress(input.recipient, "recipient");
  const token = validAddress(input.token, "token");
  if (typeof input.amount !== "bigint" || input.amount <= 0n) {
    throw new Error("Obligation amount must be greater than zero");
  }
  if (
    typeof input.dueAt !== "bigint" ||
    input.dueAt <= 0n ||
    input.dueAt > input.mandateEndAt
  ) {
    throw new Error("Obligation due date must not exceed the mandate close date");
  }
  return { recipient, token, amount: input.amount, dueAt: input.dueAt };
}

export function prepareMandateCreation(input, now = new Date()) {
  const treasury = validAddress(input.treasury, "treasury");

  const endAtMs = new Date(input.endAt).getTime();
  if (!Number.isFinite(endAtMs) || endAtMs <= now.getTime()) {
    throw new Error("Choose a close date in the future");
  }

  const graceHours = Number(input.graceHours);
  if (!Number.isInteger(graceHours) || graceHours < 1 || graceHours > 720) {
    throw new Error("Grace period must be between 1 and 720 hours");
  }

  return {
    treasury,
    endAt: BigInt(Math.floor(endAtMs / 1_000)),
    gracePeriod: BigInt(graceHours * 60 * 60),
  };
}

export function summarizeMandate(state) {
  const balanced = state.funded === state.paid + state.swept;
  const authorityRemoved =
    state.finalized &&
    state.vaultBalance === 0n &&
    state.allowance === 0n &&
    state.executor.toLowerCase() === ZERO_ADDRESS;

  return {
    balanced,
    authorityRemoved,
    status: authorityRemoved ? "Mandate closed" : "Closeout incomplete",
    equation: `${state.funded.toLocaleString()} = ${state.paid.toLocaleString()} + ${state.swept.toLocaleString()}`,
  };
}
