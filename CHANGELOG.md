# Changelog

## 0.23.0-migration.23 — 2026-07-12

### Added

- Byte-faithful canonical documentation corpus with 19 registered sources.
- `@rus/knowledge-source` read-only production module with typed fail-closed errors.
- Corpus, aliases, import-history, graph and RAG manifest schemas.
- Deterministic graph materialization from the approved semantic snapshot.
- Deterministic corpus rechunking with exact approved embedding-snapshot parity.
- Explicit `ports.knowledgeSource` production runtime binding.
- Unique-file review, corpus parity and migration reports.

### Changed

- Root release advanced to `0.23.0-migration.23`.
- `docs:check` now verifies corpus parity and generated graph/RAG freshness.
- Production startup fails closed when the corpus is damaged or generated artifacts are stale.

### Preserved

- Semantic graph relations and embedding vectors are not regenerated or invented by code.
- Legacy remains available only as rollback/evidence and is not deleted.
- Game rules and world semantics are unchanged.

## 0.20.0-migration.20 — 2026-07-12

### Added

- Autonomous `@rus/shadow-run` tool package.
- Versioned `rus.shadow_corpus.v1` manifest with 25 parity/isolation/rollback cases.
- Structural comparison policy covering all 12 normative categories.
- Legacy-versus-modular turn shadow case on one approved player intent.
- Rollback feature-flag gate and fail-closed production composition checks.
- JSON/Markdown `rus.shadow_run_report.v1` evidence.

### Result

- Shadow cases: 25/25 passed.
- Corpus checks: 114/114 passed.
- Blocking differences: 0.
- Non-blocking differences: 0.
- Recommendation: `go_to_staged_cutover`.
- Full regression suite: 291/291 passed.

### Preserved

- Legacy entrypoint remains default.
- No live provider call or production DB write is made by the shadow tool.
- Artistic prose is not compared byte-for-byte.
- Legacy source is retained for rollback and finalization.

### Next

- Staged cutover with repeated shadow and rollback checks.

## 0.19.0-migration.19 — 2026-07-12

### Added

- Canonical architecture, contract and pipeline documentation.
- Complete generated MODULE_INDEX for 20 production packages.
- Deterministic schema reference and generated manifest.
- Canonical document path registry, seed source/import registries and dated artifact manifests.
- Six documentation/generated-data tests.

### Changed

- Historical migration documents moved from repository root to canonical docs paths without duplicate copies.
- @rus/docs-tools extended with generate/check CLI.
- Architecture and release hygiene gates now enforce documentation, generated, seed and artifact policies.
- Release test count increased from 274 to 280.

### Preserved

- Game rules, LLM semantic ownership, DB schemas and runtime behavior.
- Legacy production entrypoint remains default.

### Next

- Production-corpus shadow run and structural comparison.

## 0.15.0-migration.15 — 2026-07-12

### Added

- `@rus/narration` with versioned request/output/audit/route/result contracts.
- Bounded generation, audit, repair and senior-audit flow.
- Adapter from approved new-game Stages 22–23 to common narration result.
- Versioned FirstGameScreen and TurnScreen read models.
- Character, Inventory, People, Route, Map, Journal and Diagnostic panels.
- Stage 26 → FirstGameScreen adapter.
- Narration/Presentation architecture and isolation tests.
- `NARRATION_PRESENTATION_MIGRATION_PLAN.md`.
- `NARRATION_PRESENTATION_PHASE_REPORT.md`.
- `NARRATION_PRESENTATION_CONTRACT_MAP.md`.

### Changed

- `@rus/turn` now requires `narrator.run` and returns a versioned TurnScreen.
- Custom turn screen projectors are validated against the same public contract.
- Architecture checker now enforces narration/presentation dependencies, cycles, ports and security markers.
- Root release version updated to `0.15.0-migration.15`.

### Preserved

- Stage 22/23/26 behavior and compatibility exports.
- Legacy application entrypoints remain default.
- Player input remains `intent_not_fact`.
- No deterministic semantic or prose fallback was added.

### Not changed

- Provider transport configuration.
- Database schemas or production adapters.
- HTTP routes and browser UI.
- Production shadow/cutover state.


## 0.14.0-migration.14 — 2026-07-12

- Создан единый `@rus/turn` workflow из 13 изолированных блоков.
- Turn workflow переведён на общий `@rus/pipeline-engine`.
- Удалён production deterministic semantic fallback: mode, availability и consequences требуют explicit resolvers.
- Approved D20 requests исполняются через injected `RandomSource`.
- Добавлены time update, hidden/visible security boundary, narration gate, write-plan gate, idempotent commit и screen projection.
- Добавлен `@rus/turn/compat` без legacy imports.
- Добавлены turn tests, architecture boundaries, plan/report/contract map.
- Legacy production entrypoint не переключён.

