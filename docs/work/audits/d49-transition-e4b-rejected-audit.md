# Contract verdict: transition environment patch e4b329e

**Verdict: FAIL — one actionable contract finding.** Read-only audit of immutable HEAD `e4b329e1b5171e2b1c625a4b2d0c0ba220862b25` in the transition-environment worktree; `git status --short` was empty. Scope: all four files in the commit, their call path through traversal → visible projection → commit persistence, and the arrival-environment contracts. No code changes made. No model, PostgreSQL, or tests were run by this auditor; author/root-provided test evidence is identified separately below.

## Applicable sources and precedence

- Governing: worktree `AGENTS.md` routes a Contract Auditor to `docs/governance/AUDIT_RULES.md` §25.1; this is a runtime behavior / time / perception / narration-boundary change.
- Index: `data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md`, §§1–3.1 and §8.1 rows for Time/activities/processes, Spatial/map, and Narration/UI. Applicable active contract families include temporal projection, Spatial v3, `turn_step_llm_contract.md`, and `situational_prose_requirements.md`.
- Normative constraints relevant here: the narrator consumes only persisted player-safe facts (`turn_step_llm_contract.md` §19 / lines around 1625); world facts in prose must be present and non-contradictory in the supplied package (`situational_prose_requirements.md` §2.0); arrival environment must reflect the authoritative current clock/projection (temporal/perception contract path).
- Code owner chain: traversal runtime creates a digest-sealed destination visible seed; turn-step visible projection prepares the envelope; PostgreSQL commit owner rebuilds prepared movement scene at `clock_after`, then persists the player-safe visible context. Patch adds clock-aware environment projection in phase-2 loading and sensory union at commit.

## Finding

**[P1] Reused destination can append stale environment facts to the current arrival package.**

- Exact locations: `apps/game-server/src/runtime/lower-dvina-trace-turn-step-fire-visible.js:97–121,141–160,187–195`; `apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js:291–296`; commit union `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-turn-step-commit.js:76–84,149–162`.
- Trigger: a completed canonical traversal has a digest-matching prepared destination (`reusePreparedDestination === true`), and the environment differs between the pre-turn retrieved state and `clock_after` (e.g. a daypart/light transition; also possible for other clock-projected properties). `targetState` clones retrieved state and replaces its clock, but does not refresh `environment_snapshot`. The reuse branch skips `loadPreparedMovementScene`, leaving `currentEnvironmentState` as that stale `targetState`. The new unconditional append then derives facts from its old snapshot. Commit independently builds the correct clock-after prepared context, but unions envelope sensory details into it without replacing or filtering stale environment assertions. The resulting persisted writer package can therefore include both old and current descriptions.
- This violates the factual package boundary: persisted narrator input may contain contradictory facts even though the commit-side projection is current. It is a correctness regression in the new unconditional environment append for the reused-destination branch (the prior implementation omitted this append when `nearest_boundary` was present; the no-boundary path already used the retrieved snapshot).
- Required correction: derive appended environment facts from the authoritative arrival-clock prepared state on the reuse path too, or otherwise avoid appending facts from a state whose `environment_snapshot` is not projected at the arrival clock. Preserve the digest-backed destination's non-environment content and do not introduce a second environment owner. Add a focused regression that crosses a daypart/light boundary with `reusePreparedDestination=true` and asserts the persisted package contains the current facts and no stale conflicting facts.

## Evidence and limits

- Direct source inspection confirms traversal seed projection occurs before the turn's elapsed traversal (`spatial-v3-site-traversal-runtime.js:114–119`); the prepared movement scene at commit is separately loaded with `clock_after` (`turn-step-commit.js:76–84`).
- `currentEnvironmentChanges` reads only `state.environment_snapshot` and does not recompute from `state.clock` (`turn-step-current-scene.js:291–296`).
- Author/root reports: 88 focused tests pass; production-wired fake-provider PostgreSQL test is reported genuine RED→GREEN 1/1. Root verified the correct pair `before-regression-writer-request.json` / `after-writer-request.json`: system and params byte-equal, only current season/weather sensory facts added; the old `before-writer-request.json` is not a paired baseline. That single evidence case does not establish stale-fact exclusion on the reuse/daypart-boundary branch. PostgreSQL was not rerun by this auditor.
- Not verified: full suite, real provider/model behavior, independent database execution, and all traversal-boundary permutations. This is not live-play acceptance.
