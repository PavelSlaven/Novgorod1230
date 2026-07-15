# PR8: travel, navigation and environment runtime

## Status

- Draft PR: https://github.com/PavelSlaven/Novgorod1230/pull/8
- Branch: `codex/pr8-travel-system`
- Base: `chatgpt/universal-category-classification` (stacked on draft PR7)
- Rebased base SHA: `5463af867eab5e82d634151183f05bd7264e70b4` (PR7 head checked 2026-07-15)
- Last verified published PR8 head: `c43e67e`
- Draft status: yes
- PR7 dependency: open draft; PR8 was rebased onto its current head in an isolated clean worktree.
- Last completed phase: contract, persistence and authoring-readiness baseline (partial; not accepted as PR8 completion).
- Current phase: Phase 4 world-base travel/environment authoring and readiness (`in_progress`).
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
- 2026-07-15: `calculateNextTravelBoundary` добавлен RED/GREEN: travel domain детерминированно выбирает ближайшую формально переданную границу и блокирует пустой required candidate set; владельцы времени, тела, погоды и causal events не перенесены в travel.
- 2026-07-15: authoring schema согласован с runtime environment contracts: cue template хранит explicit intensity/recognition/navigation, trace template — navigation, decay profile — queryable thresholds и coefficients. Это не создаёт approved data, source/provenance или pilot bundle.
- 2026-07-15: завершено внутреннее разбиение lifecycle `@rus/environment-landmarks`: baseline, cue и trace вынесены из public facade. Фасад только валидирует formal input, связывает операции и формирует immutable result; отдельные lifecycle не читают БД, не вызывают LLM и не создают G0–G4.
- 2026-07-15: добавлен `buildTravelVisibleProjection` в `@rus/visibility-knowledge-memory`: projection принимает только player-safe perceived/observed fields и hard-blocks actual route/progress, cue source/location binding, catalog pins и audit fields.
- 2026-07-15: presentation получил `createTravelPanelContract`: UI read model использует только validated travel visible projection и не реализует механику travel/navigation.
- 2026-07-15: существующий `@rus/turn` workflow расширен contract-level state blocks и Stage 25 write targets для journeys/legs/environment. Второй orchestrator не создан; code-owned travel handlers и production ports ещё не подключены.
- 2026-07-15: safe travel projection встроен в существующий `visible_context_package.travel`; тот же visible/narrator gate повторно валидирует projection и блокирует hidden travel fields.
- 2026-07-15: `TURN_TRAVEL_COMMAND_IDS` фиксирует закрытый code-owned set travel handlers; LLM и free text не могут создать или выбрать несуществующий command id.
- 2026-07-15: `createTravelTurnCommandDefinitions` добавляет definitions для всех travel commands в существующий registry. Definitions требуют formal state-reader context и persistence proposal; неполный контекст блокируется типизированно, без semantic fallback.
- 2026-07-15: `travel.continue` подключён к `@rus/travel.advanceJourney` и `buildTravelChangeSetProposal`; handler требует explicit progress/duration/visible seed/idempotency key и планирует normalized journey/leg/position targets. Остальные lifecycle handlers остаются fail-closed до своих formal requests.
- 2026-07-15: к executable lifecycle добавлены `travel.stop`, `travel.camp`, `travel.resume`, `travel.change_pace` и `travel.abandon`; они вызывают только соответствующие pure transitions и используют тот же version-bound proposal.
- 2026-07-15: `travel.start_route` и `travel.start_course` принимают только заранее сформированный, version-pinned `JourneyPlan` и создают `operation: start` proposal для того же commit gate. Они не выбирают route/edge, не строят course и не обходят проверку rules bundle.
- 2026-07-15: `travel.reroute` принимает только replacement `JourneyPlan` при нулевом progress текущего canonical edge. Он сохраняет identity/version pins, помечает старые незапущенные legs `superseded` и не выбирает новую ветвь без formal plan.
- 2026-07-15: travel plan теперь включает явные persistence metadata (`movement_method`, `started_at`, `updated_at`, `base_time_minutes`). Lifecycle metadata принимает duration/timestamp только формальным input владельца времени. PostgreSQL turn writer hard-blocks неполный или несогласованный journey/legs/position change set, записывает нормализованные rows в одной transaction и не дублирует их в state snapshot. Циклическая FK current-leg сделана `DEFERRABLE INITIALLY DEFERRED`, поэтому active journey и current leg могут быть сохранены атомарно.
- 2026-07-15: из production party store удалён незавершённый, неиспользуемый perception persistence path: он импортировал отсутствующий module и ссылался на отсутствующие party tables. Это не является fallback: вызовы отсутствовали, а восстановление loadable fail-closed repository необходимо для PostgreSQL integration boundary.
- 2026-07-15: builtin production composition теперь принимает `ports.travel` только через обязательный `createTravelPorts` binding factory. Девять портов (context/rules/environment readers, journey/environment repositories, graph reader, clock, RandomSource factory и party store) валидируются до старта; fixture не становится production fallback.
- 2026-07-15: завершение последнего canonical journey leg теперь создаёт `travel-arrival-request.v1` с pinned origin/destination и передаёт единственный `position_transition` в существующий atomic first-entry commit gate. Travel domain не читает baseline и не решает materialization; отсутствие approved bundle по-прежнему блокирует commit.
- 2026-07-15: `travel.continue` принимает только `travel-advance-request.v1`, связывающий journey, leg, state version, duration и selected boundary. Он формирует `travel-advance-result.v1`; stale или чужой journey request блокируется до proposal/commit.
- 2026-07-15: `TravelInterruption` требует `travel-interruption.v1` и causal source из закрытого набора. Произвольный id или новый дорожный event не могут прервать journey.
- 2026-07-15: `resolveCourseEdgeCandidate` принимает только explicit applicable candidate из fact graph. Пустой set, неизвестный selected id или candidate из другой direction/origin приводят к typed hard block, а не к выбору «ближайшей» дороги.
- 2026-07-15: `travel.start_course` требует этот candidate и сверяет с ним первый leg `JourneyPlan`; plan без candidate или с другим edge блокируется до createJourney/commit.
- 2026-07-15: добавлены нормализованные authoring tables для темпа, ориентирования, отдыха, причинных прерываний и их route binding. Все записи version/region/source/period-bound; importer и readiness принимают их только со строгими JSON Schema и provenance. Approved pilot data не создавались.
- 2026-07-15: lifecycle следов получил stable causal identity: повторная доставка того же `emission_id` не создаёт второй trace при новом turn id, а конфликтующий payload с тем же id hard-blocks. Это сохраняет связь «одно действие → один след» без изменения catalog candidates.
- 2026-07-15: active emitter обязан передавать formal bearing, distance и strength bands. Cue lifecycle больше не подставляет неизвестные или «умеренные» наблюдения; существующий cue обновляет только явно переданные observation fields.
- 2026-07-15: landmark baseline больше не выбирает кандидата с неявным weight или count bound. Неполный profile/graph snapshot образует typed input gap, а не равновероятный candidate set.
- 2026-07-15: decay следов читает только versioned `environment_decay_policy_v1`: rain, snow и mud имеют отдельные approved multipliers; погода без ключа профиля hard-blocks вместо multiplier `1`.
- 2026-07-15: active emitter передаёт `propagation_wind`, а cue template — versioned policy распространения. Ветер изменяет только approved intensity/drift signal; causal source identity не меняется. Отсутствующий policy/effect hard-blocks.
- 2026-07-15: runner миграций сохраняет PostgreSQL `DEFERRABLE INITIALLY DEFERRED` по умолчанию. `pg-mem` получает несовместимый режим только через явный capability-флаг в тесте; production DDL не переписывается.
- 2026-07-15: schema/CI assertions синхронизированы с уже добавленными travel authoring tables: canonical world_base содержит 13 частей и 143 таблицы; read-only PostgreSQL gate проверяет это же число.
- 2026-07-15: public API `@rus/travel` сохранён, но implementation разделена на contracts/support, journey lifecycle и persistence proposals. Это удерживает жёсткую архитектурную границу без изменения contracts или импортного пути.
- 2026-07-15: environment baseline принимает только `environment-catalog.v2`: approved landmark rule связан с scoped profile, profile entry и template. G1/node/landscape/hydrology/land-use/route bindings применяются как фильтры; отсутствующий обязательный scope input или profile образует typed hard block.
- 2026-07-15: cue emission использует нормализованный template/rule identity и exact emitter category, revision, region, season и approved weather policy. Неполный emitter или policy не получают semantic fallback.
- 2026-07-15: trace creation rule использует exact source category, revision/region/season и landscape/hydrology bindings; template и decay profile читаются только по pinned world revision.
- 2026-07-15: `assessEnvironmentFeatureReadiness` проверяет полный environment authoring set до runtime: approved/pinned records, DDL-derived internal references, policy schemas и provenance. Она не создаёт pilot data; пустые profiles, unproven policies и отсутствующие schemas остаются typed readiness gaps.
- 2026-07-15: trace emission с несколькими одновременно применимыми creation rules теперь hard-blocks. Runtime не выбирает первую запись из порядка bundle.

