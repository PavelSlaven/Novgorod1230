# PR8: travel, navigation and environment runtime

## Status

- Draft PR: https://github.com/PavelSlaven/Novgorod1230/pull/8
- Branch: `codex/pr8-travel-system`
- Base: `chatgpt/universal-category-classification` (stacked on draft PR7)
- Rebased base SHA: `fc71f5dfcfcb087a2cdf67eda050a542c3ddfebe` (PR7 head checked 2026-07-15)
- Last verified rebased PR8 head: `98b84e0294aceab971181b266461f1b288ac6226`
- Draft status: yes
- PR7 dependency: open draft; PR8 is rebased onto its current head in an isolated clean worktree.
- Last completed phase: contract and persistence baseline (partial; not accepted as PR8 completion).
- Current phase: Phases 2–4 — authoring bundles, persistence and domain contracts (`in_progress`).
- Current blocker: no approved pilot-G1 catalog/rules bundles and no configured PostgreSQL integration database.

The branch must be rebased onto `main` after PR7 is integrated and before final audit. The primary worktree remains untouched because it contains unrelated local changes.

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
- 2026-07-15: persistence RED contract proved that the party migration chain lacked travel tables and Stage 25 targets; `003_travel_runtime.sql` now adds normalized journeys, legs and edge-progress positions.
- 2026-07-15: environment RED tests proved that an arbitrary catalog object could pass materialization; the bundle boundary now hard-blocks digest, revision, region, period and permission mismatches.
- 2026-07-15: travel RED tests proved that journey creation accepted unbound rules; `TravelRulesBundle` now verifies digest, scope, source refs and readiness before any lifecycle transition.
- 2026-07-15: environment update now binds state version and idempotency key: stale requests hard-block, duplicate key returns the persisted state without a second mutation.
- 2026-07-15: cue lifecycle no longer supplies semantic defaults for incomplete templates; a required template field produces a typed hard block.
- 2026-07-15: `campJourney` сначала был зафиксирован RED-тестом с отсутствующим export; GREEN-переход переводит только active journey на существующем edge в `camped`, не создавая G0–G4 или travel-scene instance.
- 2026-07-15: `advanceJourney` больше не завершает leg по скрытому default `progress_permille=1000`; RED-тест зафиксировал старое поведение, GREEN требует явного progress или `completeJourney`.
- 2026-07-15: `buildTravelChangeSetProposal` добавлен через RED/GREEN как единственный persistence-neutral output travel-domain: proposal version-bound и содержит только normalized journey/legs/position, без environment, body, clock или visible state.
- 2026-07-15: lifecycle следов больше не подставляет recognition/navigation, decay thresholds или weather multiplier; неполные approved template/profile приводят к typed hard block.
- 2026-07-15: начато обязательное внутреннее разбиение `@rus/environment-landmarks`: errors, utilities, normalized state, pinned catalog validation и safe observation boundary вынесены из public facade без изменения API или lifecycle semantics; baseline/cue/trace extraction остаётся следующим шагом.

## Checks recorded on transferred baseline

- `npm run test:domain` — 56/56 passed before stacking.
- `npm run world-db:schema-check` — passed before stacking.
- `npm run world-db:schema-doc-check` — passed before stacking.
- `git diff --check` — passed before stacking.

## Current blockers and data gaps

- PR7 is draft; PR8 cannot become mergeable until it is integrated and this branch is rebased onto `main`.
- No approved pilot-G1 `EnvironmentCatalogBundle` or `TravelRulesBundle` exists yet.
- The prior environment implementation must be reconciled with the approved PR8 table names and contracts before production integration.
- Production integration is absent: Stage 25 has no atomic journey writer, and turn/visibility/presentation/game-server ports have not been wired.

## Required integration order

1. Formal norms and contracts with RED tests.
2. Reconcile DDL/import/readiness and create approved pilot data.
3. Add journey persistence and `@rus/travel`.
4. Complete environment and movement-routes contracts.
5. Integrate new-game, turn, visibility, presentation and game-server ports.
6. Run PostgreSQL, integration and E2E validation, then repeat critic audit.

## Phase tracker

### Phase 1 — normative architecture and contracts

- Status: `in_progress` (baseline contract is implemented; full lifecycle and integrations are pending)
- Goal: define the travel state machine, position union and public contracts before runtime implementation.
- Input: PR7 `fc71f5dfcfcb087a2cdf67eda050a542c3ddfebe`; rebased PR8 head `98b84e0294aceab971181b266461f1b288ac6226`.
- Files studied: mandatory architecture, materialization, movement, time, turn, interface, graph and map norms; current movement and environment packages.
- RED tests: `packages/travel/test/domain.test.js` — observed failure: `ERR_MODULE_NOT_FOUND` before implementation.
- GREEN/refactor: initial position/lifecycle implementation passed 8/8 tests, including active-journey conflict and an explicit actual/perceived divergence; no refactor yet.
- Audit: previous baseline audit remains `CHANGES REQUIRED`; no finding is closed by this entry.
- Next dependency: safely rebase this branch onto the current PR7 head before integration work.

## Contract registry

