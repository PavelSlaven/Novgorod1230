# Temporal World v4 — рабочий журнал

Дата начала: 2026-07-23
Статус: `p12_evidence_pending_commit`
Ветка: `codex/temporal-world-v4`
Base commit: `520c0ea8cc366fc16c949a874c710f3547a322f6`
Remote: `https://github.com/PavelSlaven/Novgorod1230.git`

## 1. Цель, scope и non-goals

Цель — последовательно реализовать утверждённые план и спецификацию Temporal World v4: точное рациональное игровое время, прерываемые активности, детерминированные границы и same-time cascades, body/access/environment effects, NPC perception/decisions, carriers, remote catch-up/propagation, post-commit presentation lifecycle, persistence/DDL, data readiness и атомарный P28 cutover.

Утверждённые входы:

| Документ | SHA-256 |
|---|---|
| `План_реализации_механики_времени_v4_implementation_ready.md` | `d8464cbb91708379c3a4cf288b1842ee41676199fb8a0acaf51b79bcb0623016` |
| `Механика_течения_времени_v4_implementation_ready.md` | `f97e71536c08a3b5cc0414fe25460bf70b2d95ee94ff861f785b0a3d9fbfb26e` |

Scope:

- target-only Spatial v3 integration до атомарного P28;
- contract `temporal-world-v1` и versioned amendment Spatial v3;
- единственный owner точной арифметики и boundary ordering;
- factual visible package в атомарной транзакции до narration;
- fail-closed data readiness и typed gaps;
- один local branch, один PR и этот README как единственный рабочий журнал.

Non-goals:

- изменения канонического G0–G4 map content;
- импорт repository graph в игровой graph/world_base;
- dual-write, mixed-read, fallback либо временный temporal-only cutover;
- изобретение LLM отсутствующих дат, погоды, маршрутов, последствий или candidate options;
- несвязанный refactor.

## 2. Readiness

Изолированный worktree создан, потому что исходный checkout пользователя содержит несвязанные изменения на другой ветке. Исходный checkout не изменяется.

| Проверка | Фактический результат |
|---|---|
| Repository root | `C:\tmp\Novgorod-temporal-world-v4` |
| Branch | `codex/temporal-world-v4`, tracking `origin/main` |
| `HEAD` | `520c0ea8cc366fc16c949a874c710f3547a322f6` |
| `origin/main` | `520c0ea8cc366fc16c949a874c710f3547a322f6` |
| Worktree до первого edit | clean |
| PowerShell | `7.6.3` |
| Node.js | `v24.16.0` |
| npm | `11.13.0` |
| Python | `3.12.12` |
| uv | `0.8.12`, executable вне PATH: `C:\Users\Slaven\AppData\Roaming\krita\ai_diffusion\server\uv\uv.exe` |
| Graphify | `0.9.17`, pinned version satisfied |
| Docker Desktop | `4.78.0` |
| Docker Engine | client/server `29.5.3` |
| Docker Compose | `v5.1.4` |
| Dependencies | `npm ci`: 88 packages, 0 vulnerabilities |
| Operator/production DB | не используется; connection не настраивался |

Readiness warnings:

- sandboxed `git fetch`, `npm ci`, Graphify и Docker inspection потребовали повторного запуска с разрешённым внешним доступом;
- нормативный knowledge-source имеет `degraded` semantic coverage warning без blocker document IDs; по правилам navigation MVP это warning, а не замена полному чтению нормативов;
- `uv` отсутствует в PATH, но установленный executable доступен;
- обязательные документы `base_turn_orchestration.txt`, `formulas.md` и `movement_locations_regions.txt` содержат буквальные фрагменты вида `… tokens truncated…`; это зафиксировано как повреждение canonical content и должно быть закрыто нормативной консолидацией, а не восстановлением по памяти.

## 3. Repository Intelligence

### 3.1. Информационная потребность

Найти существующих owners, public contracts, persistence paths, callers и tests для exact rational game time, temporal boundary ordering, interruptible activities, carriers, NPC perception, persistence, clocks, same-time cascades и presentation lifecycle.

Graph vocabulary expansion:

```text
[exact, rational, temporal, boundary, activity, carrier, npc,
 perception, persistence, clock, interruption, event]
```

### 3.2. Выполненные запросы

| Канал | Query | Результат |
|---|---|---|
| Unified Repository Intelligence | `exact rational game time temporal boundary activity interruption carrier NPC perception persistence` | Graph готов для exact HEAD; найдены contracts, movement, turn, party-store, committer, timeline, visibility/composition и P18/P23 tests |
| Knowledge RAG | `exact rational game time temporal boundary activity interruption` (`active,proposed`) | Найдены time/turn/materialization/spatial нормативы; status degraded warning сохранён |
| Knowledge RAG | `NPC perception bounded decision same-time cascade` (`active,proposed`) | Найдены NPC/knowledge/bounded-decision нормативы; status degraded warning сохранён |
| Knowledge RAG | `carrier shared clock lazy catch-up propagation` (`active,proposed`) | Найдены movement/turn/time/materialization нормативы |
| Unified Repository Intelligence | `Temporal World v4 MODULE documentation ownership public interfaces pipeline registry contracts generated docs` | Graph готов; найдены текущие MODULE contracts, docs generator, P08 registry/checker, architecture rules и target owner call sites; RAG сохранил только известный baseline degraded warning |
| Unified Repository Intelligence | `temporal_world_and_interruptible_activities` | `partial:false`; knowledge lane нашёл Temporal amendment, Graphify lane корректно вернул отсутствие literal-узла |
| Unified Repository Intelligence | `GameTimestamp TemporalBoundary ActivityExecution` | `partial:false`; оба канала готовы, найдены exact-time contracts, boundary/runtime implementations и tests |
| Unified Repository Intelligence | `turn temporal advance party-store visible package narration` | `partial:false`; оба канала готовы, найдены turn/persistence/presentation owners и call sites |
| Graphify | expanded vocabulary query выше | 444 scoped nodes; ownership и call-site candidates получены только как навигация |
| Graphify reflections | `graphify reflect --if-stale` | 0 memories; `graphify-out/reflections/LESSONS.md` прочитан, содержательных lessons нет |
| Graphify path/explain | `validateSpatialV3Contract`, `createSpatialV3ExecutionEngine`, `createSpatialV3TargetShadowComposition`, `createSpatialV3TurnOrchestrator`, `createSpatialV3CombinedAtomicCommitter`, `p21-orchestration.test.js` | exact extracted nodes/edges подтверждены; production composition вызывает turn orchestrator, P19/P16 являются обязательными injected ports, P21 связывает весь runtime path |

`INFERRED` relations не используются как нормативное доказательство. Сохранённые
`graphify path/explain` evidence основаны только на `EXTRACTED` imports/calls;
dependency injection дополнительно подтверждён прямым чтением точных call sites.

## 4. Полностью прочитанные документы

