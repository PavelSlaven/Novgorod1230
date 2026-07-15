# PR8: travel, navigation and environment runtime

## Status

- Draft PR: https://github.com/PavelSlaven/Novgorod1230/pull/8
- Branch: `codex/pr8-travel-system`
- Base: `chatgpt/universal-category-classification` (stacked on draft PR7)
- Base SHA: `815b81eb0ef613fd97cf1c16e895d6b7ebbc05d5`

The branch must be rebased on `main` after PR7 is integrated and before final audit.

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
- The next implementation step is contract-level RED tests for strict route traversal, journey position union and lifecycle.

## Checks recorded on transferred baseline

- `npm run test:domain` — 56/56 passed before stacking.
- `npm run world-db:schema-check` — passed before stacking.
- `npm run world-db:schema-doc-check` — passed before stacking.
- `git diff --check` — passed before stacking.

## Current blockers and data gaps

- PR7 is draft; PR8 cannot become mergeable until it is integrated and this branch is rebased.
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