## Checks recorded on transferred baseline

- `npm run test:domain` — 56/56 passed before stacking.
- `npm run world-db:schema-check` — passed before stacking.
- `npm run world-db:schema-doc-check` — passed before stacking.
- `git diff --check` — passed before stacking.

## Current blockers and data gaps

- PR7 is draft; PR8 cannot become mergeable until it is integrated and this branch is rebased onto `main`.
- No approved pilot-G1 `EnvironmentCatalogBundle` or `TravelRulesBundle` exists yet.
- `gn_nov_g1_xp017_yp026` не может быть pilot: `production_import=not_performed`, `runtime_visibility=not_verified` в актуальном `G1_SEMANTIC_CATALOG.md`; создания фиктивной active G1 или повышения draft records не будет.
- Cue/trace runtime contracts still require the same table-faithful reconciliation and approved production bundle before production integration.
- The Stage 25 PostgreSQL writer accepts only one normalized journey/legs/position change set in a transaction. Real world readers, repositories and live PostgreSQL/E2E integration remain absent.

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
- Input: PR7 `5463af867eab5e82d634151183f05bd7264e70b4`; rebased PR8 head `14e3e806454b8cec7ffee54d289a3f2d09e921b4`.
- Files studied: mandatory architecture, materialization, movement, time, turn, interface, graph and map norms; current movement and environment packages.
- RED tests: `packages/travel/test/domain.test.js` — observed failure: `ERR_MODULE_NOT_FOUND` before implementation.
- GREEN/refactor: initial position/lifecycle implementation passed 8/8 tests, including active-journey conflict and an explicit actual/perceived divergence; no refactor yet.
- Audit: previous baseline audit remains `CHANGES REQUIRED`; no finding is closed by this entry.
- Next dependency: an approved pilot G1 and imported, runtime-visible catalog/rules bundles before production integration work.

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
| `npm run docs:generate` / `docs:check` / `knowledge:check-corpus` | 2026-07-15 | working tree after `6eb1a23` | PASS | PR8 normative travel boundary and canonical corpus/derived knowledge artifacts are synchronized; no production data is claimed. |
| `npm run test:apps` / `node --test test/integration/knowledge-source-production.test.js` | 2026-07-15 | working tree after `cd61113` | PASS: 14/14; 1/1 | Production composition rejects missing travel ports and passes only explicit binding ports to services. The knowledge-source smoke test intentionally does not run PostgreSQL migrations under `pg-mem`, which cannot parse deferred FKs. |
| `npm run test:domain` / `npm run test:modules` / `npm run test:apps` / `docs:check` | 2026-07-15 | `743abd5` | PASS: 102/102; 261/261; 14/14 | Full local regression after the production travel-port contract. Real PostgreSQL and E2E remain separate blocked gates. |
| `npm run docs:check` / `world-db:schema-check` / `world-db:schema-doc-check` | 2026-07-15 | `14e3e80` after rebase onto `5463af8` | PASS: 138 tables | The stack was rebased onto the current PR7 head. The schema guard RED exposed stale expected count `134`; it was corrected to the generated 138-table DDL. |
| `npm run test:domain` / `npm run test:modules` / `npm run test:apps` / `node --test test/integration/knowledge-source-production.test.js` | 2026-07-15 | worktree after rebase | PASS: 103/103; 262/262; 14/14; 1/1 | Full local PR8 regression after rebase. PostgreSQL and E2E remain separate blocked gates. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | worktree after `003245d` | RED: 1 failed | `buildTravelArrivalRequest` was absent from the public travel API. |
| `node --test packages/travel/test/domain.test.js packages/turn/test/turn-workflow.test.js packages/turn/test/first-entry-materialization.test.js` | 2026-07-15 | worktree after arrival implementation | PASS: 36/36 | Final leg emits an arrival request and the turn handler forwards only its canonical position transition. |
| `npm run test:domain` / `npm run test:modules` / `npm run test:apps` / `docs:check` | 2026-07-15 | worktree after arrival implementation | PASS: 104/104; 262/262; 14/14 | Full local regression and generated documentation after atomic-arrival handoff. PostgreSQL/E2E remain separate blocked gates. |
| `node --test packages/travel/test/domain.test.js` / `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | worktree after `14ddb00` | RED: 1 failed each | Formal advance request/result exports and enforcement were absent; an unbound journey id reached transition. |
| `npm run test:domain` / `npm run test:modules` / `npm run test:apps` / `docs:check` | 2026-07-15 | worktree after advance-contract implementation | PASS: 105/105; 262/262; 14/14 | Full local regression after binding `travel.continue` to explicit journey/leg/version/boundary input. PostgreSQL/E2E remain separate blocked gates. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | worktree after `41670e9` | RED then PASS: 1 failure → 18/18 | Unstructured interruption was rejected; only formal causal-source interruption can change journey state. |
| `node --test packages/travel/test/domain.test.js` / `docs:check` | 2026-07-15 | worktree after `51b49ea` | RED then PASS: 1 failure → 19/19 | Course continuation accepts only an explicit applicable fact-graph candidate; generated documentation is current. |
| `node --test packages/travel/test/domain.test.js packages/turn/test/turn-workflow.test.js` / full local suites | 2026-07-15 | worktree after `b560d95` | PASS: 36/36; 107/107; 262/262; 14/14 | `travel.start_course` blocks missing/mismatched candidate selection and accepts only a first leg bound to the chosen fact-graph candidate. |
| `node --test tools/world-catalog-workflow/test/materialization-readiness-positive.test.js tools/world-catalog-workflow/test/supplemental-catalog-bundle.test.js` / `world-db:schema-check` / `world-db:schema-doc-check` | 2026-07-15 | worktree before authoring-layer commit | PASS: 30/30; 143 tables | Travel-profile import/readiness blocks missing route binding; generated DDL reference is current. No PostgreSQL execution or approved pilot data is claimed. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | worktree before causal-trace commit | RED: 2 failed, then PASS: 10/10 | Same causal emission is deduplicated across turns; reused emission ID with changed cause hard-blocks. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | worktree before emitter-observation commit | RED: 1 failed, then PASS: 11/11 | Cue emitter without explicit observation bands is blocked; no player-facing signal defaults remain in the lifecycle. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | worktree before landmark-weight commit | RED: 1 failed, then PASS: 12/12 | Landmark selection blocks absent candidate weight or count bounds instead of deriving runtime defaults. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | worktree before decay-policy commit | RED: 1 failed, then PASS: 13/13 | Rain, snow and mud use distinct approved multipliers; unknown weather is a typed data gap. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | worktree before cue-propagation commit | RED: 2 failed, then PASS: 15/15 | Cue propagation consumes an approved wind effect; wind does not replace the causal source identity. |
| `node --test test/cutover/party-db-restore.test.js test/integration/production-infrastructure.test.js` | 2026-07-15 | worktree before pg-mem capability commit | PASS: 11/11 | Test adapter explicitly declares lack of deferred-FK support; PostgreSQL migration remains authoritative. |
| `node --test test/integration/world-base-schema-reference.test.js test/integration/world-base-schema.test.js test/integration/ci-workflow-contract.test.js` / `world-db:schema-check` / `world-db:schema-doc-check` | 2026-07-15 | worktree before schema-assertion commit | PASS: 7/7; 143 tables | Local and CI PostgreSQL gates match the canonical 13-part world_base schema. |
| `node --test packages/travel/test/domain.test.js packages/turn/test/*.test.js packages/environment-landmarks/test/*.test.js` / `architecture:check` | 2026-07-15 | worktree before boundary-split commit | PASS: 57/57; PASS | Travel public API and all moved tests retain behavior while each module stays within the enforced boundary. |
| `npm test` | 2026-07-15 | worktree before runtime-integrity commit | PASS | Modules, domain, apps, tools, shadow, cutover, docs, integration and architecture gates pass. Real PostgreSQL tests remain skipped without `PARTY_DATABASE_URL`; browser E2E is skipped because Chromium is unavailable. |
| `node --test packages/environment-landmarks/test/*.test.js` / `npm run test:domain` / `docs:check` | 2026-07-15 | worktree before landmark-profile commit | PASS: 16/16; 115/115 | Environment catalog v2 enforces rule → profile → entry → template and G1/placement scope without a legacy rule fallback. |
| `node --test packages/environment-landmarks/test/*.test.js` | 2026-07-15 | worktree before cue-scope commit | PASS: 17/17 | Cue rule consumes an explicit emitter category and cannot match a different category. |
| `node --test packages/environment-landmarks/test/*.test.js` | 2026-07-15 | worktree before trace-scope commit | PASS: 18/18 | Trace rule consumes exact source category, landscape scope and normalized template/profile identities. |
| `npm test` | 2026-07-15 | worktree before environment-readiness commit | PASS: tools 142/142; domain 117/117; apps 14/14 | Environment authoring readiness, generated artifacts and deterministic trace-rule selection pass the full suite. Real PostgreSQL tests remain skipped without `PARTY_DATABASE_URL`; browser E2E is skipped because Chromium is unavailable. |
| `node --test tools/docs-tools/test/knowledge-source-migration.test.js tools/docs-tools/test/knowledge-corpus-verifier.test.js tools/docs-tools/test/knowledge-materializer-v2.test.js` | 2026-07-15 | working tree after `6eb1a23` | PASS: 22/22 | Corpus manifest, legacy provenance and generated graph/RAG materialization remain reproducible after the PR8 normative update. |
| `npm run test:domain` / `npm run test:modules` | 2026-07-15 | working tree after `6eb1a23` | PASS: 102/102; 261/261 | Documentation-only change did not regress travel, environment, turn or materialization contracts. |
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
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `99afccd` | RED: 1 failed | Отсутствовал `calculateNextTravelBoundary`. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `99afccd` | PASS: 13/13 | Ближайшая explicit boundary выбирается детерминированно. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `99afccd` | PASS: 91/91 | Полный domain regression. |
| `npm run world-db:schema-check` | 2026-07-15 | рабочее дерево после `f50307c` | PASS: 134 tables | DDL chain и grants корректны. |
| `npm run world-db:schema-doc` / `world-db:schema-doc-check` | 2026-07-15 | рабочее дерево после `f50307c` | PASS | Schema reference regenerated, DDL SHA `617bf96f…`. |
| `npm run docs:generate` / `docs:check` | 2026-07-15 | рабочее дерево после `f50307c` | PASS | Производные module/manifest artifacts актуальны. |
| `node --test packages/environment-landmarks/test/domain.test.js` | 2026-07-15 | рабочее дерево после `3d5a7fa` | PASS: 8/8 | Full lifecycle extraction сохранил public API и behavior. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `3d5a7fa` | PASS: 91/91 | Полный domain regression после lifecycle extraction. |
| `node --test packages/visibility-knowledge-memory/test/domain.test.js` | 2026-07-15 | рабочее дерево после `29aa2ae` | RED: 1 failed | Отсутствовал безопасный travel visible projection. |
| `node --test packages/visibility-knowledge-memory/test/domain.test.js` | 2026-07-15 | рабочее дерево после `29aa2ae` | PASS: 2/2 | Hidden travel edge/progress и cue source блокируются. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `29aa2ae` | PASS: 92/92 | Полный domain regression. |
| `node --test packages/presentation/test/presentation.test.js` | 2026-07-15 | рабочее дерево после `37cc6a6` | RED: 1 failed | Отсутствовал player-facing travel panel contract. |
| `node --test packages/presentation/test/presentation.test.js` | 2026-07-15 | рабочее дерево после `37cc6a6` | PASS: 5/5 | Travel panel принимает только safe projection. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `37cc6a6` | PASS: 93/93 | Полный domain regression. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `6f7c4c3` | RED: 1 failed | Turn contracts не разрешали travel state/targets. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `6f7c4c3` | PASS: 11/11 | Travel blocks/targets доступны в том же workflow. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `6f7c4c3` | PASS: 94/94 | Полный domain regression. |
| `node --test packages/visibility-knowledge-memory/test/domain.test.js` | 2026-07-15 | рабочее дерево после `87f2023` | RED: 1 failed | Visible context schema не принимала travel projection. |
| `node --test packages/visibility-knowledge-memory/test/domain.test.js` | 2026-07-15 | рабочее дерево после `87f2023` | PASS: 2/2 | Travel projection проходит только через normal security gate. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `87f2023` | PASS: 94/94 | Полный domain regression. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `11e7bc4` | RED: 1 failed | Отсутствовал code-owned travel command registry. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `11e7bc4` | PASS: 12/12 | Travel command set закрыт и стабилен. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `11e7bc4` | PASS: 95/95 | Полный domain regression. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `1857f5e` | RED: 1 failed | Отсутствовала handler factory. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `1857f5e` | PASS: 13/13 | Definitions выбираются только по explicit routing ID. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `1857f5e` | PASS: 96/96 | Полный domain regression. |
| `npm install --package-lock-only --ignore-scripts` | 2026-07-15 | рабочее дерево после `55bf36a` | PASS | Workspace lockfile синхронизирован с зависимостью `@rus/travel`. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `55bf36a` | PASS: 13/13 | Continue handler fail-closes при отсутствии formal context. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `55bf36a` | PASS: 96/96 | Полный domain regression. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `1b0f227` | PASS: 14/14 | Continue handler обновляет journey progress и выдаёт normalized write targets. |
| `node --test packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `7809b21` | PASS: 15/15 | `travel.start_route` принимает только preselected pinned plan и формирует `operation: start` proposal. |
| `node --test packages/travel/test/domain.test.js` | 2026-07-15 | рабочее дерево после `7809b21` | PASS: 13/13 | Regression для start proposal и pure journey contracts. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `d7effa5` | PASS: 100/100 | Travel persistence metadata и lifecycle timestamp regression. |
| `npm run test:apps` | 2026-07-15 | рабочее дерево после `d7effa5` | PASS: 13/13 | Writer проверяет normalized change set и выполняет journey → legs → position в одном transaction scope. |
| `npm run test:modules` | 2026-07-15 | рабочее дерево после `d7effa5` | PASS: 261/261 | Migration 003 требует deferred current-leg FK; Stage 25 mapping regression. |
| `node --test test/integration/party-runtime-v2-postgres.test.js` | 2026-07-15 | рабочее дерево после `d7effa5` | SKIPPED: 6 | `PARTY_DATABASE_URL` отсутствует; suite загрузился и готов проверить migration 003 на реальном PostgreSQL. |
| `node --test packages/travel/test/domain.test.js` / `packages/turn/test/turn-workflow.test.js` | 2026-07-15 | рабочее дерево после `3c0d1cc` | PASS: 16/16 each | Reroute разрешён только по explicit pinned replacement plan на boundary. |
| `npm run test:domain` | 2026-07-15 | рабочее дерево после `1b0f227` | PASS: 97/97 | Полный domain regression. |

## Data and migration registry

| Order | Artifact | Status | Notes |
| --- | --- | --- | --- |
| 001 | `schemas/party-db/001_party_runtime.sql` | existing | Base party runtime. |
| 002 | `schemas/party-db/002_environment_landmarks.sql` | existing PR8 baseline | Environment runtime state. |
| 003 | `schemas/party-db/003_travel_runtime.sql` | in progress | `party_journeys`, `party_journey_legs`, node/edge-progress `party_positions` union и deferred current-leg FK для atomic travel change set. |

The ordered migration loader, seed script, party preflight and Stage 25 logical target registry include migration 003. Normal turn persistence now writes normalized journey/legs/position atomically after an exact state-version lock. Its real PostgreSQL validation remains blocked only by the absent local party database; no SQL result is claimed from unit or static contract tests.

## Normative basis

| Path | Blob SHA | Applied requirement |
| --- | --- | --- |
| `AGENTS.md` | `8d41f0b179285ea3720c0b475dce752a1d4e59e0` | Mandatory sources, fail-closed materialization and audit order. |
| `.github/AGENTS.md` | `f6f059e63d514654bc0dec701e815101b6296c30` | Repository workflow and compatibility boundaries. |
| `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt` | `2d45c61755787a122cd2994c559e84dc5b3592b0` | Minimal reversible changes and evidence-based checks. |
| `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt` | `24ad8a3401a9d5b662a32c90fe59a9422b183109` | Mandatory repeat critic audit after implementation. |
| `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md` | `d263f842ee0f8bd5879cefa6d964904a8078b2af` | Code/LLM boundary and typed data gaps. |
| `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md` | `a3cb941927163b623c4c0f66c6d5c0ab8f22a886` | Approved/version-pinned data and party-runtime persistence. |
| `data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt` | `e1c81579d5e0e11f5507516f77524d28d7e3b440` | Physical-edge and route boundaries. |
| `data/knowledge-source/corpus/DOCUMENTS/time_system.txt` | `67835284eb8a4767a13c8dd55fc8e929bbf126e4` | Travel only consumes formal duration/timestamp from time owner. |
| `data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt` | `a3f8492271f7b9aacc41f3619f839caf22213d8f` | One canonical turn workflow and atomic commit gate. |
| `data/knowledge-source/corpus/DOCUMENTS/interface_ux.md` | `c75ea3157ee40278d81fc3700ec64a9f6260168c` | Visible projection contains perception, never hidden actual route. |
| `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md` | `8eb211ab274f0de8346b770374a7cdf007c93ed3` | `world_base` read-only and fact graph only. |
| `data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt` | `2b5560a7d01887a755e64eef5d5963d2c2ab0917` | G0–G4/G5 distinction and first-entry boundary. |
| `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md` | `40304a36a3f830a776b6f71fa1947ee217908160` | Pilot remains blocked while import/runtime visibility are unverified. |
| `infra/world-base/SCHEMA_REFERENCE.md` | `a3aff81d4512863768754bf863c15dc414511b72` | Authoring schema/reference evidence. |

## Decision log

| ID / date / status | Problem and variants | Decision, basis and consequences |
| --- | --- | --- |
| TRAVEL-D001 / 2026-07-15 / accepted | Put lifecycle in turn, persistence or a separate domain package. | `@rus/travel` owns only pure journey transitions; turn orchestrates and repository persists. Basis: code-driven architecture. |
| TRAVEL-D002 / 2026-07-15 / accepted | Represent in-transit state as a node, JSON blob or union. | `node | edge_progress` discriminated union is normalized in `party_positions`; no duplicate canonical location. |
| TRAVEL-D003 / 2026-07-15 / accepted | Keep position in snapshot or normalized table. | `party_positions` is truth; snapshot deliberately omits normalized travel targets. |
| TRAVEL-D004 / 2026-07-15 / accepted | Store only a route label or a journey with legs. | Journey and canonical legs are separate normalized records with version binding. |
| TRAVEL-D005 / 2026-07-15 / accepted | Expose actual coordinates or projection. | Actual/perceived positions stay separate; only validated perceived/observed data reaches visibility. |
| TRAVEL-D006 / 2026-07-15 / accepted | Turn camp into a G3/G4, party G5, or keep edge state. | Current scope uses edge-bound `camped` only; no travel-scene instance until an approved separate contract exists. |
| TRAVEL-D007 / 2026-07-15 / accepted | Use boolean transport or concrete instance references. | `@rus/movement-routes` accepts concrete compatible transport references only. |
| TRAVEL-D008 / 2026-07-15 / accepted | Let baseline initialization advance lifecycle. | Environment baseline only creates persistent features; cue/trace lifecycle is explicit. |
| TRAVEL-D009 / 2026-07-15 / accepted | Add a second travel orchestrator or extend the canonical turn graph. | Existing 13-step turn workflow carries travel state blocks and normalized write targets. |
| TRAVEL-D010 / 2026-07-15 / accepted | Commit arrival first and materialize G4 later, or one transaction. | First entry remains an atomic repository boundary; it is not claimed production-ready before approved pilot data. |
| TRAVEL-D011 / 2026-07-15 / accepted | Bind a trace to update id or its causal emission. | Trace identity is derived from party and causal `emission_id`; repeat delivery is idempotent, while a conflicting causal payload blocks. |
| TRAVEL-D012 / 2026-07-15 / accepted | Default cue perception or require an upstream observation. | Emitter supplies all player-facing observation bands; missing perception is a typed input error. |
| TRAVEL-D013 / 2026-07-15 / accepted | Treat absent materialization weights/counts as neutral defaults or a data gap. | Selection consumes only explicit positive weights and explicit bounds from the pinned input. |
| TRAVEL-D014 / 2026-07-15 / accepted | Derive unlisted weather decay or require a policy entry. | Decay profile owns a versioned weather multiplier map; no weather multiplier is implicit. |
| TRAVEL-D015 / 2026-07-15 / accepted | Default a wind effect or require a cue policy entry. | Cue propagation consumes exact `propagation_wind` and an approved policy effect; causal source identity remains immutable. |
| TRAVEL-D016 / 2026-07-15 / accepted | Remove deferred FK from production DDL or model the test-adapter limit explicitly. | PostgreSQL retains deferred FK semantics; only an explicit test capability renders compatible DDL. |
| TRAVEL-D017 / 2026-07-15 / accepted | Keep stale schema-count assertions or bind local and CI gates to the canonical DDL count. | Schema checks and CI gate assert the current 143-table, 13-part entrypoint. |
| TRAVEL-D018 / 2026-07-15 / accepted | Broaden architecture limits or divide the travel implementation while preserving its public API. | Contracts, journey lifecycle and proposals are separate modules behind the existing package export. |
| TRAVEL-D019 / 2026-07-15 / accepted | Preserve legacy landmark rule template lists or require the normalized authoring chain. | Runtime consumes only approved rule → profile → profile entry → template records and explicit scope bindings. |
| TRAVEL-D020 / 2026-07-15 / accepted | Match a cue by source type only or require its approved emitter category and scope. | Cue lifecycle uses the normalized emission rule and does not infer a category or weather applicability. |
| TRAVEL-D021 / 2026-07-15 / accepted | Create traces from source kind alone or require the normalized causal source and scope. | Trace lifecycle accepts only an approved source category and an applicable, pinned creation rule. |

## Phase tracker

| Phase | Status | Evidence / next dependency |
| --- | --- | --- |
| 0 — baseline | completed | Rebased onto current PR7 head `5463af8`; schema guard was reconciled with the combined 138-table DDL. |
| 1 — normative architecture | in progress | PR8 travel boundaries are now synchronized across movement, time, turn, UI, graph/data ownership and navigation docs; full production proof still depends on approved data and integration. |
| 2 — contracts and RED tests | in progress | Travel, movement and environment RED/GREEN evidence is recorded; course candidate-resolution is explicit and fail-closed. Route graph loader and production course resolution remain pending. |
| 3 — environment baseline | in progress | Landmark, cue and trace lifecycles consume normalized profile/category/scope bindings; production bundle and full production integration remain absent. |
| 4 — world-base bundles | partial | Travel profiles and environment authoring records have normalized DDL, strict manifest dependencies and fail-closed readiness. Approved sources/provenance records and runtime bundle remain absent. |
| 5 — approved pilot | blocked | No runtime-visible approved G1; no fictional promotion is allowed. |
| 6 — party persistence | in progress | Migration 003, deferred FK and atomic normal turn writer exist; real PostgreSQL proof is blocked by missing URL. |
| 7 — movement routes | completed for fail-closed domain contract | Explicit profile, transport and partial traversal tests are green. |
| 8 — travel lifecycle | partial | Start, continue, stop, camp, resume, pace, reroute and abandon have pure transitions; course start binds its first leg to an explicit fact-graph candidate and final canonical leg produces an arrival request. Production graph loader remains pending. |
| 9 — new-game / Stage 13 | blocked | Requires approved environment bundle and runtime-visible pilot. |
| 10 — turn integration | in progress | One canonical workflow has start/continue/lifecycle handlers, normalized persistence and final-arrival handoff to its atomic first-entry gate; production state readers and graph/bundle ports remain absent. |
| 11 — time/body/load/transport | partial | Duration/timestamp ownership is enforced; cross-module production integration and concrete scenarios remain pending. |
| 12 — visibility/presentation | partial | Safe projection and panel contract are green; browser E2E is unavailable. |
| 13 — production composition | partial | Explicit `createTravelPorts` binding contract is fail-closed and reaches `ports.travel`; approved readers, repositories and live PostgreSQL evidence remain pending. |
| 14 — integration/E2E | blocked | Needs approved pilot and `PARTY_DATABASE_URL`; PostgreSQL suite is skipped 6/6. |
| critic audit | pending | Prior result remains `CHANGES REQUIRED`; final repeat audit requires post-pilot full evidence. |

## Expanded contract and migration registry

| Contract | Version | Owner | Producer → consumer | Validator / errors | Persistence | Visible |
| --- | --- | --- | --- | --- | --- |
| `JourneyPlan` / `Journey` / `JourneyLeg` | `travel.v1` | `@rus/travel` | state reader → turn → repository | `TRAVEL_INPUT_INVALID`, version/data-gap errors | `party_journeys`, `party_journey_legs` | no |
| `TravelPosition` | `travel.v1` | `@rus/travel` | journey → repository | `TRAVEL_POSITION_INVALID` | `party_positions` | perceived projection only |
| `TravelChangeSetProposal` | `travel-change-set.v1` | `@rus/travel` | transition → turn writer | state-version and set-congruence checks | atomic normalized writes | no |
| `TravelAdvanceRequest` / `TravelAdvanceResult` | `travel-advance-request.v1` / `travel-advance-result.v1` | `@rus/travel` | state reader → continue handler | journey/leg/version/boundary validation | proposal only | no |
| `TravelInterruption` | `travel-interruption.v1` | `@rus/travel` | causal candidate loader → lifecycle | source-type/source-id validation | journey leg interruption only | no |
| `CourseEdgeCandidate` | `travel-course-candidate.v1` | fact-graph loader / `@rus/travel` | candidate loader → course start | origin/direction/selected-id validation | plan input only | no |
| `TravelArrivalRequest` | `travel-arrival-request.v1` | `@rus/travel` | final leg → turn commit gate | canonical final-leg and position checks | same atomic first-entry transaction | no |
| `TravelRulesBundle` | `travel-rules.v1` | `@rus/travel` | approved loader → domain | `TRAVEL_RULE_BUNDLE_MISSING`, `TRAVEL_DATA_GAP` | digest pin | no |
| `EnvironmentCatalogBundle` | `environment-catalog.v1` | `@rus/environment-landmarks` | approved loader → environment | digest/scope/idempotency checks | environment runtime tables | observations only |
| production travel ports | `travel-ports.v1` | game-server composition | runtime binding factory → turn/new-game services | startup rejects missing methods | external readers + party store | no |
| travel visible projection | `visible-context` nested `travel` | visibility package | turn → presentation/narrator | hidden-field rejection | visible read model | yes |

Migration order is immutable: `001_party_runtime.sql` → `002_environment_landmarks.sql` → `003_travel_runtime.sql`. Migration 003 is forward-only; its foreign key is deferred only to resolve the normalized journey/current-leg cycle inside a single transaction, and any SQL error still rolls back the complete transaction.
