import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function isMandate(address) view returns (bool)",
]);

export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function active() view returns (bool)",
  "function paused() view returns (bool)",
  "function finalized() view returns (bool)",
  "function endAt() view returns (uint64)",
  "function obligationCount() view returns (uint256)",
  "function allowanceTargetCount() view returns (uint256)",
  "function trackedTokenCount() view returns (uint256)",
  "function obligations(uint256) view returns (address recipient,address token,uint128 amount,uint64 dueAt,uint8 status)",
  "function allowanceTargets(uint256) view returns (address token,address spender,bool revoked)",
  "function trackedTokenList(uint256) view returns (address)",
  "function settleObligation(uint256 id)",
  "function revokeAllowance(uint256 id)",
  "function sweepToken(address token)",
  "function finalize()",
]);