## 0.12.0-migration.12 — 2026-07-12

### Added

- Common modular new-game orchestrator for Stages 2–26.
- Immutable stage plan, orchestration context, checkpoints, resume and bounded repair routing.
- Frozen artifact registry with SHA-256 digests.
- Public entry `@rus/new-game/orchestrator`.
- Orchestrator integration tests, migration plan and phase report.

### Changed

- Stage 2 and Stage 3 definitions now execute through the common stage contract.
- The new-game definition registry now exposes all Stages 2–26.
- Root and `@rus/new-game` versions advanced to 0.12.0.

### Preserved

- Legacy production entrypoint and compatibility facades.
- Stage-local validators, auditors, repair contracts and semantic ownership.
- The rule that code does not invent world facts or infer absent semantic input.

### Next

- Production-corpus shadow run against the legacy route.
- DB-backed integration, browser E2E and staged cutover.

## 0.11.0-migration.11 — 2026-07-12

### Added

- Modular Stages 9–12 with explicit definitions and compatibility entries.
- Recovery-baseline fixtures and parity tests for the missing middle new-game segment.
- Architecture gates for source and dist/release facades, file limits, dependency isolation and cycles.
- `STAGES9_12_MIGRATION_PLAN.md` and `STAGES9_12_PHASE_REPORT.md`.

### Changed

- Legacy Stage 9–12 implementations replaced with one-line compatibility facades.
- Stage 9 split into contract, selection validation, source gate and orchestration modules.
- Stage 10 split into input, DB read checks, audit checks and orchestration modules.
- Stage 11 split into contract, validation, shared traversal and executor orchestration modules.
- Stage 12 split into code precheck, input/output validation and failed-audit modules.

### Preserved

- All named exports and representative behavior from the available recovery baseline.
- Candidate-bound selection, read-only audit semantics and immutable dossier boundary.
- Existing Stages 2–8 and 13–26 behavior.

### Next

- Common modular new-game orchestrator for Stages 2–26.
- Shadow run, DB-backed integration and browser E2E.

## 0.10.1-migration.10-recovery — 2026-07-12

### Added

- Modular Stages 2–8 with explicit stage definitions and compatibility entries.
- Golden baseline fixtures from the last available `0.9.0` archive.
- Stage 2–8 API parity, port-isolation, materialization-boundary and facade tests.
- Recovery migration plan and phase report.

### Changed

- Legacy Stage 2–8 files replaced with one-line compatibility facades.
- Stage 4–8 read-only retrievers are injected through explicit ports.
- Legacy data bindings are isolated in `packages/new-game/src/legacy-adapter.js`.
- Architecture checker now enforces Stage 2–8 boundaries.

### Preserved

- All named exports from the `0.9.0` Stage 2–8 baseline.
- Candidate-bound semantics and existing result shapes.
- The rule that code does not materialize world entities in early retrieval stages.

### Recovery limitation

- Drive documentation references modular Stages 9–12 in an unavailable `0.10.0` artifact. This release does not fabricate or claim that missing implementation.

## 0.9.0-migration.9 — 2026-07-11

### Added

- Modular Stages 13–16 with bounded public APIs and compatibility entries.
- Neutral G5 scene template/draft validation boundary.
- Stage 13–16 schemas, enums, limits and handoff contracts in `@rus/contracts`.
- Stage 13–16 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.8.0.
- Parity, security, repair, contracts/runtime and handoff integration tests.
- Stage 13/14/15/16 parity reports and G5 placement pipeline report.

### Changed

- Legacy Stage 13–16 files replaced with one-line compatibility facades.
- Stage 14 independent audit no longer imports Stage 13 implementation.
- Stage 16 validation split across draft, item, container, binding and audit modules.
- Legacy Stage 15–16 role adapters use runtime descriptors instead of inline tiers.
- Architecture checker covers Stages 13–16 and the neutral G5 boundary.
- All workspaces moved to version `0.9.0`.

### Preserved

- Legacy export surfaces and result shapes.
- G5, NPC and item placement semantics.
- Input, validation, audit, repair, permission and handoff behavior.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–12.


## 0.8.0-migration.8 — 2026-07-11

### Added

- Modular Stages 17, 18 and 19 with bounded public APIs and compatibility entries.
- Neutral time-light consistency boundary.
- Weather and Stage 17–19 contracts in `@rus/contracts`.
- Stage 17–19 LLM role/tier descriptors in `@rus/llm-runtime`.
- Baseline fixtures from release 0.7.0.
- Parity, security, repair, handoff and Stage 17 → Stage 20 integration tests.
- Stage 17/18/19 parity reports and hidden-state pipeline report.

