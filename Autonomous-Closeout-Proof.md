# Autonomous Closeout Proof

This document records a completed, unattended Mandate closeout on Ethereum Sepolia.

## Mandate

- Vault: [`0xc1fD23A0a7106C2312A64018c33E528ef4975c07`](https://eth-sepolia.blockscout.com/address/0xc1fD23A0a7106C2312A64018c33E528ef4975c07)
- Owner / treasury: `0x1DcB045123730e606A88380BCe534332F50332d2`
- KeeperHub executor: [`0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e`](https://eth-sepolia.blockscout.com/address/0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e)
- Token: [Mandate Demo USD (mUSD)](https://eth-sepolia.blockscout.com/token/0x56E766e5ED1cC545B60F43651F67b1371d9ead5f)
- Scheduler: Upstash QStash, one authenticated worker cycle every five minutes
- Authorization: one owner signature, bounded to this vault, chain, scope, nonce, and expiry
- Additional wallet signatures after arming: **none**

KeeperHub relayed each action through `TKGasStation`. The vault calls therefore appear as internal transactions from the configured KeeperHub executor rather than as ordinary top-level vault transactions.

## Autonomous execution trail

| Time (Africa/Lagos) | Action | Onchain result | Transaction |
|---|---|---|---|
| 2026-07-29 16:00:12 | `settleObligation(0)` | Paid the required 250 mUSD obligation | [`0x92d1…1035`](https://eth-sepolia.blockscout.com/tx/0x92d1a3e780813978c89a998e50cb4d77f55af5af2824eb322a91af15e98f1035) |
| 2026-07-29 16:05:12 | `revokeAllowance(0)` | Set the approved spender allowance to zero | [`0xbfdd…1f01`](https://eth-sepolia.blockscout.com/tx/0xbfdd1779652b7391951eb34515553c4d207c5ed2ae7224bfe4010ab578a71f01) |
| 2026-07-29 16:10:12 | `sweepToken(mUSD)` | Returned the residual 750 mUSD to treasury | [`0x90eb…dd8f`](https://eth-sepolia.blockscout.com/tx/0x90eb31b92bfae2abf90af95adc349b56c0ca7318d76a4d520bdced3fcd61dd8f) |
| 2026-07-29 16:15:12 | `finalize()` | Finalized the mandate and removed executor authority | [`0x99da…b35c`](https://eth-sepolia.blockscout.com/tx/0x99da20ebfba28050f389baf593c29da16c2d1856114914e0c361ae2062a3b35c) |

## KeeperHub execution evidence

- Allowance revocation execution: `a7bf7n1lp6xcarioqm1lg`
- Finalization execution: `k2j5qhebbuwvw0i0nkydf`
- Every parent transaction succeeded through KeeperHub's `execute` flow and called the vault internally from `0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e`.

## Final invariants

- Required obligation paid: **250 mUSD**
- Residual returned to treasury: **750 mUSD**
- Vault token balance: **0 mUSD**
- Tracked allowance: **0**
- Mandate finalized: **true**
- Executor authority after finalization: **removed**
- Reconciliation: **1,000 mUSD = 250 mUSD paid + 750 mUSD returned**