| Contract | Version | Owner | Producer → consumer | Persistence | Player-visible |
| --- | --- | --- | --- | --- | --- |
| TravelIntent | `travel.v1` | `@rus/travel` | turn handler → travel domain | proposal only | no |
| TravelPosition | `travel.v1` | `@rus/travel` | party state → travel domain | `party_positions` (planned) | perceived projection only |
| Journey / JourneyLeg | `travel.v1` | `@rus/travel` | travel domain → Stage 25 | `party_journeys` / `party_journey_legs` (planned) | status only |
| RouteTraversalRequest | `movement-route.v1` | `@rus/movement-routes` | travel domain → route evaluator | proposal only | no |
| EnvironmentCatalogBundle | `environment-catalog.v1` | `@rus/environment-landmarks` | approved loader → environment domain | catalog pin only | no |
| TravelRulesBundle | `travel-rules.v1` | `@rus/travel` | approved loader → travel domain | catalog pin only | no |

Typed domain errors are versioned with the travel contracts; persistence, presentation and bundle consumers are not implemented yet.

## Check evidence

| Command | Date | Head before command | Result | Notes |
| --- | --- | --- | --- | --- |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | `69b0ee8` | RED: 1 failed | `ERR_MODULE_NOT_FOUND` before implementation. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | `69b0ee8` | PASS: 8/8 | Initial travel contract lifecycle, active-journey conflict and explicit perceived position. |
| `node --test packages/movement-routes/test/domain.test.js` | 2026-07-15 | `369ebe3` | RED: 1 failed | Missing `calculatePartialTraversal` export. |
| `node --test packages/movement-routes/test/domain.test.js` | 2026-07-15 | `369ebe3` | PASS: 4/4 | Fail-closed route traversal contract. |
| `npm run test:domain` | 2026-07-15 | `369ebe3` | PASS: 85/85 | Full package domain suite; PostgreSQL/integration/E2E not run. |
| `npm run test:domain` | 2026-07-15 | `19c3f37` | PASS: 93/93 | Includes environment bundle validation and all existing domain packages. |
| `node --test test/modules/travel-persistence-contract.test.js` | 2026-07-15 | `1327d79` | PASS: 2/2 | Ordered migration and Stage 25 travel-target contract. |
| `npm run test:modules` | 2026-07-15 | `1327d79` | PASS: 261/261 | Includes strict traversal regression and travel-persistence contract. |
| `node --test test/integration/party-runtime-v2-postgres.test.js` | 2026-07-15 | `1327d79` | SKIPPED: 6 | `PARTY_DATABASE_URL` is not configured; PostgreSQL migration/constraint test awaits an integration database. |
| `npm run world-db:schema-check` | 2026-07-15 | `98b84e0` | PASS: 134 tables | Rebased schema chain is internally consistent. |
| `npm run world-db:schema-doc` / `world-db:schema-doc-check` | 2026-07-15 | `98b84e0` | PASS | Generated schema reference is current. |
| `npm run docs:generate` / `docs:check` | 2026-07-15 | `98b84e0` | PASS | Generated module and manifest artifacts are current. |
| `npm run test:domain` | 2026-07-15 | `98b84e0` | PASS: 86/86 | Clean rebased tree; no PostgreSQL dependency in this suite. |
| `npm run test:modules` | 2026-07-15 | `98b84e0` | PASS: 261/261 | Static/module contract suite. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `a201ca9` | RED: 1 failed | `campJourney` отсутствовал в публичном API. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `a201ca9` | PASS: 10/10 | Camp-переход сохраняет edge-progress и возобновляется только через `resumeJourney`. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `a201ca9` | PASS: 87/87 | Регрессия доменного набора после camp-перехода. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `ca62999` | RED: 1 failed | `advanceJourney` завершал leg без явного progress. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `ca62999` | PASS: 11/11 | Явный progress стал обязательным. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `ca62999` | PASS: 88/88 | Полный domain regression. |
| `npm run test:modules` | 2026-07-15 | рабочее дерево после `ca62999` | PASS: 261/261 | Static/module contracts. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `347284e` | RED: 1 failed | Отсутствовал `buildTravelChangeSetProposal`. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `347284e` | PASS: 12/12 | Proposal version-bound и не содержит несвязанных state blocks. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `347284e` | PASS: 89/89 | Полный domain regression. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | рабочее дерево после `bc986f3` | RED: 1 failed | Неполный trace template проходил за счёт семантических defaults. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | рабочее дерево после `bc986f3` | PASS: 8/8 | Trace template и decay profile валидируются fail-closed. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `bc986f3` | PASS: 90/90 | Полный domain regression. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | рабочее дерево после `9088f4e` | PASS: 8/8 | Internal-module extraction сохранил public behavior. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `9088f4e` | PASS: 90/90 | Полный domain regression после extraction. |

## Data and migration registry

| Order | Artifact | Status | Notes |
| --- | --- | --- | --- |
| 001 | `schemas/party-db/001_party_runtime.sql` | existing | Base party runtime. |
| 002 | `schemas/party-db/002_environment_landmarks.sql` | existing PR8 baseline | Environment runtime state. |
| 003 | `schemas/party-db/003_travel_runtime.sql` | in progress | `party_journeys`, `party_journey_legs`, and a node/edge-progress `party_positions` union. |

The ordered migration loader, seed script, party preflight and Stage 25 logical target registry include migration 003. Its real PostgreSQL validation remains blocked only by the absent local party database; no SQL result is claimed from the static contract test.
