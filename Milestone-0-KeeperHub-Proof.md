# Milestone 0 — KeeperHub Technical Proof

Date: 28 July 2026  
Network: Ethereum Sepolia (`11155111`)  
KeeperHub wallet: `0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e`

## Outcome

KeeperHub successfully:

1. Simulated contract calls without broadcasting.
2. Submitted transactions from its managed wallet.
3. Deployed a custom Solidity contract through the EIP-2470 singleton factory.
4. Called the deployed contract's state-changing `setNumber(42)` function.
5. Returned execution IDs and transaction links through its status API.

An independent Sepolia RPC read confirmed:

- Contract: `0x1023e93b4A488bBB69a7a0098FD171912DA89299`
- `number()`: `42`
- `executor()`: `0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e`

## Proof

| Action | KeeperHub execution ID | Transaction |
| --- | --- | --- |
| Signing-path control transaction | `4lx9uif1zi8b09dzcvfze` | [View on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0xfa2f805adcb640fb426b943c9059792047a400aca7f6cbd4a6e5565b9e64c39e) |
| ERC-20 contract-write control | `cwz9js7v2zu52zz6p09ix` | [View on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0xc580921e46351a027916f4bc615ec28e83c591446ff87fed874636563a558148) |
| Deploy `SpikeCounter` | `cxvo2nd8anabnzequkubk` | [View on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x807b099bdd2ea4dfb851ec251bcc1a5e32f34e1ffcab3fcdd307f33d32b9ec2b) |
| Call `setNumber(42)` | `h4dflypvf6bn5w47hciq0` | [View on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x1dc9cb4fb63cbeaf6121adbddb84d6f0300be78c5c8332accf3b1e3c51c098f9) |

## Safe execution sequence validated

The spike used the intended production sequence:

1. Compile the contract and derive deterministic deployment data.
2. Send `simulate: true`.
3. Require `success: true` and `wouldRevert: false`.
4. Broadcast through KeeperHub.
5. Save the returned execution ID.
6. Poll `/api/execute/{executionId}/status`.
7. Treat the returned transaction hash as the KeeperHub audit proof.
8. Re-read contract state from an independent RPC before advancing.

## Compatibility finding

The raw Direct Execution API returned an empty HTTP `500` when the broadcast
payload included optional `value: "0"` and `gasLimitMultiplier: 1.2` fields,
even though the same payload simulated successfully. The official KeeperHub CLI,
which omitted those optional fields, completed the calls.

Implementation rule for the main agent:

- Prefer the official CLI/MCP surface for writes.
- If calling the Direct Execution API, omit optional zero/default fields.
- Preserve an idempotency key before each broadcast attempt.
- Never infer success from a client response alone; poll the execution status
  and verify chain state.

## Milestone decision

**PASS.** KeeperHub can serve as the project's onchain execution layer for
custom contract writes on Sepolia. The main build can proceed, with the payload
compatibility rule treated as an integration constraint and documented as
potential onboarding feedback for the hackathon bounty.
