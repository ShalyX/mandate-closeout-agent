const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const obligationStatuses = ["Pending", "Paid", "Cancelled"];

export async function readMandateSnapshot({ client, vault, abi, now }) {
  const readVault = (functionName, args = []) =>
    client.readContract({ address: vault, abi, functionName, args });
  const [
    active,
    paused,
    finalized,
    endAt,
    obligationCount,
    allowanceTargetCount,
    trackedTokenCount,
  ] = await Promise.all([
    readVault("active"),
    readVault("paused"),
    readVault("finalized"),
    readVault("endAt"),
    readVault("obligationCount"),
    readVault("allowanceTargetCount"),
    readVault("trackedTokenCount"),
  ]);

  const obligations = await Promise.all(
    Array.from({ length: Number(obligationCount) }, async (_, id) => {
      const [recipient, token, amount, dueAt, status] = await readVault(
        "obligations",
        [BigInt(id)],
      );
      return {
        id,
        recipient,
        token,
        amount: amount.toString(),
        dueAt: Number(dueAt),
        status: obligationStatuses[Number(status)],
      };
    }),
  );
  const allowanceTargets = await Promise.all(
    Array.from({ length: Number(allowanceTargetCount) }, async (_, id) => {
      const [token, spender, revoked] = await readVault("allowanceTargets", [
        BigInt(id),
      ]);
      return { id, token, spender, revoked };
    }),
  );
  const trackedTokens = await Promise.all(
    Array.from({ length: Number(trackedTokenCount) }, async (_, id) => {
      const address = await readVault("trackedTokenList", [BigInt(id)]);
      const balance = await client.readContract({
        address,
        abi: erc20BalanceAbi,
        functionName: "balanceOf",
        args: [vault],
      });
      return { address, balance: balance.toString() };
    }),
  );

  return {
    active,
    paused,
    finalized,
    closeoutEligible: active && !paused && !finalized && now >= Number(endAt),
    now,
    obligations,
    allowanceTargets,
    trackedTokens,
  };
}
