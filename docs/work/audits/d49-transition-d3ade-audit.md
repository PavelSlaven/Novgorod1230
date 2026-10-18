# Re-audit: arrival environment boundary fix d3ade7c

**Verdict: PASS_WITH_NOTES — prior P1 is closed in this immutable patch.** Audited exact HEAD `d3ade7ce2cb466af3ff1615e20939978c3ba33c9`; worktree clean. Read-only; no edits, PostgreSQL, model, or tests run by this auditor.

## P1 closure

At `apps/game-server/src/runtime/lower-dvina-trace-turn-step-fire-visible.js:193–205`, reused destinations whose `currentEnvironmentState` is still the cloned `targetState` now project the environment from the authoritative arrival `clock` before `currentEnvironmentChanges` is appended (`:207–210`). This addresses the prior stale `environment_snapshot` path without loading the prepared scene again. The digest-matched destination sensory seed remains intact; the patch does not filter, replace, or rewrite its facts. The added test in `apps/game-server/test/lower-dvina-trace-turn-step-commit.test.js` exercises this branch: it asserts the clock-after projection, zero scene loads, preservation of the natural water observation, arrival night/dark/overcast facts, and absence of old evening/daylight/clear assertions.

## Owner and wiring

The projection dependency is passed from the existing repository owner through `buildLowerDvinaTracePhase2Services` (`lower-dvina-trace-phase-2-services.js:132`), `createLowerDvinaTracePhase2ServiceFlow` (`lower-dvina-trace-phase-2-service-flow.js:32,86–94`), to the visible projector. `target-current-factual-context.js:28–49` implements the same `projectEnvironmentAtClock` owner already used by initial/current environment reads and phase-2 scene loading. It projects approved calendar/weather records at the supplied exact clock; no new owner, DB lookup, or separate weather authority is introduced. If an approved environment snapshot exists but the projection dependency or clock is missing, the projector fails closed with `TRACE_CURRENT_SCENE_PROJECTION_INVALID` (`fire-visible.js:193–200`).

## Contract/evidence status

The finding’s governing contract boundary remains: arrival facts must reflect the authoritative current environment; narrator gets only persisted player-safe facts, and prose must not contain contradictory world assertions. Active source set remains the temporal/environment owner, Spatial v3 traversal owner, `turn_step_llm_contract.md`, and `situational_prose_requirements.md` per `CONTRACT_INDEX.md` §8.1. No change to precedence or owner boundary is apparent.

Author/root report for d3ade7c: 94/94 focused checks, architecture/docs/syntax/diff checks passed, plus production-wired fake-provider PostgreSQL actual-writer RED→GREEN 1/1; the auditor did not rerun them. Root’s correct paired before/after writer requests are `before-regression-writer-request.json` and `after-regression-writer-request.json`; the old `before-writer-request.json` is not a paired baseline. Earlier whole-change map audit for 60051abb2..92be77cd0 remains the separate source for broad 342-file coverage; this re-audit does not repeat that inspection. Not verified here: full CI, models/real provider, or live-play acceptance. Per root, full CI follows integration merge.

**Notes:** the new unit directly covers the reported stale daypart/light/weather case and preserved natural observation; broader temporal boundary permutations are not independently run here. This is patch-level contract verdict only, not D49 acceptance.
