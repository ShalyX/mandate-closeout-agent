# Mandate demo video production plan

## Direction

**Mode:** Full production

**Winning sentence:** For teams running time-bounded onchain programs, Mandate closes an expired treasury under a one-time bounded authorization, proven when KeeperHub settles the approved payment, revokes the allowance, returns the residual balance, and removes the executor on Sepolia.

**Runtime:** 85–95 seconds  
**Format:** 16:9, 1920×1080, 30 fps  
**Tone:** Calm, precise, and inevitable—more operational proof than launch trailer.  
**Signature sequence:** `1,000 mUSD → 250 paid + 100 allowance revoked + 750 returned → executor 0x00`.

## Timed script

| Time | Visual | Voiceover | Proof |
|---|---|---|---|
| 0:00–0:07 | Open on the final Mandate hero, then cut directly to the completed closeout rail. | This mandate has expired, and nobody is sitting around to close it. Mandate has already paid the only approved obligation, killed a stale allowance, returned every remaining token, and removed its own authority. | Completed product state is visible immediately. |
| 0:07–0:17 | Slow move across the four closeout rows: Settle, Revoke, Sweep, Finalize. | Temporary grants and working groups are easy to start onchain, but closing them still means chasing signers, checking old permissions, and proving that nothing was left behind. | Each risk maps to one closeout action. |
| 0:17–0:31 | Show the self-service form and lifecycle controls. Use restrained callouts for treasury, close date, obligation, and allowance target. | With Mandate, the owner creates a vault, fixes the treasury and close date, registers the obligations and permissions that must be resolved, then activates the policy and signs one bounded authorization. | Product setup surface; no transaction is implied until a signature is shown. |
| 0:31–0:43 | Reveal the Autonomous Closeout card from the recorded completed mandate. Highlight the expiry and the four execution records. | That signature cannot invent a payment or redirect funds. Once the close time passes, the worker re-reads Sepolia, chooses one contract-allowed action, simulates it, and submits it through KeeperHub. | Bounded authorization plus recorded KeeperHub execution IDs. |
| 0:43–1:02 | Replay the closeout rail at normal speed. Punch in once per state change. | After every receipt, the agent reads the chain again before moving forward, so a restart cannot turn into a duplicate payment. In this run, two hundred and fifty mUSD goes to the approved recipient, the one-hundred mUSD allowance drops to zero, and the remaining seven hundred and fifty returns to treasury. | Four ordered KeeperHub executions and Sepolia receipts. |
| 1:02–1:17 | Open the finalization receipt, show the transaction hash, then return to the proof panel. | These are not mocked confirmations. Every row links to a real Sepolia transaction, while the final state shows a zero vault balance, zero allowance, and the executor replaced by the zero address. | Etherscan finalization transaction and live proof panel. |
| 1:17–1:28 | Hold on `1,000 = 250 + 750`, then finish on the product wordmark. | Mandate turns treasury closeout from a manual checklist into a verifiable terminal state: every approved obligation resolved, every residual asset returned, and no agent authority left behind. | Reconciled final state. |

## Voiceover copy

This mandate has expired, and nobody is sitting around to close it. Mandate has already paid the only approved obligation, killed a stale allowance, returned every remaining token, and removed its own authority.

Temporary grants and working groups are easy to start onchain, but closing them still means chasing signers, checking old permissions, and proving that nothing was left behind.

With Mandate, the owner creates a vault, fixes the treasury and close date, registers the obligations and permissions that must be resolved, then activates the policy and signs one bounded authorization. That signature cannot invent a payment or redirect funds.

Once the close time passes, the worker re-reads Sepolia, chooses one contract-allowed action, simulates it, and submits it through KeeperHub. After every receipt, the agent reads the chain again before moving forward, so a restart cannot turn into a duplicate payment.

In this run, two hundred and fifty mUSD goes to the approved recipient, the one-hundred mUSD allowance drops to zero, and the remaining seven hundred and fifty returns to treasury. These are not mocked confirmations. Every row links to a real Sepolia transaction, while the final state shows a zero vault balance, zero allowance, and the executor replaced by the zero address.

Mandate turns treasury closeout from a manual checklist into a verifiable terminal state: every approved obligation resolved, every residual asset returned, and no agent authority left behind.

## Capture list

1. Static hero establishing shot, 4 seconds.
2. Self-service setup surface with fields visible, 8 seconds.
3. Completed Autonomous Closeout card from the owner-connected product session, 10 seconds.
4. Closeout replay from Settle through Finalize, 18 seconds.
5. Four transaction receipt links at readable scale, 12 seconds.
6. Finalization transaction on Etherscan, 8 seconds.
7. Final proof panel showing reconciliation, zero balance, zero allowance, and zero executor, 10 seconds.
8. Clean hero end frame, 4 seconds.

Capture the owner-connected autonomous card from the existing demo wallet session. Do not recreate it as a mock. If the wallet session is unavailable, use a clearly labeled still from the completed run rather than implying a new live authorization.

## Edit language

- Hard cuts between setup, execution, and proof.
- One controlled punch-in for each important proof region.
- No stock blockchain footage, fake terminal text, glitch effects, or decorative network tunnels.
- Use the product's Bookman display face, mono labels, warm paper, black, and orange signal color.
- Keep transaction hashes on screen for at least two seconds.
- Use a restrained mechanical tick only when a real closeout step completes.
- Music, if used, should be low, sparse, and percussive; narration stays dominant.

## Required delivery files

- `mandate-demo-master-1080p.mp4`
- `mandate-demo-submission.mp4`
- `mandate-demo-captions.srt`
- `mandate-demo-thumbnail.png`
- source capture folder and edit manifest

