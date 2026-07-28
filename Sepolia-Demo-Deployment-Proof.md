# Sepolia Demo Deployment Proof

Recorded on 2026-07-28 for the KeeperHub Agents Onchain hackathon.

## Network and actors

- Network: Ethereum Sepolia (`11155111`)
- KeeperHub owner/executor: `0x293b3E59f3D558862EadFB682C0e3E5531e9bA1e`
- Treasury: `0x1000000000000000000000000000000000000001`
- Required-obligation recipient: `0x1000000000000000000000000000000000000002`
- Allowance spender: `0x1000000000000000000000000000000000000003`

## Live contracts

- DemoToken (`mUSD`): `0x56E766e5ED1cC545B60F43651F67b1371d9ead5f`
- MandateVault: `0x63001f6B89bb212895e6f4B5c074Dc3E86B11a0a`
- Deterministic deployment factory: `0xce0042B868300000d44A59004Da54A005ffdcf9f`

The demo token has no monetary value. It exists only to make balances, required
payments, allowance revocation, sweeping, and recovery behavior deterministic
and repeatable on Sepolia.

## KeeperHub execution evidence

| Action | KeeperHub execution ID | Sepolia transaction |
|---|---|---|
| DemoToken deployment | `3ipwb5qnspnqtlcrkwluo` | [0x0ac3…b2c0](https://sepolia.etherscan.io/tx/0x0ac36e8a75af898357ff14a7823c915c507e05d634692ab76fc55b9e1aa7b2c0) |
| MandateVault deployment | `freagc3ow6nu0ej3bgn7m` | [0x311e…82fc](https://sepolia.etherscan.io/tx/0x311eaa449200db27c735754941e6e36aa9ca0aa0702d8343ca938d74d4a082fc) |
| Mint 1,000 mUSD to vault | `j3b8h39gzap5xixa92hiq` | [0xcaf1…85e3](https://sepolia.etherscan.io/tx/0xcaf1a3fbec1fa02ac058deb08168bcc5a07c849ac1cf1aafe250d23fbccf85e3) |
| Register tracked token | `7qofzbhvd7ctvx3cqkj2h` | [0x3bbc…a4a4](https://sepolia.etherscan.io/tx/0x3bbc608b7c1442ec873095b0e8a77f1f2f67f50a0b426d7a50190bc96888a4a4) |
| Add required 250 mUSD obligation | `5ryi1n06ch0a2hicbyshv` | [0xc804…29fa](https://sepolia.etherscan.io/tx/0xc8046922fc634c11ee9c21bc3d8b6c43da37e0bf96c59f0a327639d15f2d29fa) |
| Register allowance target | `r8961gba0tfw28uypkarr` | [0x8790…320c](https://sepolia.etherscan.io/tx/0x87906133c2b1ae442f3856c4715af18a173098a433c353c53d2c7250d5de320c) |
| Configure 100 mUSD allowance | `y5apmiclzrtc87n5xj1mn` | [0x47da…b1e](https://sepolia.etherscan.io/tx/0x47da03c2aaa36840978abb9646e29323458c3cbafee3aed431086b5c3a9d6b1e) |
| Activate mandate | `tuzwfd0hacv5s2wdpbeia` | [0xb5ba…3c53](https://sepolia.etherscan.io/tx/0xb5badf87af029e063291d06cb490e838ec2d02d8212a0f57ea5ca34fa2c83c53) |

The failed execution `xruw0d9abbv4ilo5fwu66` produced no transaction. Its
arguments were empty because of a local shell expansion error. KeeperHub marked
it terminally failed, chain state remained unchanged, and the corrected call was
submitted once.

## Verified activated state

- `active = true`
- `paused = false`
- `finalized = false`
- tracked-token count: `1`
- required-obligation count: `1`
- allowance-target count: `1`
- vault balance: `1,000 mUSD`
- required obligation: `250 mUSD`, pending
- live allowance: `100 mUSD`
- mandate expiry: Unix timestamp `1785243876`
- emergency recovery delay: `86,400` seconds

All writes above were submitted through KeeperHub. State verification used
read-only Sepolia RPC calls after each completed execution.

## Live autonomous closeout

The agent re-read Sepolia state after expiry and selected one permitted action
at a time. Every action was simulated, submitted through KeeperHub, confirmed,
and reconciled against fresh chain state before the next action was planned.

| Planned action | KeeperHub execution ID | Sepolia transaction |
|---|---|---|
| Settle required obligation `0` | `jmhfrgal3z8xhr1pc7bbw` | [0x48fb…7fe3](https://sepolia.etherscan.io/tx/0x48fb29c060232a1ad1f3add4516bbc535d38fc17f6e0bb1ae40da74716577fe3) |
| Revoke allowance target `0` | `8cj31us7vyu51hk2mox7d` | [0xebe7…476f](https://sepolia.etherscan.io/tx/0xebe7605565776d5017e733578e191b6fed723266ea103b11294e025c9fed476f) |
| Sweep residual mUSD | `9lj63ws2ip1mytax08efg` | [0x9e7d…1de0](https://sepolia.etherscan.io/tx/0x9e7da58e07785dac5980bb03897c125c64789b59d339dddeb4dcb14c02811de0) |
| Finalize mandate | `mw6av575iv4l4ur4sqnhp` | [0x8d56…b808](https://sepolia.etherscan.io/tx/0x8d56a87b01af1f776dbffeded897d11dba5d5a2e8aad3d1cf8c024dea46db808) |

### Final verified state

- required obligation `0`: `Paid`
- recipient balance: `250 mUSD`
- allowance target `0`: revoked
- live ERC-20 allowance: `0`
- treasury balance: `750 mUSD`
- vault balance: `0`
- `finalized = true`
- `active = false`
- executor: zero address
- a simulated call from the former executor is rejected

Final verification also exposed a presentation bug in the local planner: an
already-finalized snapshot was described as another `finalize` action. The
onchain contract and reconciler already prevented any duplicate write. A
test-first regression fix now returns `MANDATE_FINALIZED`; the full suite passes
20 tests.
