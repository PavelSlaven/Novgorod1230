# PR8: travel, navigation and environment runtime

## Status

- Draft PR: https://github.com/PavelSlaven/Novgorod1230/pull/8
- Branch: `codex/pr8-travel-system`
- Base: `chatgpt/universal-category-classification` (stacked on draft PR7)
- Intended base SHA: `aefd739f7249f8e0d1e6063422a84fc2acca0a93` (PR7 head checked 2026-07-15)
- Current PR8 head: `69b0ee88a03a3d4ae0d8809869e4a6de03101bc4`
- Draft status: yes
- PR7 dependency: open draft; current PR8 history is not yet rebased onto its current head.
- Last completed phase: baseline transfer only (historical; not accepted).
- Current phase: Phase 1 — normative architecture and contract RED tests (`in_progress`).
- Current blocker: the working tree contains unrelated uncommitted changes, so rebasing PR8 onto the current PR7 head is unsafe until their owner resolves or isolates them.

The branch must be rebased onto the current PR7 head before the first integration commit, and onto `main` after PR7 is integrated and before final audit.

## Scope

PR8 implements a fail-closed travel runtime: persisted journeys and legs, route and course navigation, actual/perceived positions, pace, causal interruptions, rest/camp, atomic G4 arrival, environment landmarks/cues/traces, visible projections and atomic party persistence.

Canonical G0–G4, routes, settlements and historical facts remain read-only authoring data. Runtime instances are materialized only from approved, version-pinned catalog bundles.

## Initial state and prior audit

The transferred environment baseline created `@rus/environment-landmarks`, initial world/party DDL and Stage 25 mappings. Its mandatory audit returned `CHANGES REQUIRED` because the work had no approved bundle or integration contracts. This report remains part of the PR history.

## Decisions

- `@rus/travel` owns pure journey state transitions; it does not read persistence or call LLM.
- `@rus/movement-routes` owns physical edge traversal only.
- `@rus/environment-landmarks` remains a separate deterministic subsystem.
- `@rus/turn` orchestrates public contracts and commit gates only.
- Travel uses a stacked branch because PR7 is still draft; no fallback to legacy runtime is permitted.

## TDD journal

- Existing environment baseline tests passed before transfer.
- 2026-07-15: `@rus/travel` RED test first failed with `ERR_MODULE_NOT_FOUND` (no implementation); the initial pure contract implementation is now GREEN at 6/6 tests.
- 2026-07-15: `@rus/movement-routes` RED test first failed because `calculatePartialTraversal` did not exist; strict profile/transport traversal is GREEN at 4/4 tests.
- 2026-07-15: environment RED test proved that baseline initialization implicitly created a cue; baseline initialization is now limited to persistent landmarks and lifecycle requires explicit update.

## Checks recorded on transferred baseline

- `npm run test:domain` — 56/56 passed before stacking.
- `npm run world-db:schema-check` — passed before stacking.
- `npm run world-db:schema-doc-check` — passed before stacking.
- `git diff --check` — passed before stacking.

## Current blockers and data gaps

- PR7 is draft; PR8 cannot become mergeable until it is integrated and this branch is rebased. The current PR7 head is not an ancestor of PR8.
- No approved pilot-G1 `EnvironmentCatalogBundle` or `TravelRulesBundle` exists yet.
- The prior environment implementation must be reconciled with the approved PR8 table names and contracts before production integration.
- `docs:generate` is currently blocked by unrelated untracked legacy runtime artefacts; these artefacts are not part of PR8 and are preserved.

## Required integration order

1. Formal norms and contracts with RED tests.
2. Reconcile DDL/import/readiness and create approved pilot data.
3. Add journey persistence and `@rus/travel`.
4. Complete environment and movement-routes contracts.
5. Integrate new-game, turn, visibility, presentation and game-server ports.
6. Run PostgreSQL, integration and E2E validation, then repeat critic audit.

## Phase tracker

### Phase 1 — normative architecture and contracts

- Status: `in_progress`
- Goal: define the travel state machine, position union and public contracts before runtime implementation.
- Input: PR7 `aefd739f7249f8e0d1e6063422a84fc2acca0a93`; PR8 `69b0ee88a03a3d4ae0d8809869e4a6de03101bc4`.
- Files studied: mandatory architecture, materialization, movement, time, turn, interface, graph and map norms; current movement and environment packages.
- RED tests: `packages/travel/test/domain.test.js` — observed failure: `ERR_MODULE_NOT_FOUND` before implementation.
- GREEN/refactor: initial position/lifecycle implementation passed 7/7 tests, including active-journey conflict; no refactor yet.
- Audit: previous baseline audit remains `CHANGES REQUIRED`; no finding is closed by this entry.
- Next dependency: safely rebase this branch onto the current PR7 head before integration work.

## Contract registry

| Contract | Version | Owner | Producer → consumer | Persistence | Player-visible |
| --- | --- | --- | --- | --- | --- |
| TravelIntent | `travel.v1` | `@rus/travel` | turn handler → travel domain | proposal only | no |
| TravelPosition | `travel.v1` | `@rus/travel` | party state → travel domain | `party_positions` (planned) | perceived projection only |
| Journey / JourneyLeg | `travel.v1` | `@rus/travel` | travel domain → Stage 25 | `party_journeys` / `party_journey_legs` (planned) | status only |
| RouteTraversalRequest | `movement-route.v1` | `@rus/movement-routes` | travel domain → route evaluator | proposal only | no |

Typed domain errors are versioned with the travel contracts; persistence, presentation and bundle consumers are not implemented yet.

## Check evidence

| Command | Date | Head before command | Result | Notes |
| --- | --- | --- | --- | --- |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | `69b0ee8` | RED: 1 failed | `ERR_MODULE_NOT_FOUND` before implementation. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | `69b0ee8` | PASS: 7/7 | Initial travel contract lifecycle and active-journey conflict. |
| `node --test packages/movement-routes/test/domain.test.js` | 2026-07-15 | `369ebe3` | RED: 1 failed | Missing `calculatePartialTraversal` export. |
| `node --test packages/movement-routes/test/domain.test.js` | 2026-07-15 | `369ebe3` | PASS: 4/4 | Fail-closed route traversal contract. |
| `npm run test:domain` | 2026-07-15 | `369ebe3` | PASS: 85/85 | Full package domain suite; PostgreSQL/integration/E2E not run. |
