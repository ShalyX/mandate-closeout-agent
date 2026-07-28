const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

