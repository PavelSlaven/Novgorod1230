# P21 orchestration critic report

**Verdict:** PASS WITH NOTES

**Subject reviewed:** working tree rooted at `5b224a9d01c7fbd957b5a7c7c24b8f9a03b07c29`, including the third P21 repair. This independent re-audit changed no runtime code, schema, production composition, or P28 state.

## Evidence run

- `npm run spatial-v3:test-p21` — 9/9 passed.
- `npm run spatial-v3:check-p21` — passed.
- `npm run spatial-v3:test-p18` — 22/22 passed.
- `npm run spatial-v3:test-p19` — 8/8 passed.
- `npm run spatial-v3:test-p20` — 5/5 passed.
- `npm run architecture:check` — passed.
- `npm run docs:check` — passed.
- `git diff --check -- <P21 subject files>` — passed.

## Closure of previous required corrections

### CRIT-01 — target-root, cross-phase and P16 integration proof

Closed. The P21 test now constructs and invokes the exported `createSpatialV3TargetShadowCompositionRoot`, rather than only the lower-level composition. It proves at runtime that the root is target/shadow-only, exposes the exact `modeHandoff` port and reports `activation: 'not_authorized'`.

The board-carrier path reaches the P19 `resolveModeTransition` result, passes the validated transition through the concrete P21 handoff orchestrator, builds a sealed P16 combined-write plan and invokes the actual `createSpatialV3CombinedAtomicCommitter` implementation. The test observes its transaction-side advisory lock and idempotency queries, not merely a plan-shaped stub. The same root entrypoint starts a v3 new game, binds the canonical G5/start scene/G6/position artifacts and commits a second actual P16 plan. P18, P19 and P20 target factories are also constructed through the exported root in the traversal integration; their failed planner/preparation branches remain typed and produce no write.

The ordinary gate test proves no commit occurs before validation. The forged stage/new-game test proves invalid stage envelopes and arbitrary prepared starts stop before persistence. The existing handoff compensation case remains green for a failed successor.

### CRIT-02 — awaited timed traversal and approved adapter

Closed. `timed_traversal` now calls `adapt(command, await invokeTraversal(command.command_payload))`; therefore an unresolved P19 Promise cannot cross the adapter boundary. The root-level test uses the real P19 execution engine and the only supplied traversal adapter for each explicit operation: `start`, `interval`, and `synchronized_slice`. The adapter receives frozen, resolved P19 results and returns the sole acceptable sealed proposal.

The same test exercises a throwing `startTraversal` and missing interval/synchronized-slice methods. Each produces `generated_schema_mismatch`, never a `TypeError`, and the committer write record remains empty. The strengthened static P21 gate requires the awaited invocation and the root-level integration evidence.

## Requirement review

- **P21-S01:** finite registry covers every declared v3 command kind; unknown tokens and free text fail closed.
- **P21-S02:** target/shadow turn graph orders snapshot load, approved handler, validation, P16-plan build, commit, projection and narration; its gate failure has no write.
- **P21-S03:** target Stage 13 accepts only canonical party G5 plus prepared scene/G6/position, persists schema v3, and explicitly retains the former 24/25 boundaries in target/shadow mapping.
- **P21-S04:** every ownership-changing command routes through P19 transition resolution and the exact handoff orchestration; no command-adapter bypass exists for carrier/cohort changes.
- **P21-S05:** the reviewed composition has injected ports, no direct database import or hidden global state, no v2 fallback path, and no production registration of the target root.

## Notes and boundary confirmation

The P16 transaction proof is a deterministic P16 transaction-adapter integration, not a live PostgreSQL deployment test; the P16 PostgreSQL contract is covered by its dedicated phase tests. This does not weaken the P21 orchestration conclusion.

`apps/game-server/src/composition/production.js` does not import the target root. The target root remains explicitly `not_authorized`; no P28 activation, production runtime replacement, or schema-path mixing was introduced.