### Changed

- Legacy Stage 17–19 files replaced with one-line compatibility facades.
- Legacy weather retriever delegates validation to canonical contracts.
- Stage 19 validation split across bounded entity, disclosure and helper modules.
- Stage 18 digest uses canonical kernel SHA-256.
- Legacy role adapters use runtime descriptors instead of inline tier values.
- Architecture checker covers Stages 17–19 and the neutral time-light boundary.
- All workspaces moved to version `0.8.0`.

### Preserved

- Legacy export surfaces and result shapes.
- Input, validation, audit, repair and commit behavior.
- Concern codes, severity and ordering.
- Existing legacy failure baseline: 256/261.

### Not changed

- World-generation semantics.
- Database schemas.
- UI behavior.
- Stages 2–16.

## 0.7.0-migration.7 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-20` и compatibility API для 17 прежних экспортов.
- `@rus/new-game/stages/stage-21` и compatibility API для 21 прежнего экспорта.
- Декларативные `stage20Definition` и `stage21Definition`.
- Нейтральный visible-context reference/filter/precheck boundary.
- Stage 20–21 schema names, audit enums, concern codes и routes в `@rus/contracts`.
- Visible-context role/tier descriptors в `@rus/llm-runtime`.
- Baseline fixtures Stages 20–21 версии 0.6.0.
- Parity, security, repair, integration, contracts/runtime и architecture tests.
- `STAGE20_PARITY_REPORT.md`, `STAGE21_PARITY_REPORT.md`, `VISIBLE_CONTEXT_PIPELINE_REPORT.md`.

### Changed

- `stage20-visible-context.js` заменён compatibility-фасадом.
- `stage21-visible-context-audit.js` заменён compatibility-фасадом.
- Stage 20 разделён по policy, input, references, validation и orchestration.
- Stage 21 разделён по policy, input, independent precheck, audit validation и orchestration.
- Stage 21 больше не импортирует Stage 20 implementation.
- Inline Stage 21 provider/model metadata заменена descriptor из `@rus/llm-runtime`.
- Все workspace packages и apps переведены на версию `0.7.0`.
- Architecture checker расширен правилами Stages 20–21 и neutral visible-context boundary.

### Preserved

- Stage 20 and Stage 21 legacy export surfaces.
- Visible-context and audit policies.
- Reference/filter/precheck behavior.
- Canonical package digest binding.
- Concern codes, severity and concern ordering.
- Format/semantic/senior repair behavior.
- Audit routing, histories, diagnostics and permissions.
- Legacy pipeline compatibility.

### Not changed

- Player-visible prose semantics.
- Stages 2–19 world-generation semantics.
- Stage 22–26 behavior.
- Database schemas.
- UI behavior.

## 0.6.0-migration.6 — 2026-07-11

### Added

- `@rus/new-game/stages/stage-22` с ограниченным публичным API.
- `@rus/new-game/stages/stage-22/compat` для прежних 22 экспортов.
- `@rus/new-game/stages/stage-23` с ограниченным публичным API.
- `@rus/new-game/stages/stage-23/compat` для прежних 23 экспортов.
- Декларативные `stage22Definition` и `stage23Definition`.
- Neutral narrator reference index.
- Narrator boundary schema names и enums в `@rus/contracts`.
- Golden baseline Stages 22–23 версии 0.5.0.
- Fixtures, parity, security, integration и architecture tests.
- `STAGE22_PARITY_REPORT.md`.
- `STAGE23_PARITY_REPORT.md`.
- `NARRATOR_PIPELINE_REPORT.md`.

### Changed

- `stage22-narrator-prose.js` заменён compatibility-фасадом.
- `stage23-narrator-prose-audit.js` заменён compatibility-фасадом.
- Stage 22 разделён по policy, input, references, precheck, output validation и orchestration.
- Stage 23 разделён по policy, input, structure validation, precheck, audit validation и orchestration.
- Stage 23 больше не импортирует Stage 22 implementation.
- Все workspace packages и apps переведены на версию `0.6.0`.
- Architecture checker расширен правилами Stages 22–23.

### Preserved

- 22 legacy-экспорта Stage 22.
- 23 legacy-экспорта Stage 23.
- Narrator и audit policies.
- Visible-context и prose digest binding.
- Action/reference validation.
- Concern codes, severity и порядок concerns.
- Format/semantic/senior repair behavior.
- Audit routing и upstream repair contracts.
- History и diagnostics shape.
- Stage 23 commit handoff.

### Not changed

- Player-visible prose semantics.
- Stage 20/21 visible-context generation and audit.
- Stage 24 write-plan behavior.
- Stage 25 transaction behavior.
- Stage 26 first-screen behavior.
- LLM provider transport.
- UI и database schemas.