- `AGENTS.md`;
- `.github/AGENTS.md`;
- оба утверждённых входных документа, указанных в разделе 1;
- `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`;
- `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`;
- `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md`;
- `data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md`;
- `data/knowledge-source/corpus/DOCUMENTS/time_system.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/formulas.md`;
- `data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/historical_events_and_figures.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md`;
- `data/knowledge-source/corpus/DOCUMENTS/llm_agent_prompt_templates.md`;
- `data/knowledge-source/corpus/DOCUMENTS/interface_ux.md`;
- `data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md`;
- `data/knowledge-source/corpus/DOCUMENTS/universal_category_classification_policy.md`;
- `data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt`;
- `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- project Graphify skill и `references/query.md`;
- TDD skill, `references/tests.md` и `references/mocking.md`.
- ADR-002–ADR-006 после owner inventory.

## 5. Текущая implementation/contract/DDL inventory

Инвентаризация завершена до runtime edits. Подтверждённые owners:

| Domain | Current owner | Required action |
|---|---|---|
| Rational clock/calendar/boundaries | `@rus/time-events-history` | расширить как sole arithmetic/order owner; удалить локальные дубли |
| Temporal DTO/errors | `@rus/contracts/spatial-v3` | versioned amendment, `temporal-world-v1`, decimal-string DTO |
| Activities/carrier slices | `packages/turn/src/spatial-v3-execution.js` | расширить existing owner, не создавать параллельный engine |
| Traversal | `@rus/movement-routes` + spatial execution | перейти на sole exact-time API |
| Body effects | `@rus/body-state` | domain effects after exact clock/boundary decisions |
| Perception/knowledge | `@rus/visibility-knowledge-memory` | code-owned projection and knowledge delta |
| Turn/write plan | `@rus/turn` | factual visible package в transaction, narrator post-commit |
| Persistence | `@rus/party-store` + target PostgreSQL committer | exact temporal state, attempts/results, idempotency, lock order |
| Narration | `@rus/narration` | только post-commit prose from persisted visible package |
| NPC schedule/perception | новый minimal pure `@rus/npc-runtime` | proposal-only; profiles в `world_base`, persistence через turn/committer |
| Place/access | `@rus/turn` + `@rus/party-store/spatial-v3-domain-integration` | расширить existing owners; второй engine запрещён |
| Weather/light | новый minimal pure `@rus/environment-state` | exact clock приходит готовым; package владеет только domain effects |
| Remote catch-up/propagation | новый minimal pure `@rus/world-processes` | bounded proposal batch; no hidden persistence/clock |

Caller/contract inventory:

- public exact-time owner: `packages/time-events-history/src/index.js`;
- target execution owner: `packages/turn/src/spatial-v3-execution.js`;
- target validation: `packages/turn/src/spatial-v3-execution-validation.js`;
- movement currently duplicates rational helpers in `packages/movement-routes/src/spatial-v3.js` and its validation; WP3 removes those duplicates;
- active v2 caller of rounded clock helpers: `packages/turn/src/stages/time-update.js`; it will use the explicit `@rus/time-events-history/legacy` subpath;
- target contract registry: `packages/contracts/src/spatial-v3/index.js`, generated specifications and contract matrix;
- sole PostgreSQL writer: `apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js`.

Logical-to-physical target DDL:

- `schemas/party-db/002_party_runtime_v3.sql`: target G5/G6/scene topology,
  placements and lifecycle foundation;
- `schemas/party-db/003_party_runtime_v3_planning.sql`: preparation, plans,
  executions, activities/attempts, interval results and recovery;
- `schemas/party-db/004_party_runtime_v3_journeys.sql`: atomic change/write
  envelopes, idempotency, journeys, cohorts, carrier clocks and synchronized
  slices;
- `schemas/party-db/005_party_runtime_v3_domain.sql`: dynamic domain ownership,
  NPC schedules, attached transport G6 and projection-related state;
- `schemas/party-db/006_party_runtime_v3_migration.sql`: append-only migration
  coverage evidence;
- temporal integral columns require `NUMERIC`; gameplay `TIMESTAMPTZ` is forbidden.

Confirmed lock order: clock → owner → execution → G4 → physical state →
change/idempotency. P19/P21/P22/P23/P25/P28 checks are the existing integration
seams and will be extended rather than duplicated.

## 6. Conflict register C01–C18

| ID | Конфликт | Proposed resolution | Status/evidence |
|---|---|---|---|
| C01 | Draft активирует v3 сразу; `main` держит v2 до P28 | Norm `active` после acceptance; production v2 до P28, v3 sole после P28 | normative boundary frozen; active status не является production activation |
| C02 | Draft удаляет ожидание cutover | Сохранить и расширить P28; без temporal-only cutover | P28 checker/tests green; gate сохранён и fail-closed на data/evidence |
| C03 | Activity vocabulary расходится со Spatial v3 | `active`, `paused`, `completed`, `failed`, `aborted`; planned/invalidation отдельно | contracts/runtime/persistence tests green |
| C04 | Integer `planned_total_minutes` не покрывает exact/condition activities | Versioned amendment contracts/DDL/fixtures до cutover | exact snapshot/cursor contract и DDL 007 реализованы; PostgreSQL green |
| C05 | Narration сейчас предшествует commit | Persist factual visible package; narration только после commit | durable post-commit lifecycle green; repeat critic accepted |
| C06 | `TIMESTAMPTZ` используется для gameplay scheduling | Exact `GameTimestamp`; TIMESTAMPTZ только technical metadata/leases | gameplay fields переведены на exact `NUMERIC`; DDL/PostgreSQL checks green |
| C07 | Rational math дублируется в movement | Sole owner `@rus/time-events-history`; удалить local helper | movement делегирует exact owner; focused/property tests green |
| C08 | Formula ownership time vs body/NPC/weather | Clock/boundary math у time owner; effects у domain owners | ADR и pure domain-owner suites green |
| C09 | Historical doc разрешает LLM approximate dates | Удалить runtime date invention; source-backed authoring only | active prose corrected |
| C10 | Projector назван LLM-agent | Security projection code-owned; narrator — единственный prose LLM | active retrieval corrected |
| C11 | NPC/weather runtime owner не подтверждён | Inventory → ADR → existing owner либо minimal new owner | resolved by ADR-003/005 |
| C12 | Drive schema copy расходится с GitHub | GitHub `main` — sole canon; Drive read-only comparison only | resolved by base pin |
| C13 | Proposed norm не виден active-only RAG | До promotion `active,proposed`; после — active-only acceptance | resolved: active-only retrieval test green and combined query returns the active norm |
| C14 | Active docs содержат архивную противоречивую/повреждённую прозу | Archive/exclude obsolete content, не восстанавливать по памяти | retrieval exclusions + scanner 0 |
| C15 | Target `BIGINT` может переполниться | Capacity proof или temporal components на integral `NUMERIC` | integral `NUMERIC` DDL, contract and PostgreSQL round-trip green |
| C16 | P19 activity execution слишком узок | Расширить тот же owner/contract; no parallel engine | existing P19 owner расширен; activity/traversal/carrier suites green |
| C17 | Post-merge proposed→active ломает exact-head evidence | Promote `active` внутри PR после implementation+critic, до final P28 | resolved: active promotion, canonical writers, RAG and post-promotion Graphify refresh complete before P28 |
| C18 | Place/access и remote/propagation owners не определены | Inventory + ADR; ownership не отдаётся turn/time по умолчанию | resolved by ADR-004/006 |

Конфликт считается закрытым только ссылками на diff и tests/checks.

## 7. Owner decisions / ADR

Owner decisions зафиксированы:

- ADR-002: `temporal-world-v1`, Spatial `4.3.0-target.1`, decimal-string DTO,
  BigInt arithmetic, integral PostgreSQL `NUMERIC`, `(from,to]`, one clock owner,
  same-time cascade и post-commit narration;
- ADR-003: minimal pure `@rus/npc-runtime`;
- ADR-004: place/access остаются у `@rus/turn` и `@rus/party-store`;
- ADR-005: minimal pure `@rus/environment-state`;
- ADR-006: minimal pure `@rus/world-processes`.

Все новые packages proposal-only до P28, не читают DB/network/LLM/global state и
не владеют persistence. Profiles/effects/persistence DTO owners указаны в ADR.

## 8. Target contract и data readiness

Target temporal contract: `temporal-world-v1`.
Spatial contract: `4.3.0-target.1`.

Каноническая машиночитаемая матрица:
`docs/work/temporal-world-v4/data-readiness.v1.json`.

| Dataset/profile family | Existing? | Approved? | Owner | Import path | Tests | Blocker |
|---|---|---|---|---|---|---|
| calendar/daylight/light profiles | absent | no | time-events-history + environment-state + world_base authoring | — | calendar; environment-state | `time_calendar_profile_gap` |
| activity categories and profiles | absent | no | turn + world_base authoring | — | temporal-activity-engine | `activity_profile_gap` |
| progress/resource/participant/continuation/interruption/completion/same-time policies | absent | no | turn + world_base authoring | — | temporal-activity-engine; temporal-advance | `activity_policy_gap` |
| body time-effect profiles and thresholds | absent | no | body-state + world_base authoring | — | body-state domain | `event_effect_gap` |
| NPC schedules, activities, perception and decision policies | absent | no | npc-runtime + world_base authoring | — | npc-runtime | `npc_schedule_gap`; `npc_decision_policy_gap`; `perception_policy_gap` |
| exact timer/event/trigger/effect profiles | absent | no | time-events-history + turn + world_base authoring | — | temporal-boundaries; temporal-advance | `event_rule_gap`; `event_effect_gap` |
| place access schedules | absent | no | turn + party-store + world_base authoring | — | temporal-advance; P19 | `spatial_candidate_gap` |
| weather transition profiles/processes | absent | no | environment-state + world_base authoring | — | environment-state | `weather_profile_gap` |
| historical phase/local-effect rules | absent | no | time-events-history + world_base authoring | — | historical-phases | `historical_phase_rule_gap` |
| traversal recheck contracts | partial Spatial v3 rows only | no | movement-routes + turn + world_base authoring | P12 importer, unauthorized target materialization | P18; temporal-advance | `spatial_candidate_gap` |
| propagation profiles | absent | no | world-processes + world_base authoring | — | world-processes | `propagation_rule_gap` |
| remote catch-up rules | absent | no | world-processes + world_base authoring | — | world-processes | `remote_catch_up_rule_gap` |
| carrier synchronization and rescue/recovery policies | absent | no | turn + party-store + world_base authoring | — | temporal-carriers; P19 | `spatial_candidate_gap` |

Два независимых read-only аудита подтвердили: runtime contracts, DDL capability,
controlled vocabularies, legacy rows и test fixtures не являются approved
source-backed records. Поэтому выбран разрешённый планом вариант 2 для каждого
семейства: полная активация заблокирована. Shape validator требует ровно
13 семейств и сам никогда не объявляет activation ready. Отдельный activation
verifier читает только fixed Temporal authoring paths и SHA-256-проверяет family
approval manifest, approved records, version/applicability, provenance,
normalized refs, source history и source bytes, exact deterministic importer и
generated schema reference. P28 преобразует каждый неразрешённый typed gap в
`temporal_required_data_gap`; scope не сокращается и fallback не создаётся.

## 9. Work-package status

| WP | Deliverable | Status |
|---:|---|---|
| 0 | evidence baseline, inventories, conflicts, DoD | complete |
| 1 | normative consolidation | complete |
| 2 | target contracts + red tests | complete |
| 3 | exact arithmetic, clock, calendar | complete |
| 4 | interruptible activity model | complete |
| 5 | boundary and cascade engine | complete |
| 6 | body/access/light/weather/history | complete |
| 7 | NPC runtime/perception/bounded decisions | complete |
| 8 | carriers | complete |
| 9 | remote catch-up/propagation | complete |
| 10 | turn/presentation lifecycle | complete; repeat critic PASS |
| 11 | DDL/migration/committer | complete; focused PostgreSQL acceptance and repeat critic PASS |
| 12 | data readiness | complete; 13-family matrix valid, full activation fail-closed blocked |
| 13 | module/docs/registry integration | complete; generated no-diff and independent critic PASS WITH NOTES |
| 14 | RAG/Graphify, critic, P28, final acceptance | implementation/RAG/Graphify/promotion complete; P28 blocked on approved data and exact-head release evidence |

## 10. Definition of Done

- все обязательные нормы и owner ADR согласованы;
- точная rational arithmetic не округляется и сериализуется decimal strings;
- deterministic boundary ordering, dedupe, cycle/resource guards и replay доказаны tests;
- activities, condition completion, interruption/resume/abort и shared carrier clock работают через один engine;
- body/access/light/weather/history, NPC perception/decisions и remote catch-up используют formal inputs/outputs и fail closed;
- visible factual package коммитится атомарно с state; narrator вызывается только после commit;
- retry/idempotency/concurrent operations не создают duplicate effects;
- DDL, migrations, generated schema, fixtures, data readiness и clean PostgreSQL acceptance согласованы;
- production остаётся v2 до одного exact-head P28, затем v3 становится sole read/write path;
- все profile/domain/integration/documentation/RAG/Graphify checks фактически выполнены и записаны;
- независимый critic вернул `PASS` либо допустимый `PASS WITH NOTES`;
- одна ветка, один PR, rollback order документирован, временных обходов нет.

## 11. Изменённые файлы

| File | Change |
|---|---|
| `docs/work/temporal-world-v4/README.md` | создан baseline/evidence journal |
| `docs/adr/ADR-002` … `ADR-006` | frozen temporal/domain owner decisions |
| `data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md` | active target norm after completed implementation acceptance; production remains v2 until P28 |
| active/target corpus documents listed in WP1 | migration boundary, ownership and post-commit lifecycle consolidated |
| `knowledge-chunks.js` + test | balanced retrieval exclusion for archived/corrupted prose |
| corpus manifest, aliases and retrieval policy | 36th document registered and digest-bound |
| temporal docs/freeze tools and P28 scope draft | executable conflict/freeze evidence |
| `docs/work/temporal-world-v4/data-readiness.v1.json` | exact 13-family readiness matrix with evidence and typed blockers |
| `tools/spatial-v3/temporal-data-readiness.mjs` | structural/approval evidence validator and activation gate |
| `tools/spatial-v3/p28-activation-gate.mjs` | imports Temporal readiness and fails closed before release evidence |
| `test/spatial-v3/temporal-data-readiness.test.js` | exact coverage, invalid evidence and P28 blocker tests |
| `docs/migration/spatial-v3/p08-public-interface-registry.json` | target Temporal public API inventory |
| `tools/spatial-v3/check-p08.mjs` | validates exact Temporal registry metadata, entries, package exports and symbols |
| `packages/turn/package.json` | exports the existing Temporal carrier proposal owner |
| `docs/work/temporal-world-v4/p28-evidence-scope-draft.md` | binds owner, pipeline, registry and generated-doc evidence for the future exact-HEAD candidate |
| Temporal owner `MODULE.md`, architecture rules, ownership map and pipelines | explicit owners, non-owners, dependencies, tests and post-commit lifecycle |
| `packages/contracts/src/spatial-v3/player-safe-visible-payload.js` | internal player-safe validator extracted without changing registry exports |
| `packages/time-events-history/src/exact-time.js` | exact arithmetic owner extracted behind the existing public re-export |
| `packages/npc-runtime/src/{runtime-configuration,schedule,perception}.js` | internal NPC responsibilities split behind the unchanged public API |
| `packages/turn/src/spatial-v3-execution-*.js` | execution façade split into shared support, validation, traversal and activity owners |
| `packages/turn/src/spatial-v3-orchestration-*.js` | orchestration façade split into registry, core, lifecycle and presentation owners |
| `packages/turn/src/temporal-carriers-*.js` | carrier façade split into state, attachment, slice and common support owners |
| `packages/turn/src/temporal-advance-support.js` | common boundary/advance support extracted behind the unchanged public engine |

## 12. Фактические команды и проверки

| Stage | Command | Exit | Result / errors |
|---|---|---:|---|
| readiness | `git fetch --prune origin` | nonzero | sandbox denied write to worktree git metadata |
| readiness | `git fetch --prune origin` (approved external run) | 0 | origin fetched/pruned |
| readiness | `git status --short --branch` | 0 | clean `codex/temporal-world-v4...origin/main` before README |
| readiness | `git branch --show-current` | 0 | `codex/temporal-world-v4` |
| readiness | `git rev-parse HEAD` | 0 | exact base SHA |
| readiness | `git rev-parse origin/main` | 0 | matches HEAD |
| readiness | `git remote -v` | 0 | canonical GitHub remote |
| readiness | version commands from AGENTS | 0 | versions recorded in section 2 |
| dependencies | `npm ci` | nonzero | sandbox EPERM |
| dependencies | `npm ci` (approved external run) | 0 | 88 packages, 0 vulnerabilities |
| repo intel | `npm run repo-intel:ensure` | nonzero | sandbox canonicalize failure |
| repo intel | `npm run repo-intel:ensure` (approved external run) | 0 | graph rebuilt for exact HEAD |
| repo intel | `npm run repo-intel:status` | nonzero | sandbox canonicalize failure |
| repo intel | `npm run repo-intel:status` (approved external run) | 0 | `ok: true`; graph ready; RAG degraded warning |
| RAG | `npm run knowledge:status` | 0 | degraded semantic coverage; no blocker document IDs |
| RAG | three required `knowledge:query` commands | 0 | navigation evidence obtained; warnings retained |
| Graphify | `graphify query ...` (approved external run) | 0 | 444 scoped nodes |
| Graphify | `graphify reflect --if-stale` | 0 | 0 memories |
| Graphify | `graphify path createSpatialV3ExecutionEngine committer` / `graphify explain advanceExactClock` | 0 | P19→P21 committer path and exact-time owner confirmed |
| docs | complete chunked reads listed in section 4 | 0 | all mandatory/profile documents read to EOF |
| dependencies | `npm audit` as part of `npm ci` output | 0 | 0 vulnerabilities |
| WP1 TDD red | `node --test tools/docs-tools/test/knowledge-chunks.test.js` | 1 | 0/2; exclusion support absent as expected |
| WP1 TDD green | same command after implementation | 0 | 2/2 |
| WP1 docs | `npm run temporal-v4:check-docs` (first run) | 1 | 3 findings: two checker phrase mismatches and one retrieval-visible corrupted classification fragment |
| WP1 docs | same command after root-cause fixes | 0 | conflict_count 0; 36 docs / 1364 chunks |
| WP1 corpus | `npm run knowledge:check-corpus` | 0 | 36 documents; 19 with legacy provenance |
| WP1 freeze | `npm run temporal-v4:freeze` | 1 | sandbox EPERM on generated-file write |
| WP1 freeze | same command with approved external write | 0 | generated freeze SHA-256 `305bf0a054fa5890112bc145dbdccca3b53b2d401cbb93aa703f0e30b9534bf3` |
| WP1 freeze | `npm run temporal-v4:freeze-check` | 0 | byte-reproducible |
| WP2 red | `node --test packages/contracts/test/temporal-world-v1.test.js packages/time-events-history/test/exact-time.test.js packages/time-events-history/test/temporal-boundaries.test.js` | 1 | 0/6: expected missing 4.3 registry/DTO validation, exact-time exports and boundary module; fixtures loaded far enough to prove functionality gaps |
| WP2 vocab generation | `npm run temporal-v4:vocabularies` | 1 | sandbox EPERM on generated-file write |
| WP2 vocab generation | same command with approved external write | 0 | generated immutable v2 registry: 21 vocabularies / 469 values |
| WP2 vocab reproducibility | `npm run temporal-v4:vocabularies-check` | 0 | byte-reproducible v2 artifact |
| WP2 corpus pin | `npm run knowledge:check-corpus` | 0 | temporal amendment manifest entry valid; 36 documents |
| WP2 repo intel | `npm run knowledge:status` / `knowledge:query ...` before policy refresh | 1 | `RETRIEVAL_POLICY_STALE`, caused by the intentional temporal norm digest update |
| WP2 repo intel | same status/query after policy refresh | 1 | `GENERATED_INDEX_STALE`, requiring the normal generated RAG rebuild |
| WP2 RAG generation | `npm run knowledge:generate` | 1 | sandbox EPERM on generated artifact write |
| WP2 RAG generation | same command with approved external write | 0 | graph, inventory and RAG artifacts rebuilt for the current manifest |
| WP2 repo intel | `npm run knowledge:status` / exact-time `knowledge:query` | 1 | pre-existing `SEMANTIC_COVERAGE_GAP` for `character-parameters`; retained as the documented degraded baseline warning |
| WP2 Graphify | `graphify update .` | 1 | sandbox script canonicalization failure |
| WP2 Graphify | same command with approved external run | 0 | 25,130 nodes / 49,717 edges / 1,489 communities |
| WP2 Graphify | `graphify query "Temporal World v4 exact rational time contract legacy compatibility P19 movement"` | 0 | scoped contract/runtime/P19 graph obtained |
| WP2 vocab metadata | `npm run temporal-v4:vocabularies` (approved external write) | 0 | corrected resolution-class canonical ordering and regenerated 21/469 |
| WP2 vocab reproducibility | `npm run temporal-v4:vocabularies-check` | 0 | corrected v2 registry byte-reproducible |
| WP2 vocab compatibility | `node --input-type=module -e "...validateControlledVocabularyRegistry(v1/v2)..."` | 0 | immutable v1 and current v2 both validate; runtime snapshot selects v2/21 |
| WP2 contract generation | `node tools/spatial-v3/generate-contract-specifications.mjs`; typed-error generator; matrix generator (bounded executor) | 0 | historical snapshots 160/58 and current artifacts/matrix 188/82 generated |
| WP2 contract reproducibility | the same three generators with `--check` (bounded executor) | 0 | all artifacts byte-reproducible |
| WP2 generator hygiene | `git diff --check -- <generator/artifact scope>` (bounded executor) | 0 | no whitespace errors |
| WP2 checker implementation | contract/vocabulary/registry test command (bounded checker) | 0 | historical/current separation and v1/v2 registry checks green |
| WP2 checker implementation | `check-p01`, `check-p06`, `check-p07`, `check-p07-non-vocabulary` (bounded checker) | 0 | 160/58 baseline and 188/82 current gates green |
| WP2 checker hygiene | `git diff --check` (bounded checker) | 0 | no whitespace errors at checker handoff |
| WP2 registry | `node --test packages/contracts/test/temporal-world-v1.test.js` | 0 | 4/4 exact DTO, activity and hidden-safe envelope tests green |
| WP2 provenance/retryability regeneration | three contract/error/matrix generators | 1 | sandbox EPERM on generated-file writes |
| WP2 provenance/retryability regeneration | same three generators with approved external write | 0 | baseline source version fixed, amendment provenance and exact retryability materialized |
| WP2 contract reproducibility/current tests | three generator `--check` commands plus four focused test files | 0 | 15/15; 188 contracts, 82 errors, 21 vocabularies, immutable historical snapshots |
| WP2 contract gates | `check-p01`; `check-p06`; `check-p07`; `check-p07-non-vocabulary` | 0 | all current/historical contract gates green |
| WP3 exact/boundary first green | `node --test` exact-time, temporal-boundaries and legacy domain tests | 0 | 10/10; exact BigInt DTO and initial boundary behavior green |
| WP3 exact property red | `node --test packages/time-events-history/test/exact-time.test.js` | 1 | 5/6; normalization accepted additional DTO properties, exposing digest ambiguity |
| WP3 exact property green | same exact-time test after closed-shape fix | 0 | 6/6 including 250 deterministic slicing/round-trip cases and JSON safety |
| WP3 boundary guards | `node --test packages/time-events-history/test/temporal-boundaries.test.js` | 0 | 6/6; window/order, dedupe, mutation, cycles and resource exhaustion green |
| WP3 movement exact migration | `node --test test/spatial-v3/p18-movement-planning.test.js` | 0 | 22/22; local Number rational helper removed |
| WP3 movement gate | `node tools/spatial-v3/check-p18.mjs` | 0 | movement planner gate green |
| WP3 P19 bounded executor | `node --test test/spatial-v3/p19-execution.test.js`; `check-p19`; `git diff --check` | 0 | 8/8; decimal-string GameTimestamp/rationals and shared-clock zero crossing green |
| WP3 accidental broad run | `npm test -- test/spatial-v3/p19-execution.test.js` (bounded executor; npm ignored filter) | 1 | full suite ran unintentionally; 7 failures were corpus `DOCUMENT_HASH_MISMATCH` after the in-progress temporal norm edit, not P19 behavior |
| WP3 P19 review | focused P19 test plus `check-p19` after canonical-input tightening | 0 | 8/8; noncanonical rationals/timestamps rejected |
| WP3 canonical digest | focused exact-time test after temporal digest API | 0 | 6/6; order-independent digest and BigInt rejection green |
| WP3 calendar projection | `node --test packages/time-events-history/test/calendar.test.js packages/time-events-history/test/exact-time.test.js` | 0 | 11/11; explicit approved profile, local day start, leap cycles and huge exact timestamps green |
| WP2 calendar-ref regression | contract generators/checks plus `node --test packages/contracts/test/temporal-world-v1.test.js` | 1 | generators remained reproducible; 3/4 tests passed and `runtime_calendar_snapshot` exposed missing `calendar_profile` in `controlled_entity_kind` |
| WP2 temporal entity-kind analysis | read-only contract/norm/vocabulary inventory | 0 | narrowed approved entity kinds and party-runtime write targets; rejected `combined_write_plan` as an immutable commit input rather than a write target |
| WP2 temporal vocab regeneration | `npm run temporal-v4:vocabularies` | 1 | sandbox EPERM on generated artifact write |
| WP2 temporal vocab regeneration | `npm run temporal-v4:vocabularies` (approved external write) | 0 | regenerated current v2 as 21 vocabularies / 498 values; immutable v1 remains 13/426 |
| WP2 temporal vocab reproducibility | `npm run temporal-v4:vocabularies -- --check` | 0 | current v2 byte-reproducible |
| WP2 temporal vocab/contract tests | `node --test packages/contracts/test/temporal-world-v1.test.js test/spatial-v3/p07-controlled-vocabulary-integration.test.js` | 0 | 5/5; calendar profile ref and exact inherited-registry amendments green |
| WP2 temporal vocab gates | `node tools/spatial-v3/check-p07.mjs`; `node tools/spatial-v3/check-p07-non-vocabulary.mjs` | 0 | current 188/82/21 and immutable 160/58 historical gates green |
| WP4 bounded executor | `node --test packages/turn/test/temporal-activity-engine.test.js`; focused P19 test; `git diff --check` | 0 | executor reported 5/5 activity scenarios and 8/8 P19; parent contract review remains in progress |
| WP5 bounded executor | `node --test packages/turn/test/temporal-advance.test.js`; `node --test packages/time-events-history/test/temporal-boundaries.test.js`; `git diff --check` | 0 | executor reported 7/7 advance and 6/6 boundary tests; parent contract review remains in progress |
| WP4/WP5 review readiness | `npm run knowledge:status` | 1 | expected `DOCUMENT_HASH_MISMATCH` while the temporal norm amendment was being updated; review correctly stopped until regeneration |
| WP2 docs stabilization | `npm run temporal-v4:check-docs` | 1 | correctly detected the in-progress temporal manifest hash/size mismatch |
| WP2 knowledge inventory | `npm run knowledge:inventory` | 0 | legacy inventory remained classified; no unknown legacy source |
| WP2 docs stabilization | `npm run temporal-v4:check-docs`; `npm run knowledge:check-corpus` after manifest/policy update | 0 | zero temporal conflicts; 36 canonical documents / 1400 chunks; 19 legacy-provenance documents |
| WP2 normative freeze | `npm run temporal-v4:freeze` | 1 | sandbox EPERM on generated freeze write |
| WP2 normative freeze | `npm run temporal-v4:freeze` (approved external write) | 0 | freeze regenerated for exact current normative inputs |
| WP2 normative freeze | `npm run temporal-v4:freeze-check` | 0 | byte-reproducible |
| WP2 RAG materialization | `npm run knowledge:generate` | 1 | sandbox EPERM on generated artifact write |
| WP2 RAG materialization | `npm run knowledge:generate` (approved external write) | 0 | graph/inventory/RAG artifacts regenerated |
| WP2 RAG acceptance | `npm run knowledge:check` | 0 | 36 documents; graph and RAG current |
| WP2 RAG status/query | `npm run knowledge:status`; `npm run knowledge:query -- --query "Temporal World v4 controlled entity kind activity boundary exact rational time" --statuses active,proposed` | 1 | only the pre-existing documented `character-parameters` `SEMANTIC_COVERAGE_GAP`; no temporal hash/index staleness |
| WP2 repository graph | `graphify update .` | 1 | sandbox script canonicalization failure |
| WP2 repository graph | `graphify update .` (approved external run) | 0 | rebuilt 25,293 nodes / 50,278 edges / 1,479 communities; SQL-parser optional-dependency warning retained |
| WP2 repository graph | `graphify query "Temporal World v4 activity execution temporal advance boundary proposal merger exact DTO contracts"` (approved external run) | 0 | scoped WP4/WP5 contract/runtime graph obtained |
| WP4 parent review | `npm test --workspace @rus/turn -- temporal-activity-engine.test.js temporal-advance.test.js` | 1 | workspace has no test script; command shape was invalid and no test was counted as passed |
| WP4 parent review | `node --test test/temporal-activity-engine.test.js test/temporal-advance.test.js` from `packages/turn` | 0 | old executor tests 12/12, but contract inspection found in-memory-only idempotency, informal activity DTOs and arbitrary partial elapsed |
| WP4 formal TDD red | `node --test test/temporal-activity-engine.test.js` from `packages/turn` | 1 | rewritten formal suite 0/6; implementation still exposed the informal activity protocol |
| WP4 formal implementation | same focused command after initial implementation | 1 | 0/6; fixture exposed a double-sealed `activity_profile_ref` and an unregistered dependency role |
| WP4 formal implementation | same focused command after fixture/root-contract corrections | 1 | 5/6; participant invalidation incorrectly required a completion-condition boolean for pause/fail |
| WP4 formal green | same focused command after interruption-condition correction | 0 | 6/6; formal start/slice/resume/abort/participant/resource/persisted-replay scenarios green |
| WP4 P19 regression | `node --test test/spatial-v3/p19-execution.test.js`; `node tools/spatial-v3/check-p19.mjs` | 0 | 8/8 and gate green after formal activity engine integration |
| WP3 NUMERIC TDD red | `node --test test/spatial-v3/temporal-numeric-ddl.test.js` | 1 | target temporal columns still used `BIGINT` |
| WP3 NUMERIC focused green | same command after DDL migration | 0 | 1/1 initial exact-NUMERIC structural test; independent review later found coverage gaps |
| WP3 NUMERIC hygiene | `git diff --check -- schemas/party-db/002_party_runtime_v3.sql schemas/party-db/003_party_runtime_v3_planning.sql schemas/party-db/004_party_runtime_v3_journeys.sql test/spatial-v3/temporal-numeric-ddl.test.js` | 0 | no whitespace errors |
| WP3 NUMERIC PostgreSQL attempt | `node --test test/spatial-v3/p13-party-runtime-postgres.test.js` | 1 | Docker-marked skip did not return; test continued into container startup and no exact round-trip evidence was produced |
| WP3 NUMERIC independent audit | `node --test test/spatial-v3/temporal-numeric-ddl.test.js` | 0 | 1/1, but audit returned CHANGES REQUIRED: special NUMERIC values not excluded and exact comparison/column coverage assertions incomplete |
| WP3 NUMERIC audit-fix red | `node --test test/spatial-v3/temporal-numeric-ddl.test.js` | 1 | strengthened test rejected the old `integral_numeric` because it allowed PostgreSQL special values |
| WP3 NUMERIC audit-fix green | same focused command after function/test correction | 0 | 1/1; all temporal/rational NUMERIC columns covered, special values excluded and exact cross-product comparisons asserted positively |
| WP3 NUMERIC audit-fix hygiene | `git diff --check -- schemas/party-db/002_party_runtime_v3.sql test/spatial-v3/temporal-numeric-ddl.test.js` | 0 | no whitespace errors |
| WP3 NUMERIC parent verification | `node --test test/spatial-v3/temporal-numeric-ddl.test.js`; scoped `git diff --check` | 0 | focused structural proof green after independent fix |
| WP3 PostgreSQL major-stage acceptance | `node --test --test-concurrency=1 test/spatial-v3/p13-party-runtime-postgres.test.js test/spatial-v3/p14-party-planning-postgres.test.js test/spatial-v3/p15-party-journeys-postgres.test.js` (approved external Docker run) | 0 | 3/3 on fresh PostgreSQL 16 containers; migrations re-applicable, exact rational constraints green, >BIGINT clock round-trip lossless, NaN/±Infinity/fractional integers rejected |
| WP5 formal TDD red | `node --test test/temporal-advance.test.js` from `packages/turn` | 1 | 0/8; old engine rejected versioned provider refs and hidden camelCase payload escaped merger filtering |
| WP5 first implementation check | `node --test test/temporal-advance.test.js` from `packages/turn` | 1 | 1/8; merger guards green, seven provider cases exposed a test fixture using non-contract `inclusive_limit_timestamp` instead of provider-input `limit_timestamp` |
| WP5 causal regression | `node --test test/temporal-boundaries.test.js` from `packages/time-events-history` | 0 | 6/6 after causal refs moved to registered `temporal_boundary_candidate` |
| WP5 formal green | `node --test test/temporal-advance.test.js` from `packages/turn` | 0 | 8/8; exact slices, current-time cascade, stale dispositions, persisted replay, one clock owner and hidden-safe visible envelope green |
| WP3 exact arithmetic extension TDD red | `node --test packages/time-events-history/test/exact-time.test.js` | 1 | new exact multiply/divide cases failed because the owner package did not yet export the operations |
| WP3 exact arithmetic extension green | same focused exact-time command after implementation | 0 | 6/6; rational multiply/divide use BigInt cross-cancellation and preserve canonical DTOs |
| WP6 body-state bounded implementation | `node --test packages/body-state/test/domain.test.js`; scoped `git diff --check` | 0 | initial target implementation 4/4; independent review subsequently found missing explicit elapsed/profile provenance and interval semantics |
| WP6 body-state audit fix red | `node --test packages/body-state/test/domain.test.js` after strengthened fixtures | 1 | 1/4, then 3/4 while explicit elapsed, approved profile pins and `(from,to]` threshold semantics were introduced |
| WP6 body-state audit fix green | same focused command after fixes | 0 | 4/4; exact elapsed owner, strict approved profiles/policies, provenance, environment and active-condition inputs, validation trace |
| WP6 environment-state bounded implementation | `node --test packages/environment-state/test/environment-state.test.js`; scoped `git diff --check` | 0 | initial implementation 6/6; independent review requested stricter provenance/pins and explicit composition ownership |
| WP6 environment-state strengthened TDD red | `node --test packages/environment-state/test/environment-state.test.js` | 1 | 0/6 after replacing permissive fixtures with sealed approved profiles, contexts, policies and pin sets |
| WP6 environment-state strengthened green | same focused command after rewrite | 0 | 6/6; exact weather/light/access boundaries, strict applicability/provenance, explicit worst-applicable movement composition and typed gaps |
| WP9 initial bounded implementation | `node --test packages/world-processes/test/world-processes.test.js`; scoped `git diff --check` | 0 | 5/5, but independent contract audit found informal public DTOs, incomplete aggregate lifecycle and Number-based durations |
| WP9 formal audit evidence | direct `validateSpatialV3Contract` probes for remote request/result plus package tests | mixed | formal probes exposed 9 request and 7 result violations; package test itself stayed 5/5; audit verdict `CHANGES REQUIRED` |
| WP9 formal rewrite | `node --test packages/world-processes/test/world-processes.test.js`; `git diff --check -- packages/world-processes` | 0 | bounded executor reports 4/4 with formal remote DTO validation, exact BigInt intervals, all eight process kinds, deterministic retry/version and activation handoff; parent audit pending |
| WP9 independent audit | focused test plus formal/lifecycle probes | 0 / findings | tests 4/4, verdict `CHANGES REQUIRED`: future pending activation, overdue active lifecycle and unpinned profile/effect provenance reproduced |
| WP9 audit-fix TDD red | `node --test packages/world-processes/test/world-processes.test.js` | 1 | 4/6; new cases reproduced premature future activation and acceptance of an unpinned effect version |
| WP9 audit-fix green | same focused command after lifecycle/profile fixes | 0 | 6/6; future pending preserved, corrupted overdue lifecycle hard-blocked, approved profile/effect/policies digest- and pin-bound |
| WP9 audit-fix syntax/hygiene | `node --check packages/world-processes/src/index.js`; `git diff --check -- packages/world-processes` | 0 | source parses and scoped diff has no whitespace defects; repeat independent audit pending |
| WP4 independent activity audit | `node --test packages/turn/test/temporal-activity-engine.test.js`; scoped `git diff --check` | 0 | 6/6 implementation tests, but verdict `CHANGES REQUIRED`: public legacy path, unpersisted ordinal continuity and missing formal interruption outcomes |
| WP4 accidental broad audit run | `npm test` | 1 | full suite was invoked by the audit executor unintentionally; seven failures were the known pre-existing `character-parameters` knowledge coverage gap, not activity runtime failures |
| WP4 audit-fix TDD red | `node --test test/temporal-activity-engine.test.js` from `packages/turn`; focused P19 test | 1 | activity 3/8 and P19 7/8: proved missing persisted ordinal cursor, continue/pause/fail DTO handling and still-public legacy API |
| WP4 contract inspection helper | first Node contract extraction command | 1 | used wrong JSON root key (`contracts`); no project state changed |
| WP4 contract inspection helper | corrected Node contract extraction command | 0 | exact execution, attempt and interruption DTO fields/invariants inspected |
| WP4 formal artifact regeneration | `node tools/spatial-v3/generate-contract-specifications.mjs` | 1 | sandbox EPERM while updating generated contract files after adding `next_attempt_ordinal` to the normative execution DTO |
| WP4 formal artifact regeneration | same command with requested external write | blocked | Codex Desktop approval reviewer rejected execution because workspace credits were exhausted; no manual generated-artifact workaround performed |
| WP4 runtime audit fix syntax | `node --check packages/turn/src/spatial-v3-execution.js` | 0 | rewritten formal lifecycle parses successfully |
| WP4 runtime audit-fix checkpoint | focused activity and P19 tests | mixed | P19 8/8 after legacy surface removal; activity 0/8 solely because reproducible contract generation remains blocked and the current generated registry correctly forbids the newly normative cursor field |
| WP7 navigation refresh | `npm run knowledge:query -- --query "Temporal World v4 NPC runtime perception visibility bounded decision schedule exact boundary state persistence" --statuses active,proposed` | 1 | current in-progress ordinal amendment makes the temporal document hash differ from the last generated manifest; earlier successful NPC-specific RAG evidence in section 3 remains the navigation basis |
| WP7 navigation refresh | corresponding `graphify query` | 1 | Windows sandbox canonicalization failure; earlier successful scoped Graphify inventory remains available |
| WP8 navigation refresh | carrier/passenger/synchronized-slice RAG and Graphify queries | 1 | same in-progress document-hash and sandbox canonicalization blockers; earlier successful carrier-specific dual-channel evidence in section 3 remains the navigation basis |
| WP6 environment formal-boundary TDD red | `node --test packages/environment-state/test/environment-state.test.js` | 1 | 0/6 after requiring complete formal boundary candidates, pinned visibility/interruption policies and an explicit maximum-rational composition reducer |
| WP6 environment formal-boundary green | same focused command after provider/handler hardening | 0 | 6/6; weather, light and place-access candidates validate against the registry, forged interruption fields and reducer drift fail closed |
| WP9 optional-path fixture correction | focused world-process test during path-pin hardening | 1 | the first path fixture used non-contract entity kind `route`; corrected to registered `world_route` before counting the actual RED |
| WP9 optional-path TDD red | `node --test packages/world-processes/test/world-processes.test.js` | 1 | 6/7; an otherwise formal remote request could still reference an unpinned optional path |
| WP9 optional-path green | same focused command after explicit request-path pin validation | 0 | 7/7; required profile pins remain a subset while every supplied path is independently entity-pinned |
| WP9 final independent audit | focused 7-case suite plus formal request/result and lifecycle probes | 0 | verdict `PASS`; no remaining contract, exact-time, lifecycle, provenance, visibility or replay defect found |
| WP6/WP9 scoped hygiene | `git diff --check -- packages/environment-state packages/world-processes` | 0 | no whitespace defects in the stabilized environment and remote-process packages |
| WP6 body formal-boundary TDD red | `node --test packages/body-state/test/domain.test.js` | 1 | 1/4; the existing owner rejected the strengthened sealed profile and still lacked a formal threshold candidate |
| WP6 body formal-boundary green | same focused command after profile/provider hardening | 0 | 4/4; exact `(from,to]` threshold output validates as `temporal_boundary_candidate` and is bound to subject, scope, policies, pins and current-state preconditions |
| WP6 body syntax/hygiene | `node --check packages/body-state/src/index.js`; `git diff --check -- packages/body-state` | 0 | source parses and scoped diff has no whitespace defects |
| WP6 history TDD red | `node --test packages/time-events-history/test/historical-phases.test.js` | 1 | module-not-found proved the source-backed historical provider/handler was absent |
| WP6 history first implementation check | same focused command | 1 | 3/5; provider contracts were green, while freezing an object containing the resolver function caused two `DataCloneError` failures |
| WP6 history green | same focused command after freezing only the resolver shell | 0 | 5/5; exact source-backed boundaries, sealed pins/provenance, persisted exactly-once evidence, hidden-safe projection and resource caps green |
| WP6 history syntax/hygiene | `node --check packages/time-events-history/src/historical-phases.js`; `git diff --check -- packages/time-events-history` | 0 | source parses and scoped diff has no whitespace defects |
| WP3/WP6 time-owner package regression | `node --test packages/time-events-history/test/*.test.js` | 0 | 23/23 exact arithmetic, calendar, legacy due selection, boundary cascade and historical phase tests green |
| WP7 inherited NPC baseline | `node --test packages/npc-runtime/test/npc-runtime.test.js` | 0 | 5/5 inherited tests passed, but parent contract review found unbound profile/policy pins, informal runtime state/rechecks, topology reduced to trusted booleans and a non-protocol resolver shape |
| WP7 formal TDD red | same focused command after replacing fixtures with normalized state, physical path, exact replay and four-field selection requirements | 1 | module load failed because deterministic request ordering API was absent; no implementation assertion could pass accidentally |
| WP7 formal implementation checkpoint | same focused command after runtime rewrite | 1 | 7/8; schedule, topology, attention, recognition and decisions were green; replay test correctly exposed that formal perception alone lacks its causal input digest |
| WP7 formal green | same focused command with persisted perception evidence supplied | 0 | 8/8; exact schedule transition/replay, wall/acoustic/darkness/sleeping perception, no memory without perception, bounded selection/recheck/replay and same-time ordering green |
| Temporal workspace dependency sync | `npm install --ignore-scripts --offline` | 1 | sandbox denied creation of new workspace symlinks with Windows `EPERM` |
| Temporal workspace dependency sync | same offline command with approved external filesystem access | 0 | added local links for environment-state, npc-runtime and world-processes; 130 packages audited, zero vulnerabilities |
| WP7 package/syntax/hygiene | `npm ls @rus/npc-runtime @rus/environment-state @rus/world-processes --depth=0`; `node --check packages/npc-runtime/src/index.js`; scoped `git diff --check` | 0 | all three new workspaces resolve locally, NPC source parses and scoped diff is clean |
| WP8 inherited carrier checkpoint | `node --test packages/turn/test/temporal-carriers.test.js` | 1 | 0/6; a partially rewritten adapter and stale fixtures disagreed on formal state/idempotency shape, so no carrier behavior was accepted |
| WP8 formal TDD red | same focused command after replacing fixtures with P19 delegation, location handoff and digest-bound replay requirements | 1 | module load failed because stationary/moving clock-mode selector was absent |
| WP8 first implementation check | same focused command after adapter rewrite | 1 | 1/9; clock selector passed while formal persisted state versions and incoming idempotency records exposed incompatible string fixtures |
| WP8 state-version correction | same focused command after using formal integer state versions | 1 | 5/9; board, graph/capacity, strand and replay passed; synchronized slice and alight contract reconciliation remained |
| WP8 diagnostic full run | same focused command with granular adapter diagnostics | 1 | 5/9; isolated P19 slice extra fields and one string-valued handoff state version |
| WP8 diagnostic narrow run | `node --test --test-name-pattern="moving root|alighting" packages/turn/test/temporal-carriers.test.js` | 1 | 1/3; exact violation fields were `exact_elapsed_numerator`, `exact_elapsed_denominator`, `canonical_digest` on slice plus handoff `state_version` |
| WP8 formal green | full focused carrier command after aligning P19 slice with the normative DTO and correcting handoff version | 0 | 9/9; moving/stationary ownership, local completion/block/hazard, root zero, board/alight, capacity/graph, strand and persisted replay green |
| WP8 P19 regression/gate/hygiene | `node --test test/spatial-v3/p19-execution.test.js`; `node tools/spatial-v3/check-p19.mjs`; carrier syntax and scoped `git diff --check` | 0 | P19 8/8 and gate green; carrier source parses and scoped diff is clean |
| WP4 formal artifact regeneration retry | `node tools/spatial-v3/generate-contract-specifications.mjs` with approved external filesystem access | 0 | regenerated 188 contract specifications after adding the normative persisted activity ordinal cursor |
| WP4 generated contract reproducibility | `node tools/spatial-v3/generate-contract-specifications.mjs --check` | 0 | committed/generated contract specifications exactly match the normative sources |
| WP4 activity path correction | `node --test packages/turn/test/temporal-activity-engine.test.js` from `packages/turn` | 1 | command used a repository-root-relative path from the package directory; Node correctly reported the test file as not found and no test ran |
| WP4 regenerated-contract checkpoint | `node --test test/temporal-activity-engine.test.js` from `packages/turn` | 1 | 7/8; formal runtime and cursor continuity passed, while the precondition-invalidation fixture omitted required `resource_bindings_after` |
| WP4 formal green after fixture completion | `node --test test/temporal-activity-engine.test.js` from `packages/turn` | 0 | 8/8; execution, persisted ordinal continuity, continue/pause/fail interruption outcomes, precondition invalidation and replay all green |
| WP2 temporal manifest inspection helper | Node SHA-256/manifest-record probe | 1 | computed the current source as 87,967 bytes / `a4c6ad7d...`, then the optional record print failed because the probe used `path` instead of manifest key `canonical_path`; no state changed |
| WP2 typed-error regeneration | `node tools/spatial-v3/generate-typed-error-specifications.mjs` with approved external filesystem access | 0 | regenerated 82 merged Spatial v4.2 + Temporal v4 typed errors |
| WP2 typed-error reproducibility | same generator with `--check` | 0 | generated typed-error specifications are current |
| WP2 contract matrix regeneration | `node tools/spatial-v3/generate-contract-matrix.mjs` with approved external filesystem access | 0 | regenerated the 188-contract / 82-error ownership matrix |
| WP2 contract matrix reproducibility | same generator with `--check` | 0 | matrix JSON and Markdown summary are current |
| WP2 temporal normative freeze | `npm run temporal-v4:freeze` with approved external filesystem access | 0 | refreshed source digests after the normative activity cursor amendment |
| WP2 first generated-evidence checks | `npm run temporal-v4:check-docs`; `temporal-v4:freeze-check`; `temporal-v4:vocabularies-check`; `knowledge:check-corpus` | mixed | docs check alone failed because retrieval policy still pointed at the previous manifest; freeze, 21/498 vocabulary artifact and canonical 36-document corpus passed |
| WP2 docs conflict repair | `npm run temporal-v4:check-docs` after rebinding retrieval policy | 0 | zero conflicts; manifest `5fa85469...`, 36 documents, 1,401 chunks, temporal status remains `proposed` |
| WP2 first knowledge materialization | `npm run knowledge:generate` with approved external filesystem access; `npm run knowledge:check` | 0 | graph/RAG artifacts regenerated and verified current |
| WP2 repository graph refresh | `graphify update .` with approved external filesystem access | 0 | AST graph rebuilt to 25,736 nodes / 51,538 edges / 1,513 communities; 33 SQL files remain structurally absent because optional `tree_sitter_sql` is not installed |
| WP2 repo-intel sandbox probe | `npm run repo-intel:ensure` | 1 | Windows sandbox could not canonicalize the Graphify script path; no state changed |
| WP2 repo-intel readiness | escalated `repo-intel:ensure`; escalated `repo-intel:status`; WP10/WP11 combined queries | 0 | graph ready on Graphify 0.9.17 and exact base HEAD; initial RAG read was unavailable because modified `character-parameters` was still marked semantically covered without a matching approved snapshot; both Graphify query channels returned scoped results |
| WP2 semantic-gap metadata repair | second `npm run knowledge:generate` with approved external filesystem access; `npm run knowledge:check`; `npm run knowledge:status` | 0 | artifacts current; changed character document is now truthfully classified `baseline_gap`; RAG status is `degraded` with no merge blockers |
| WP10/WP11 direct RAG navigation | two `npm run knowledge:query` commands with `active,proposed` statuses | 0 | temporal norm ranked first for commit-before-narration, visible-package persistence, exact activity/NPC/process stores and typed gaps; both queries completed with expected baseline semantic coverage warnings only |
| WP10 strict player-visible schema TDD red | `node --test packages/contracts/test/temporal-world-v1.test.js` | 1 | after correcting one stale fixture policy kind, neutral-name hidden data still passed the blacklist and produced the intended security RED |
| WP10 strict player-visible schema green | same focused contract command after exact allowlist validation | 0 | 4/4; exact root/nested shapes and neutral-name hidden-data rejection green |
| WP10 presentation lifecycle TDD red | `node --test packages/turn/test/temporal-presentation-lifecycle.test.js` | 1 | 0/6; old post-narration outcome port lacked durable claim/output/finalize lifecycle |
| WP10 presentation lifecycle checkpoint | same command after initial claim/CAS implementation | 1 | 2/6; fake durable store assertions exposed incorrect test-state settlement |
| WP10 presentation lifecycle green | same focused command after store/test correction | 0 | 6/6; concurrent retry, narration failure, durable output reuse and final CAS green |
| WP10 focused regression batch | presentation lifecycle; `packages/turn/test/temporal-advance.test.js`; P16; P21 | mixed then 0 | presentation 6/6, advance 8/8, P16 6/6; P21 first exposed one stale visible payload fixture (8/9), then passed 9/9 after exact-schema correction |
| WP10 independent audit | focused presentation/P16/P21 checks and read-only code audit | findings | `CHANGES REQUIRED`: blacklist-only projection and missing durable pre-narration claim; both findings were reproduced and fixed in the implementation |
| WP11 structural persistence | `node --test test/spatial-v3/p11-temporal-world-persistence.test.js` | 0 | 2/2 before the later party-isolation hardening |
| WP11 presentation-store initial unit suite | `node --test test/spatial-v3/presentation-store.test.js` | 0 | 4/4; package lock, live claim, output CAS, final audit and rollback green |
| WP11 committer PostgreSQL sandbox probe | `node --test test/spatial-v3/p16-committer-postgres.test.js` | 1 | Docker was unavailable in the sandbox; the legacy skip path continued to its assertion, so no PostgreSQL result was accepted |
| WP11 committer PostgreSQL RED | same command with approved external Docker access | 1 | semantic commit returned `ok:false`, reproducing narration-job-before-visible-package FK ordering defect |
| WP11 party-isolation structural TDD red | P11 structural test plus committer syntax check in one `Promise.allSettled` batch | mixed | P11 1/2 on the new composite-FK/party-reference assertions; committer syntax green |
| WP11 ordering/replay checkpoint | P16 committer PostgreSQL, P11 structural test and source syntax in one `Promise.allSettled` batch | mixed | structural 2/2 and syntax green; PostgreSQL reached the deliberately obsolete missing-parent rollback fixture, which the strengthened sealed-plan validator now rejects before SQL |
| WP11 PostgreSQL and unit phase batch | `npm run temporal-v4:test-postgres`; P11/P16/presentation unit tests; syntax checks in one `Promise.allSettled` batch | mixed | P16 real committer passed; focused units 12/12 and syntax passed; temporal PostgreSQL exposed a PL/pgSQL trigger resolving a field from the wrong trigger-row type |
| WP11 affected PostgreSQL rerun | `node --test test/spatial-v3/temporal-world-postgres.test.js` with approved external Docker access | 0 | 1/1; 001→007 reapply, exact timestamps, activity cursor/history, participant lifecycle, cross-party rejection, concurrent presentation claim/output/delivery all green |
| WP11 expired-lease regression | `node --test test/spatial-v3/presentation-store.test.js` plus syntax in one `Promise.allSettled` batch | 0 | 5/5; PostgreSQL BIGINT string version is normalized before lease-expiry release/reclaim, exact attempt ordinal audited |
| WP10/WP11 final profile acceptance | `npm run temporal-v4:test-postgres`; 5 focused unit/integration files; syntax and `git diff --check` in one `Promise.allSettled` batch | 0 | PostgreSQL 2/2, focused tests 28/28, all source syntax and full diff hygiene green |
| WP10/WP11 repeat critic | read-only independent audit after profile acceptance | findings | `CHANGES REQUIRED`: a failed `persistNarrationOutput` path still exposed the unpersisted narration through screen projection |
| WP10 durable-output screen TDD red | `node --test packages/turn/test/temporal-presentation-lifecycle.test.js` | 1 | 6/7; new scenario proved the pending result and screen contained narration text after durable-output persistence failed |
| WP10 durable-output screen green | presentation lifecycle + P21 tests and scoped syntax/diff in one `Promise.allSettled` batch | 0 | 16/16; failed/invalid output persistence now returns factual-only screen, while a later reclaimed attempt may narrate again |
| WP10/WP11 repeat critic after durable-output fix | read-only independent audit with focused 21-test run and diff hygiene | 0 | verdict `PASS`; no remaining presentation lifecycle, durable-output, committer, replay, isolation or migration finding |
| WP12 repository-intelligence ensure | escalated `npm run repo-intel:ensure` | 0 | Graphify 0.9.17 graph current for exact base HEAD; no rebuild required |
| WP12 repository-intelligence status/query | escalated `npm run repo-intel:status`; escalated `npm run repo-intel:query -- --query "Temporal World v4 data readiness approved datasets calendar daylight activity progress resource body NPC event access weather history traversal propagation remote carrier synchronization rescue P28 blockers"` | 0 | graph ready; RAG intentionally degraded only by recorded baseline gaps; both channels returned scoped readiness evidence |
| WP12 independent data audits | two read-only subagent audits split across families 1–7 and 8–13 | 0 | both audits found no complete approved Temporal v4 family; traversal-recheck has partial Spatial v3 rows only |
| WP12 readiness TDD red | `node --test test/spatial-v3/temporal-data-readiness.test.js` | 1 | module-not-found proved the fixed readiness validator did not yet exist |
| WP12 readiness focused green | same focused command after manifest/validator/P28 integration | 0 | 6/6; exact 13-family coverage, malformed matrices, false approval evidence, complete fixture and P28 conversion green |
| WP12 syntax and hygiene batch | both changed tool `node --check` commands; scoped `git diff --check` | 0 | validator and P28 gate parse; no whitespace defects |
| WP12 activation check | `npm run temporal-v4:check-data-readiness` | 1 expected | manifest structurally valid, `activation_ready:false`; 13 families produce 16 typed blockers |
| WP12 P28 regression batch | `node --test test/spatial-v3/p28-activation.test.js test/spatial-v3/temporal-data-readiness.test.js`; JSON parse/count probe | 0 | 14/14; manifest schema/version/status parse and exact family count is 13 |
| WP12 P28 local-evidence probe | `npm run spatial-v3:p28-local-evidence` with default tool timeout | 124 | process was stopped after 11 seconds before producing an assessment; no result accepted |
| WP12 P28 local-evidence rerun | same command with 60-second tool limit | 1 expected | completed in 12.8 seconds; all 16 Temporal gaps surfaced plus the pre-candidate exact-HEAD evidence blocker; production writes/composition remain zero/false |
| WP12 repository-reference evidence | focused readiness test after adding repository path assertions; scoped WP12 `git diff --check` in one `Promise.allSettled` batch | 0 | 7/7; every normative/evidence/import/test path exists and the complete WP12 diff has no whitespace defects |
| WP12 first independent critic | read-only audit plus targeted 15-test/syntax/diff checks | findings | `CHANGES REQUIRED` P1: non-empty string paths could falsely mark all families approved without resolving or validating approved source-backed bytes |
| WP12 approval-evidence TDD red | `node --test test/spatial-v3/temporal-data-readiness.test.js` | 1 | missing activation-assessment export proved the external approval-byte verifier did not exist |
| WP12 approval-evidence focused green | readiness tests plus both changed-tool syntax checks in one `Promise.allSettled` batch | 0 | 9/9; shape-only activation remains blocked, valid structured bundle verifies, and fixture/legacy/vocabulary/DDL substitutes are rejected |
| WP12 audit-fix acceptance batch | combined P28/readiness tests; readiness gate; P28 local gate; syntax; scoped diff in one `Promise.allSettled` batch | expected mixed | tests 17/17, syntax/diff clean; readiness and local P28 exit 1 only for the 16 recorded Temporal gaps and pre-candidate HEAD evidence, with zero production writes/composition change |
| WP12 repeat independent critic | read-only approval-byte/P28 audit with the same 17 focused tests, both tool syntax checks and diff hygiene | 0 | verdict `PASS`; P1 closed and no remaining readiness or fail-closed finding |
| WP13 repository-intelligence refresh | `npm run repo-intel:status`; `npm run repo-intel:query -- --query "Temporal World v4 MODULE documentation ownership public interfaces pipeline registry contracts generated docs"` in one `Promise.allSettled` batch | 0 | Graphify 0.9.17 graph ready; both navigation channels returned scoped documentation/registry evidence; only the recorded RAG baseline warning remains |
| WP13 P08 registry TDD red | `node tools/spatial-v3/check-p08.mjs` | 1 | checker rejected missing `4.3.0-target.1`/`temporal-world-v1` metadata and all 23 required Temporal public interfaces |
| WP13 P08 registry focused green | `node tools/spatial-v3/check-p08.mjs`; checker syntax; scoped `git diff --check` in one `Promise.allSettled` batch | 0 | all 23 target interfaces resolve to declared package exports and source symbols; syntax and diff hygiene clean |
| WP13 architecture-doc executor | canonical-path JSON parse; scoped `git diff --check`; `node tools/spatial-v3/check-temporal-docs.mjs`; `npm run docs:check` | expected mixed | JSON/diff/Temporal conflict gate green; pre-generation docs check correctly reported stale generated files and missing exact `Назначение` sections in the three new MODULE docs |
| WP13 P08 runtime-export hardening | `node tools/spatial-v3/check-p08.mjs`; syntax; scoped diff in one `Promise.allSettled` batch | 0 | registry now requires the exact 31-entry P08+Temporal set and verifies actual module namespace exports rather than source-text substrings |
| WP13 MODULE parser diagnostic | scoped `rg` against docs tooling/MODULE headings | 1 | useful parser lines returned, then Windows rejected shell globs `packages/*/MODULE.md`; direct exact-path inspection was used and no state changed |
| WP13 source-doc pre-generation batch | `npm run docs:check`; Temporal docs; P08; canonical-path assertion; scoped diff | expected mixed | every source/check gate green; docs check rejected only the five expected stale generated artifacts |
| WP13 first generator batch | `npm run docs:generate`; `npm run spatial-v3:matrix`; `npm run spatial-v3:freeze` in one `Promise.allSettled` batch | 1 | docs/matrix writes hit sandbox EPERM; Spatial freeze rejected stale P02 active-source digest, proving reviewed-baseline drift |
| WP13 docs/matrix generation | docs generator and contract matrix generator with approved external write in one `Promise.allSettled` batch | 0 | documentation/RAG/schema artifacts and 188/82 contract matrix regenerated by canonical writers |
| WP13 Spatial freeze diagnosis | P02/P05 source/checker/declaration reads plus current digest/registry probes | expected mixed | exact eight active/target pin changes identified; first inline registry regex was mangled by PowerShell backtick parsing, corrected probe proved standard registry remains 160/58 while ownership matrix is 188/82 |
| WP13 P02 pre-repair checks | `npm run spatial-v3:check-p02`; `npm run spatial-v3:check-p05` | 1 | both correctly rejected stale reviewed anchors after approved Temporal normative changes |
| WP13 P02 pin acceptance | `npm run spatial-v3:check-p02`; `node --test test/spatial-v3/p02-normative-boundary.test.js`; syntax; scoped diff in one `Promise.allSettled` batch | 0 | checker green and 56/56 adversarial boundary tests preserve v2-only/P28 semantics |
| WP13 P05 baseline checkpoints | repeated `spatial-v3:check-p05` / `spatial-v3:freeze` while rebinding reviewed source and ownership hashes | 1 expected | first pass exposed the intentional 160/58 standard vs 188/82 ownership distinction; next check rejected only the still-stale freeze; sandboxed writer then hit EPERM |
| WP13 Spatial normative freeze write | `npm run spatial-v3:freeze` with approved external write | 0 | canonical P05 writer bound the independently reviewed 24-source baseline and exact P02 declaration |
| WP13 P02/P05 acceptance batch | `spatial-v3:check-p05`; `spatial-v3:freeze-check`; 11-case P05 negative suite; P02 recheck; scoped diff | 0 | 11/11 coordinated-repin/tamper tests green; freeze byte-reproducible; zero open findings |
| WP13 P02/P05 independent critic | read-only critic: P02/P05 checks, 56 P02 tests, 11 P05 tests, P28 tests, freeze/diff checks | 0 | verdict `PASS`; P02 56/56, P05 11/11, P28 8/8; no self-approval or activation finding |
| WP13 first full profile batch | docs check/tests; contract/error/matrix/vocabulary checks; Temporal freeze; architecture; P08; Temporal docs; full diff | expected mixed | docs 9/9 and all registry/generated checks green; Temporal freeze stale after README pin change; architecture gate reported five oversized modules, one exact-time cycle/export excess and missing explicit time-owner import allowances |
| WP13 exact-time architecture split | exact/calendar tests; boundary/history/domain tests; architecture checkpoint; syntax/diff in one `Promise.allSettled` batch | expected mixed | focused tests 23/23; exact implementation moved behind two root re-export statements, cycle removed and explicit owner imports approved; checkpoint now reports only NPC/turn size limits |
| WP13 contract-registry split | contract registry + Temporal contract tests; syntax/diff; architecture checkpoint | 0 / expected remaining | 10/10; player-safe validator moved to an internal helper, public exports unchanged, `registry.js` reduced from 27,025 to 20,404 bytes; only unrelated NPC/turn violations remain |
| WP13 Temporal freeze write | `npm run temporal-v4:freeze` | 1 | sandbox EPERM writing the canonical work freeze |
| WP13 Temporal freeze write | same command with approved external write | 0 | proposed-stage Temporal normative freeze regenerated after root README/normative input changes |
| WP13 carrier architecture split | `node --check` five carrier files; public import probe; `git diff --check`; `npm run architecture:check`; `node --test packages/turn/test/temporal-carriers.test.js` | expected mixed | syntax/import clean and carrier size violation removed; focused test was blocked before execution by the separately corrupted `spatial-v3-execution.js:43` |
| WP13 orchestration architecture split | `node --check` five orchestration files; lifecycle test; P21 test; `git diff --check`; `npm run architecture:check` | expected mixed | lifecycle 7/7 and orchestration size violation removed; P21 import was blocked only by the separately corrupted execution file |
| WP13 NPC architecture split | `node --check` four changed NPC files; `node --test packages/npc-runtime/test/npc-runtime.test.js`; `git diff --check`; `npm run architecture:check` | 0 / expected remaining | NPC 8/8; `index.js` reduced to 923 bytes / 29 lines with unchanged exports; only then-existing execution limits remained |
| WP13 execution recovery diagnostics | batched `git fsck --no-reflogs --unreachable`, dangling commit/blob inspection, Codex JSONL scan, Graphify/source probes and exact hash comparison | expected mixed | no 48 KB commit/blob existed; two initial PowerShell pipelines had `ParserError`, one exhaustive blob scan timed out and one Graphify-context formatter had the same parser error; JSONL `patch_apply_end` records proved the exact base plus 11 successful diffs |
| WP13 execution deterministic recovery | base blob restore and chronological replay of 11 successful JSONL diffs through `apply_patch`; `node --check`; SHA/size probe | 0 after one rejected replay format | direct Git-style hunk numbers were first rejected as textual anchors; stripping only those service headers replayed all diffs and restored 47,981 bytes / 879 lines / SHA-256 `27c1f7e4c81bc70bf89bb246fb951183be3127a743d60e1adee6e5ca5cbb66e2` |
| WP13 execution recovery acceptance | activity + P19 tests; carrier tests; lifecycle + P21 tests; architecture; `git diff --check` in one `Promise.allSettled` batch | expected mixed | 16/16 + 9/9 + 16/16 tests and diff green; architecture correctly reported only execution and NPC size limits |
| WP13 recovery backup verification | multipart `apply_patch` backup plus byte/line/SHA comparisons | expected mixed then 0 | first output was truncated at the tool limit; second used an ambiguous three-line anchor; both invalid backups were deleted. Two-part 30-line-anchored copy exactly matched all 47,981 bytes and SHA |
| WP13 execution internal split | parallel source extraction; `apply_patch` creation of traversal/activity/support modules; `node --check` for each; size/line probe | 0 | activity 22,787 bytes / 493 lines; traversal 16,527 bytes / 230 lines; shared helpers below both hard limits |
| WP13 execution first façade acceptance | syntax/API-shape probe; activity+P19; carriers; lifecycle+P21; architecture; `git diff --check` in one `Promise.allSettled` batch | 3 focused failures | architecture and diff green; activity 8/8 and carriers 9/9 green; three P19 cases and one dependent P21 case exposed one root cause: missing `compareRationalMinutes` traversal import |
| WP13 execution affected rerun | traversal syntax; `node --test test/spatial-v3/p19-execution.test.js`; `node --test test/spatial-v3/p21-orchestration.test.js`; architecture | 0 | missing import added; P19 8/8, P21 9/9 and architecture boundaries all green |
| WP13 canonical generator pass | aggregate managed-output SHA probe; escalated `docs:generate`, `spatial-v3:matrix`, `spatial-v3:freeze` in one `Promise.allSettled` batch | 0 | all three canonical writers completed; managed outputs moved from pre-generation SHA `16b528e4…96b76` to accepted SHA `c426d8cf…30821` before the world-schema file was added to the comparison set |
| WP13 major-stage acceptance | docs/freeze/vocabulary/P02/P05/P08/Temporal-doc/architecture checks; docs tests; time/contracts/NPC/turn profiles; `git diff --check` in one `Promise.allSettled` batch | 0 | docs 9/9, time 23/23, contracts 10/10, NPC 8/8, turn 50/50; every checker and diff hygiene green |
| WP13 unchanged second generation | aggregate SHA including `infra/world-base/SCHEMA_REFERENCE.md`; second escalated docs/matrix/freeze batch; post-run hash comparison | 0 | exact 20-file aggregate stayed `ecfd16ea2a4ef1d4e5812948b528bd6f88541873fe84d0a0abe49e8ffc2f66af`; no generated content drift |
| WP13 post-no-diff hygiene | `git diff --check`; `npm run docs:check`; `npm run spatial-v3:freeze-check` in one `Promise.allSettled` batch | 0 | whitespace, generated documentation and independently reviewed freeze remained green |
| WP13 independent critic | read-only source/diff audit; 43 focused tests; P02/P08/P19/Temporal-doc/architecture checks; generator reproducibility; P28 fail-closed probe; Graphify query/path/explain | accepted | verdict `PASS WITH NOTES`, zero functional/architectural findings; sandboxed full `npm test` had two EPERM writes and was not counted as passed; external read-only Graphify 0.9.17 navigation succeeded |
| WP14 knowledge import/materialization | `npm run knowledge:inventory`; escalated `npm run knowledge:import`; escalated `npm run knowledge:generate`; `knowledge:check-corpus`; `knowledge:check` | 0 | 36 canonical documents / 29 legacy files imported; generated knowledge artifacts current |
| WP14 initial knowledge acceptance | `npm run test:knowledge-source`; `knowledge:status`; exact Temporal query | 1 | eight tests and status/query rejected stale retrieval-policy corpus pin; two additional tests hit sandbox EPERM |
| WP14 retrieval-policy root fix | exact corpus-hash probe and scoped policy inspection; retrieval-policy baseline pin updated from stale value to `e7f174fdffa9391ff70caaeb4b5d235074f2d2e706109a990c8b06ce93ac0da4` | 0 | policy is bound to the generated 36-document corpus; no fallback or warning suppression added |
| WP14 knowledge affected rerun | escalated `npm run test:knowledge-source`; `npm run knowledge:check`; `npm run knowledge:status`; Temporal query with `--statuses active,proposed` | 0 | 54/54; check current; status degraded only by known baseline semantic gaps with empty blocker list; Temporal norm ranked first |
| WP14 strict status boundary | `npm run knowledge:read -- --document-id temporal-world-and-interruptible-activities` | 1 expected | proposed document correctly rejected by the active-only default with `DOCUMENT_STATUS_NOT_ALLOWED` |
| WP14 explicit proposed read | same exact read with `--statuses active,proposed` | 0 | complete 87,967-byte canonical norm read; strict default preserved |
| WP14 retrieval controls | `npm run knowledge:controls` | 0 | every configured expected-document control matched |
| WP14 repository graph refresh | escalated `graphify update .` | 0 | 25,893 nodes / 52,072 edges / 1,486 communities; large HTML deliberately skipped; optional SQL parser and zero-node asset warnings retained |
| WP14 repository intelligence build | escalated `npm run repo-intel:build`; escalated `npm run repo-intel:ensure` | 0 | exact base commit and Graphify 0.9.17 recorded; ensure returned `rebuilt:false` |
| WP14 repository-intelligence tests | `npm run test:repository-intelligence` | 0 | 17/17 |
| WP14 sandbox readiness probe | `npm run repo-intel:status` and three combined queries inside sandbox | expected mixed | status failed Graphify script canonicalization; queries returned knowledge results but Graphify lane partial for the same environment-only cause |
| WP14 external readiness rerun | escalated `npm run repo-intel:status`; escalated three exact combined queries in one `Promise.allSettled` batch | 0 | repository graph/Graphify ready on 0.9.17 and exact base SHA; each query `partial:false`; only known knowledge degraded warning remains |
| WP14 Graphify scoped query | escalated `graphify query "Temporal World v4 contract implementation orchestrator committer tests"` and narrower composition query | 0 | contract, P19 engine, P21 composition/orchestrator, P16 committer and integration tests located |
| WP14 Graphify symbol evidence | four focused `rg` probes plus `graphify explain` for contract, engine, orchestrator, committer and composition | expected mixed then 0 | two Windows path-glob forms failed with OS error 123; `rg -g` retries succeeded and exact source nodes/call sites were confirmed |
| WP14 Graphify path evidence | four `graphify path` commands and composition-specific path/explain | 0 | only `EXTRACTED` edges used; composition→orchestrator is a direct call, committer→P21 is a direct import, and required P19/P16 injection is confirmed at exact source lines |
| WP14 knowledge/graph hygiene | `git diff --check` alongside external status/query/controls batch | 0 | no whitespace errors |
| WP14 first non-PostgreSQL acceptance | `test:domain`; `test:turn`; `test:narration-presentation`; `test:integration`; `architecture:check` in one `Promise.allSettled` batch | 0 | domain 224/224, turn 50/50, narration/presentation 16/16, integration 21 passed + 6 explicit Docker skips, architecture OK |
| WP14 P14–P25 non-PostgreSQL gate batch | 18 independent P14/P15/P16/P18/P19/P21/P22/P23/P24/P25 test/check commands in one `Promise.allSettled` batch | expected mixed | all gates green except P21 source checker and P23 unit suite; P25 was 7/7 with one explicit Docker skip |
| WP14 P21/P23/P25 deterministic repro | repeated `spatial-v3:check-p21`; `spatial-v3:test-p23`; full `spatial-v3:test-p25`; CONTEXT/ADR inventory in one batch | expected mixed | P21 repeated the same two missing source markers; P23 repeated 8/10; P25 confirmed exit 0, 7 passed/1 Docker skip (the printed assertion is skip diagnostics, not an accepted test) |
| WP14 P21 checker root fix | lifecycle source inspection; `check-p21.mjs` now validates façade plus its internal lifecycle owner; immediate `spatial-v3:check-p21` | 0 | moved `schema_version: 3` and `superseded` invariants are checked without undoing the WP13 module split |
| WP14 P23 formal-envelope TDD red | rewritten focused P23 unit seam with explicit caller-supplied envelope and absent-envelope guard; `npm run spatial-v3:test-p23` | 1 expected | 9/11; absent envelope correctly failed before approval/commit, while two explicit-envelope paths proved the service had not yet forwarded the input |
| WP14 P23 root fix | P23 mutation service accepts an explicit options envelope and forwards it to the existing P16 builder; PostgreSQL fixtures updated to pass their test projection explicitly | 0 | party-store does not invent visible facts; the sealed P16 plan remains the validation/atomic-persistence owner |
| WP14 P21/P23 affected rerun | P21 checker/test; P23 checker/test; P16 test; architecture; full diff in one `Promise.allSettled` batch | 0 | P21 9/9; P23 11/11; P16 6/6; both checkers, architecture and diff hygiene green |
| WP14 PostgreSQL P14 | escalated `npm run spatial-v3:test-p14-postgres` | 0 | 1/1 on fresh PostgreSQL 16; migration re-application and planning/history boundaries green |
| WP14 PostgreSQL P15 first run | escalated `npm run spatial-v3:test-p15-postgres` | 1 | stale harness assertion expected five target migrations while the registered target chain now contains 001–007 |
| WP14 PostgreSQL P15 fix/rerun | migration registry/source inventory; P15 exact assertion updated to seven; escalated same test | 0 | 1/1; journey, exact-time and idempotency constraints green |
| WP14 PostgreSQL P16 persistence | escalated `npm run spatial-v3:test-p16-postgres` | 0 | 1/1 physical persistence invariants |
| WP14 PostgreSQL P16 committer first run | escalated `npm run spatial-v3:test-p16-committer-postgres` | 1 | transient `Connection terminated unexpectedly`; test container was cleaned and no stopped/crashed P16 container remained |
| WP14 PostgreSQL P16 committer retry | read-only Docker container inventory; escalated same test on a fresh container | 0 | 1/1; transient did not reproduce |
| WP14 PostgreSQL P23 initial explicit-envelope run | escalated `npm run spatial-v3:test-p23-postgres` and diagnostic rerun | 1 | first run returned `generated_schema_mismatch`; diagnostic payload proved missing `party_visible_packages` because the old fixture applied only 001–005 |
| WP14 PostgreSQL P23 migration/lifecycle checkpoints | repeated exact P23 command after adding 006–007 and diagnostic assertions | expected mixed | one Docker-run 125 transient left no container; next runs exposed stale NPC `state_version=0` and then missing exact schedule boundary under valid 007 constraints |
| WP14 PostgreSQL P23 root fix/rerun | P23 fixture now applies 001–007, supplies exact active schedule boundary, asserts immutable schedule pins at DDL, and advances lifecycle version for legal endpoint changes; escalated same test | 0 | 1/1; atomic factual package, idempotent replay, rollback, party/root validation and concurrent lock/CAS paths green |
| WP14 PostgreSQL P24 | escalated `npm run spatial-v3:test-p24-postgres` | 0 | 1/1 actual v2 relation mapping, dry-run and rollback |
| WP14 PostgreSQL P25 | escalated `npm run spatial-v3:test-p25-postgres` | 0 | 1/1 local snapshot/restore compatibility drill |
| WP14 Temporal PostgreSQL initial profile | escalated `npm run temporal-v4:test-postgres` | 1 | P16 passed; Temporal migration connection terminated |
| WP14 Temporal PostgreSQL isolated repro | direct `node --test --test-concurrency=1 test/spatial-v3/temporal-world-postgres.test.js` | 1 | connection loss reproduced without cross-file concurrency |
| WP14 Temporal PostgreSQL server diagnosis | one tagged diagnostic rerun with container logs | 1 | `pg_isready` admitted the temporary init server before database creation; entrypoint then performed its normal fast shutdown, severing the migration connection |
| WP14 Temporal PostgreSQL readiness fix | readiness changed to two successful target-database `psql SELECT 1` probes; debug instrumentation removed; isolated direct test rerun | 0 | 1/1 |
| WP14 Temporal PostgreSQL canonical rerun | package script fixed to `--test-concurrency=1`; escalated `npm run temporal-v4:test-postgres` | 0 | 2/2 sequential isolated PostgreSQL profiles; exact persistence, party isolation, replay and durable presentation green |
| WP14 Temporal focused profile | 13-file direct `node --test` command covering contracts/time/turn/persistence/readiness/NUMERIC | 0 | 75/75 |
| WP14 affected managed writers | escalated `npm run docs:generate`; then escalated `npm run temporal-v4:freeze` | 0 | documentation/knowledge/schema artifacts regenerated by the canonical writer; proposed-stage Temporal freeze updated |
| WP14 generated acceptance batch | docs check/tests; Temporal freeze/vocabulary/docs; matrix; Spatial freeze; world schema/reference; knowledge corpus/check/tests; architecture; diff in one `Promise.allSettled` batch | 0 | docs 9/9, knowledge 54/54, all reproducibility/schema/architecture/diff gates green |
| WP14 repository graph final refresh attempt | escalated `graphify update .` | not run | approval service rejected the action because its external-execution usage quota is exhausted until 2026-07-31; no workaround attempted and no graph freshness claimed |
| WP14 first broad wrapper | sandboxed `npm test` | 1 | wrapper reached `test:tools`; 214/216 tool tests passed, then the two known filesystem-sensitive knowledge tests hit sandbox EPERM, so later wrapper stages did not execute and the command is not counted as passed |
| WP14 release hygiene | `npm run release:check` alongside the broad wrapper | 0 | release hygiene OK |
| WP14 wrapper tail recovery | `test:shadow`; `test:cutover`; `test:browser-e2e`; docs; integration; architecture in one `Promise.allSettled` batch | 0 with one skip | shadow 6/6, cutover 4/4, docs/integration/architecture green; browser command executed but skipped its only case because no executable path was configured |
| WP14 real browser acceptance | standard Chrome path inventory; `RUS_CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe` with exact `npm run test:browser-e2e` | 0 | real Chromium 1/1: new game, opening acknowledgement, first turn and hidden-leak/error behavior |
| WP14 pre-candidate P28 batch | readiness; P28 tests/check; local evidence in one `Promise.allSettled` batch | expected mixed | readiness exit 1 with exact 13 families / 16 typed gaps; P28 8/8 and static checker green; local evidence exit 1 with those 16 gaps plus stale candidate evidence, `production_writes:0`, `composition_changed:false` |
| WP14 preliminary critic | read-only full-candidate pre-audit with 32 focused checks | findings | `CRITICAL`: an invalid persisted visible envelope was passed into the pending presentation fallback and could expose a hidden payload when screen projection failed; P21/P15/P23/P28 checks otherwise green |
| WP14 knowledge-test isolation | focused two-test command after replacing real-checkout rename/write operations with temporary fixture roots | 0 | 2/2; no legacy directory rename and no generated artifact write targets the checkout |
| WP14 persisted-envelope security RED | `node --test --test-name-pattern="invalid persisted envelope" packages/turn/test/temporal-presentation-lifecycle.test.js` | 1 expected | reproduced the critic finding: fallback returned `{hidden_motive:"secret"}` in both visible package and screen |
| WP14 persisted-envelope security fix | invalid loaded envelopes are replaced by the empty safe fallback envelope before screen projection; full presentation lifecycle, knowledge migration tests and syntax in one `Promise.allSettled` batch | 0 | presentation 8/8, knowledge migration 8/8, syntax green; no claim/narration side effect and no hidden key/value survives |
| WP14 affected subsystem acceptance | `npm run test:tools`; `npm run test:turn`; `npm run test:narration-presentation` in one `Promise.allSettled` batch | 0 | tools 216/216, turn 51/51, narration/presentation 16/16; both former sandbox EPERM failures are eliminated at their fixture boundary |
| WP14 exact root wrapper | `npm test` | 0 | modules/domain/apps/tools/shadow/cutover/docs/integration/architecture all green; integration reported its six explicit Docker skips and browser reported its explicit no-path skip, both covered by the separately recorded real PostgreSQL and real-Chromium runs |
| WP14 repeat independent critic | read-only post-fix audit; 41 focused tests; P15/P21 checks; P28 state; diff hygiene | accepted | `PASS WITH NOTES`, zero code findings; critical hidden-leak finding closed; note is only the externally blocked final Graphify refresh, PostgreSQL evidence remains the executor’s separately recorded real run |
| WP14 final release matrix | release/docs/knowledge/repository-intelligence/schema/P28/freeze/diff checks in one `Promise.allSettled` batch | 0 | release, docs 9/9, knowledge 54/54, repo-intel 17/17, 186-table schema/reference, P28 static/8 tests, both freezes and diff hygiene all green |
| WP14 final fail-closed activation probes | `npm run temporal-v4:check-data-readiness`; `npm run spatial-v3:p28-local-evidence` in the same batch | 1 expected | exact 13-family matrix still yields 16 typed authoring gaps; P28 additionally reports candidate-evidence HEAD mismatch, with no production writes and no composition change |
| Promotion active-only TDD RED | focused repository-policy test requiring active Temporal read, target-only front matter and active-stage freeze | 1 expected | default reader rejected the still-`proposed` document with `DOCUMENT_STATUS_NOT_ALLOWED`, proving the promotion had not yet occurred |
| Promotion source checkpoint | source/status/navigation/checker edits plus exact corpus hashes and retrieval-policy pin; corpus, docs checker, syntax | expected mixed | corpus and active-status checker passed; focused test remained red only on old managed freeze and `knowledge:check` reported only expected stale generated outputs |
| Promotion managed writers | sandboxed `npm run temporal-v4:freeze`; sandboxed `npm run knowledge:generate` in one `Promise.allSettled` batch | 1 | both canonical writers hit environment `EPERM`; external execution cannot be requested because the approval quota is exhausted until 2026-07-31 |
| Promotion transactional rollback | reverted only the uncommitted promotion source/test/pin/checker changes after managed writers could not run; corpus/knowledge/Temporal docs/freeze/policy tests/diff in one `Promise.allSettled` batch | 0 | restored verified `proposed` state, manifest `e7f174fd...`, 1,401 chunks and reproducible freeze; no partial active corpus or stale generated artifact remains |
| WP14 final safe-state verification | `docs:check`; Temporal docs; knowledge check; `git diff --check`; status/stat; scoped debug/workaround scan in one `Promise.allSettled` batch | expected mixed | docs/knowledge/diff green; status records 117 tracked files plus intentional new files; scoped scan exit 1 means no debug/FIXME/temporary-workaround marker found |
| WP14 independent test-matrix audit | read-only comparison of plan §22.3–22.5 against exact journal evidence | accepted | `PASS WITH NOTES`; every defined test/static/PostgreSQL/browser command is covered, with only clean-clone, final Graphify, promotion and P28 external prerequisites outstanding |
| WP14 independent P28 state audit | read-only gate/readiness/evidence/composition audit plus local-evidence gate | accepted block | P28 correctly returns 17 blockers: 16 typed authoring gaps + stale candidate evidence; `production_writes:0`, `composition_changed:false`, no production import/route selects target v3; final P28 critic must be exact candidate-bound `PASS`, not `PASS WITH NOTES` |
| Continuation completion-ledger audit | full Graphify skill read in nine bounded chunks; plan §27–29 and README status/evidence sections read; `git status --short --branch` inspected | 0 | all tool results checked; the twelve required final-report items are now mapped below, without claiming blocked promotion, exact-candidate Graphify, P28 or PR evidence |
| User-authorized Graphify refresh | escalated `graphify update .` | 0 | rebuilt 25,898 nodes / 52,081 edges / 1,474 communities; HTML skipped by the 5,000-node safety limit; 306 zero-node assets and 34 SQL files without the optional parser reported as explicit coverage warnings |
| Repository Intelligence refresh after graph | escalated `npm run repo-intel:build`; then status, combined query and direct Graphify query in one `Promise.allSettled` batch | 0 | Graphify/Repository Graph ready on pinned 0.9.17; query `partial:false`; only the acknowledged knowledge baseline warning remains |
| Active promotion TDD RED rerun | added active-only manifest/freeze/retrieval acceptance and ran its focused test | 1 expected | failed exactly on manifest `actual: proposed`, proving the promotion boundary before edits |
| Active promotion source inventory | targeted status/reference probes across norm, manifest, navigation, architecture, checker, generator, policy, ADRs, MODULE files and pipelines | expected mixed | all stale proposed-state consumers identified; one invalid Windows glob was retried with `rg -g` and succeeded |
| Active promotion source checkpoint | status/navigation/ADR/checker/generator edits; exact 14-document SHA/byte recalculation; manifest/policy repin; corpus/docs/syntax/test/diff batch | expected mixed | corpus and Temporal conflict check green with status active; focused test failed only on the intentionally stale generated freeze |
| Active promotion canonical writers | escalated `npm run docs:generate` and `npm run temporal-v4:freeze` concurrently; then escalated `npm run knowledge:generate` | 0 | active freeze, generated documentation, schema, graph materialization and RAG written by canonical generators; repeat knowledge writer succeeded |
| Active promotion acceptance | knowledge tests, docs tests/check, corpus/generated checks, status, controls, Temporal docs/freeze, policy suite and diff in one `Promise.allSettled` batch | 0 | knowledge 55/55, docs 9/9, active-only policy 6/6, all reproducibility checks green; Temporal norm is active and default retrieval-visible |
| Post-promotion Graphify refresh | escalated `graphify update .` | 0 | current source graph rebuilt to 25,898 nodes / 52,081 edges / 1,479 communities with the same explicit optional-parser/zero-node warnings |
| Post-promotion Repository Intelligence | escalated `npm run repo-intel:build`; then status and exact promotion/P28 combined query | 0 | graph/Graphify ready on 0.9.17, query `partial:false`; RAG returns the active Temporal norm and updated source digests |
| Post-promotion P28 acceptance | readiness, 17 focused P28/readiness tests, static P28 check and local-evidence gate in one `Promise.allSettled` batch | expected mixed | tests/static green; activation remains fail-closed on 16 typed gaps across 13 unapproved families plus release-evidence HEAD mismatch; zero production writes and unchanged composition |
| Post-promotion journal reconciliation | current-state sections rewritten to remove resolved quota/promotion claims; docs, Temporal docs, knowledge, freeze, diff and obsolete-claim scan in one `Promise.allSettled` batch | expected mixed | all four canonical checks and diff green; obsolete-claim scan exit 1 means no stale current-state marker matched |
| SQL-aware Graphify completion | escalated `uv tool install --force "graphifyy[sql]==0.9.17"`; version/import probes; escalated `graphify update .`; Repository Intelligence rebuild/status/query and direct DDL query; final `docs:check` and `git diff --check` | 0 | pinned Graphify remains 0.9.17; `tree-sitter-sql` 0.3.11 installed; graph now 26,498 nodes / 53,175 edges / 1,518 communities; SQL warning eliminated and migration 007 is an extracted graph node; combined query `partial:false`; docs/diff green |
| Third consecutive approved-data blocked audit | full Graphify skill read; Graphify blocker query; Repository Intelligence status; Temporal readiness; P28 local evidence; exact matrix summary; `git status` in one `Promise.allSettled` batch; final `docs:check` and `git diff --check` | expected mixed | graph/repository intelligence ready; readiness/P28 exit 1 only for the same 16 typed gaps plus pre-candidate evidence HEAD; matrix remains 13 families, 0 approved, 12 absent, 1 partial; docs/diff green; no safe repository action can manufacture source approval or provenance |
| External auditor data-handoff discovery | full Graphify skill read; `graphify query "Temporal World v4 data readiness 13 families approval evidence source bundles import schemas validator tests" --budget 1800`; matching `npm run repo-intel:query`; full readiness validator/test/matrix and contract/reference inspection | 0 | both navigation lanes located the exact 13 family owners, typed gaps, six-artifact approval contract, source-byte/hash rules and fail-closed P28 boundary; combined query `partial:false` |
| External auditor handoff build | generator syntax; 13-family template generation; 90-JSON parse; `node tools/validate-handoff-template.mjs`; strict `node tools/validate-auditor-return.mjs`; 54 reference/input byte comparisons; manifest/checksum rebuild; ZIP round-trip validation | expected mixed then 0 | handoff contains 155 files, 52 exact repository references and 2 exact external inputs; template check passes 13/13; strict return validator correctly rejects all pending/draft markers and missing source bytes; 154/154 checksums and all 90 JSON pass before and after extraction; ZIP SHA-256 `29d12bc0253f42876b18a6c94554ee96bd06aaf4702532159f6f71f0c6426bea` |
| External auditor handoff repository hygiene | `npm run docs:check`; `git diff --check`; final ZIP existence/size/SHA probe in one `Promise.allSettled` batch | 0 | documentation/generated data OK; no whitespace errors; archive exists, 507,008 bytes, SHA-256 matches the recorded handoff digest |
| Returned authoring archive quarantine | .NET ZIP entry inventory, path/duplicate/size/ratio checks, SHA-256, isolated extraction, 96-JSON parse and returned validator | expected mixed then 0 | input ZIP SHA-256 `e8dc8df17213125fe07a724b2c3014f771def221e3f2be86368ac4dbb0482f3c`; 261 safe entries / 4,497,732 uncompressed bytes; validator accepts all 13 families and reports only the 13 declared developer bindings |
| Returned archive independent audit | `node C:\tmp\audit-temporal-v4-return.mjs`; exact source-byte/digest/decision/set/field/count audit; `python -B` daylight derivation replay; repository source comparisons | 0 | 13 families, 21 records/references, 13 provenance rows and 46 sources are structurally closed; 1,461 daylight rows reproduce byte-equivalent values; exact repository-backed source bytes match; no data gaps or draft markers |
| Returned archive integrity exception | root `SHA256SUMS.txt` and `ARCHIVE_MANIFEST.json` compared with actual returned archive | rejected evidence | root checksum file has 95 missing/mismatched entries and manifest describes the original 153-content-file handoff instead of the 188-file return; those two stale outer artifacts were quarantined and not integrated; source-level hashes and decisions were independently verified |
| Returned data repository copy | first sandboxed copy; then escalated fail-fast copy with exact destination inventory | expected mixed then 0 | first copy was denied by filesystem policy and copied zero files despite a misleading shell exit 0; retry copied 111 data files plus 15 external-audit evidence files; stale outer checksum/manifest were excluded |
| Approved-data importer TDD RED | `node --test test/spatial-v3/temporal-approved-data-import.test.js` | 1 expected | `ERR_MODULE_NOT_FOUND` for the intentionally absent `tools/temporal-v4/import-approved-data.mjs` proved the new DDL/import contract was not implemented |
| Temporal DDL/importer first focused batch | schema inspection plus focused Temporal import test before importer creation | expected mixed | 190-table / 18-part schema checks passed; importer test remained red only on the missing module |
| Temporal reference binding checkpoint | importer syntax; bundle validation before all repeated references were rebound; placeholder scan | expected mixed | syntax green; exact counts 13/21/21/13/46, but eight repeated references still carried the developer placeholder and were rejected |
| Temporal approved-data unit Green | `node tools/temporal-v4/import-approved-data.mjs`; focused import + world schema tests; placeholder scan; `node scripts/check-world-base-schema.mjs` in one `Promise.allSettled` batch | 0 | 13/21/21/13/46 exact coverage, zero developer bindings/errors; 6/6 tests pass; deterministic atomic SQL, rollback mode, immutable four-table DDL and 190-table schema are green |
| Temporal approval-evidence TDD | readiness tests after external-decision hash binding; canonical schema writer; focused rerun | expected mixed then 0 | first 9/10 run exposed a fixture missing its decision id; root fixture contract fixed; readiness 10/10 and schema/reference 5/5 green; schema reference now has 190 tables and DDL digest `6e60005176cd22816887f3c82e1de866ba627728b673a8b3cb7667fd41906d4e` |
| Temporal approval finalizer RED/Green | syntax; `--check` before write; escalated `npm run temporal-v4:finalize-data`; finalizer/readiness/import scans and focused tests | expected 14 stale then 0 | canonical finalizer replaced all temporary hashes in 13 approvals, bound exact decision bytes, set the matrix to `ready`; `activation_ready:true`, zero errors/blockers and zero developer markers |
| Temporal focused data subsystem acceptance | readiness/import tests; finalizer/check-data-readiness; schema/reference tests in one `Promise.allSettled` batch | 0 | 15/15 data/readiness tests and 5/5 schema/reference tests pass; every referenced repository evidence/test path exists |
| Temporal PostgreSQL first attempt and diagnosis | escalated `npm run temporal-v4:test-approved-data-postgres`; `docker version/info`; service/process probe | skipped, then diagnosed | test honestly skipped because Docker daemon was stopped; client 29.5.3 present, desktop-linux pipe absent, `com.docker.service` stopped; skip was not counted as pass |
| Temporal PostgreSQL real acceptance | background Docker Desktop start; bounded daemon readiness probe; escalated `npm run temporal-v4:test-approved-data-postgres` | 0 | real PostgreSQL 16 1/1: rollback leaves 0 rows; repeated commit stays 46/13/21/21; world_reader cannot write; immutable triggers reject mutation; a corrupted row causes `TEMPORAL_APPROVED_ROW_MISMATCH` and transaction failure |
| Returned-data generated-artifact refresh | `npm run temporal-v4:freeze`; `npm run spatial-v3:matrix`; `npm run docs:generate`; `npm run knowledge:generate`; `graphify update .`; `npm run repo-intel:build` | 0 | canonical writers completed; repository graph reached 27,711 nodes / 54,415 edges / 1,754 communities; Repository Intelligence rebuilt for the pre-commit checkout |
| Returned-data Repository Intelligence acceptance | escalated `npm run repo-intel:status`; escalated exact combined query | 0 | Graphify 0.9.17 and both navigation lanes ready, query `partial:false`; only the documented non-blocking knowledge baseline warning remains |
| Returned-data P28 pre-candidate probe | readiness; P28 tests/check/local evidence | expected mixed | readiness is `activation_ready:true`; P28 tests 8/8 and static checker pass; local evidence correctly reports only `activation_evidence_commit_not_current_head`, with zero production writes |
| First returned-data full wrapper | real-Chrome `npm test` | 1 | modules/domain/apps/tools/shadow/cutover/docs passed; integration exposed a stale runtime-catalog forward-migration fingerprint after the world schema grew from 186 to 190 tables |
| Runtime-catalog fingerprint root fix | exact source/target schema fingerprint and migration digest recalculation; focused forward-migration/CI tests; real runtime-catalog PostgreSQL test | 0 | contracts repinned to the 190-table schema; 7/7 focused tests and PostgreSQL 1/1 pass |
| First returned-data full Spatial/Temporal suite | `node --test --test-concurrency=1 test/spatial-v3/*.test.js` | 1 | failures reduced to stale P02/P05 normative pins plus P12 historical branch binding, untracked new schema part and regenerated line-range anchors; shared causes were fixed instead of weakening tests |
| P02/P05 root repair | exact SHA-256 repin of the reviewed P02 declaration and 24-source P05 baseline; `npm run spatial-v3:freeze`; `node tools/spatial-v3/check-p02.mjs`; `node tools/spatial-v3/check-p05.mjs`; `git diff --check` | 0 | both normative boundaries and canonical freeze are current; no whitespace defects |
| P12 historical binding repair | `node tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs` after removing obsolete current-branch equality while retaining repository, subject SHA, manifest, binding-blob and ancestry checks | 0 | immutable historical subject remains valid on its descendant feature branch; v1.1 stays intentionally fail-closed and reports no validation errors |
| P12 dependency-closure regeneration | `git add -A`; sandboxed generator attempt; escalated `node scripts/generate-p12-dependency-closure.mjs`; `git add -A` | expected mixed then 0 | first generator attempt hit sandbox `EPERM`; approved retry generated exact 49 nodes / 68 authoring versions / 57 categories / 17 scene templates / zero hard gaps with DDL digest `6e600051…`; bundle remains `pending_reapproval` until exact subject commit and independent evidence commit |
| P12 first focused rerun | bundle validator; P02/P05; forward-migration tests; P12 target and dependency-closure tests; diff check | expected mixed | bundle/P02/P05/diff and 17/19 target tests passed; stale target manifest and stale line ranges were real failures; dependency test was not accepted because its checkout-writing cases hit sandbox `EPERM` |
| P12 anchor/target root fix | exact current normative line ranges; escalated dependency-closure generator; escalated `npm run spatial-v3:generate-p12-approved-target`; `git add -A` | 0 | regenerated closure has zero hard gaps; checked-in target manifest/datasets now reproduce from immutable approved inputs and the current closure |
| P12 focused target acceptance | escalated 19-test target materialization/intake/import suite | 0 | 19/19; target authoring bundle byte-reproducible, all 600 edge mappings and 195 profiles/candidates covered, adversarial drift rejected, V1/V1.1 intake boundaries preserved |
| Exact subject root wrapper | real-Chrome escalated `npm test` | 0 | modules/domain/apps/tools/shadow/cutover/docs/integration/browser/architecture all pass; tools 216/216, integration 22 pass with five explicit separately covered PostgreSQL skips, real Chromium 1/1 |
| Exact subject whitespace gate | staged `git diff --check`; first docs/knowledge regeneration attempts | expected mixed | gate found intentional trailing spaces in digest-bound auditor source snapshots and ordinary Markdown spaces in two repository documents; first generators correctly rejected the temporarily stale corpus pin |
| Exact subject whitespace root fix | narrow `.gitattributes` exception for immutable `temporal-v4/sources/**`; canonical Markdown cleanup; exact corpus manifest SHA/byte repin; `knowledge:import`; `docs:generate`; `knowledge:generate`; Temporal freeze | expected mixed then 0 | imported source bytes and approval hashes remain unchanged; the first import attempt rejected the stale native pin, then 36-document import and all canonical writers completed |
| Exact subject generated/readiness acceptance | docs, knowledge, Temporal freeze, approved-data finalizer, readiness and staged diff checks in one `Promise.allSettled` batch | expected mixed | docs/knowledge/freeze/finalizer/readiness pass and `activation_ready:true`; staged diff isolated five remaining ordinary README trailing spaces for direct cleanup |
| First exact-subject independent critic | read-only audit of `d373ff261ecf7095ba6321d03d1951d64b277ad3` plus focused 108-test Temporal profile, P02/P05, P12, schema and runtime-catalog checks | changes required | functional/data checks passed; critic found stale retrieval-policy corpus pin and Repository Intelligence still bound to the parent commit; P12 binding absence remains the intentionally ordered pre-evidence state |
| Retrieval-policy audit fix | exact SHA-256 of current `corpus-manifest.json` repinned in `retrieval-policy.json` | pending validation | removes `RETRIEVAL_POLICY_STALE` at its source without suppressing baseline semantic-gap reporting |
| Retrieval-policy affected acceptance | `knowledge:status`; exact Temporal/P12 `knowledge:query`; docs/knowledge checks; `git diff --check` in one `Promise.allSettled` batch | 0 | status/query execute normally; only the documented non-blocking semantic coverage baseline remains, blocker list empty; docs/RAG and diff hygiene pass |
| Exact subject navigation refresh | commit `3b57dbd7da75be4e8e0b5ff3630c726b947d62b5`; escalated `graphify update .`; `repo-intel:build`; status, combined query and direct Graphify query | 0 | graph rebuilt to 27,711 nodes / 54,415 edges / 1,752 communities; Repository Intelligence and Graphify both bind exact subject SHA; combined query `partial:false` |
| Repeat exact-subject independent critic | read-only repeat audit of `3b57dbd7da75be4e8e0b5ff3630c726b947d62b5` after RAG/Graphify fixes | 0 | verdict `PASS`; no content findings; explicit P12 subject audit `PASS_FOR_SUBJECT_3b57dbd7da75be4e8e0b5ff3630c72`; production/P28 remain blocked |
| P12 evidence generation | local mechanical evidence generator; corrected audit-id length; sandbox retry; escalated retry | expected mixed then 0 | first invocation rejected the incorrect 31-hex assertion, second hit sandbox `EPERM`; approved retry created a 48-path SHA-256 subject binding and updated only allowed approval/manifest evidence files |
| P12 evidence precommit validation | closure bundle validator; exact evidence scope/subject/count/uniqueness probe; manifest SHA check; `git diff --check` | 0 | bundle PASS; subject is exact `3b57dbd…`; 48/48 unique required paths; manifest digest exact; no whitespace defects |

Полный domain/turn/narration/integration профиль, точный `npm test`, реальный
Chromium, documentation/generated acceptance и последовательный реальный
PostgreSQL-пакет выполнены. Active promotion и post-promotion Graphify refresh
также выполнены. Clean-clone acceptance откладывается до появления полного
функционального кандидата с утверждёнными data families, чтобы не повторять
ресурсоёмкий gate на заведомо неполном release candidate.

## 13. Generated evidence, critic и P28

- Repository graph пересобран после active promotion с SQL parser: 26,498
  nodes / 53,175 edges / 1,518 communities; Repository Intelligence status
  `ready`, exact combined query `partial:false`; migration 007 присутствует как
  extracted node. Graphify отдельно сообщает 306 zero-node data/assets без
  извлекаемых AST-сущностей; этот coverage warning не скрыт.
- Generated schema reference now has 190 tables / 18 SQL parts; Temporal World
  v4 approved authoring data is represented by four immutable read-only tables.
- WP14 repeat critic: `PASS WITH NOTES`, zero code findings; final
  exact-candidate critic после promotion/Graphify остаётся pending.
- P28 authoring-data prerequisite is closed: 13/13 families are byte-verified
  and `activation_ready:true`. Exact candidate commit/clean-clone,
  candidate-bound critic and GitHub proof still require the final candidate.

## 14. Known gaps / limitations

- RAG coverage baseline degraded, но обязательные документы доступны и прочитаны;
- literal source corruptions сохранены только в balanced retrieval-excluded ranges; classification sections 10–11.4 explicitly remain a documentation data gap;
- real PostgreSQL acceptance выполнен; clean-clone acceptance требует полного
  exact candidate с утверждёнными data families и не считается пройденным;
- Temporal norm находится в проверенном `active` состоянии; canonical
  docs/RAG/freeze writers, active-only retrieval и post-promotion Graphify
  refresh выполнены;
- 13 обязательных Temporal data families утверждены внешним аудитором,
  интегрированы и проходят source/decision/artifact byte verification; runtime
  fallback и самоутверждение данных по-прежнему запрещены;
- no production/operator database connection is authorized or used.

## 15. Integration and rollback order

Планируемый порядок:

```text
norm/contracts/red tests
→ exact time + activities + boundaries
→ domain/NPC/carrier/remote integrations
→ turn lifecycle + persistence/DDL
→ approved data + docs/registry
→ generated artifacts + full checks + critic
→ promote temporal norm active
→ exact-head P28
→ sole Spatial v3 read/write activation
```

До P28 rollback — оставить production v2 sole owner и не активировать target artifacts. После P28 rollback допускается только штатным versioned release procedure; dual-write/mixed-read fallback не создаётся.

## 16. Required-output completion ledger

| §27 requirement | Evidence in this README | State |
|---|---|---|
| 1. All documents read | §§3–4 record the RAG/Graphify needs, queries and every fully read mandatory/profile document | complete |
| 2. Files changed | §11 records the change groups and their concrete owner files; `git status` evidence is recorded in §12 | complete for the implementation candidate; final commit scope is blocked |
| 3. Conflicts resolved | §6 records C01–C18 and the selected resolution; active promotion resolved C13/C17 without production activation | complete |
| 4. Owners/ADRs | §7 and ADR-002…ADR-006 freeze the one-owner decisions and non-owner boundaries | complete |
| 5. Contracts and DDL migrated | §§5, 9, 11–12 record contract `4.2.0-target.1`, migration 007, committer integration and real PostgreSQL acceptance | complete at target scope; production activation intentionally absent |
| 6. Approved data and remaining gaps | §8 records the exact 13-family matrix and 16 typed authoring gaps; no data is self-approved or replaced by fallback | structurally complete; editorial/source approval blocked |
| 7. Commands actually run | §12 records every accepted, failed, expected-failed and skipped command with its factual result | complete through the current safe candidate |
| 8. Generated docs/RAG/Graphify | §§12–13 record canonical active docs/RAG/freeze generation and the post-promotion graph/status/query | complete for the current implementation candidate; final data-bearing candidate will require one final refresh |
| 9. Critic verdict and fixes | §§12–13 record the initial critical hidden-leak finding, RED reproduction, root fix, affected/full checks and repeat `PASS WITH NOTES` | implementation audit complete; final exact-candidate critic pending |
| 10. P28 evidence/status | §§12–14 record 17 fail-closed blockers, zero production writes and unchanged composition | correctly blocked; not activated |
| 11. Known limitations | §14 lists every known environmental, evidence and data limitation without fallback | complete |
| 12. Integration and rollback | §15 gives the exact forward order, pre-P28 rollback and the prohibition on dual-write/mixed-read fallback | complete |

The implementation candidate is stable, active-promoted and fully tested at
target scope. Release completion is not claimed: approved data, the final
data-bearing candidate RAG/Graphify/clean-clone evidence, exact `PASS` critic
evidence, P28, commit, push and the single PR remain gated by the recorded
authoring-data prerequisites.
