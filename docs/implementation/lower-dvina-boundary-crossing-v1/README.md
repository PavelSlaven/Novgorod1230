# Интеграция перехода Нижней Двины yp025 ↔ yp026

## Статус

- Этап: production activation committed; runtime composition cutover и smoke.
- Capability `local_scene`: ready.
- Capability `boundary_crossing`: ready for runtime acceptance.
- Active release: `spatial-v3-production-v3`,
  `novgorod_spatial_v3_production_v3_candidate_001`.
- Catalog digest:
  `1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e`.
- Manifest SHA-256:
  `593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea`.
- Пользователь подтвердил полный reset единственной party-БД.
- `lower_dvina_party_production_v3` пересоздана штатной цепочкой 001–011;
  party count после reset и до smoke равен нулю.
- Production activation event:
  `runtime_catalog_activation_823f24b68cee4434a29404f86d98df42`.

## Рабочая среда

- Repository: `PavelSlaven/Novgorod1230`.
- Checkout: `C:\tmp\Novgorod-lower-dvina-production-activation-v3`.
- Branch: `codex/lower-dvina-v3-runtime-activation`.
- Exact production activation source:
  `855e10a1ab45c455a7ec594988fbf95d6d187a6c`.
- Node.js: `v24.16.0`.
- npm: `11.13.0`.
- Python: `3.13.3`.
- uv: `0.11.32`.
- Docker: `29.5.3`.
- Graphify: `0.9.17`.
- `npm ci`: PASS.
- `npm run repo-intel:ensure`: PASS, exact HEAD.
- `npm run repo-intel:status`: graph/Graphify ready; normative RAG сообщает repository-wide coverage warning без errors.

## Repository Intelligence

Выполнены оба обязательных независимых канала.

RAG/Graphify queries:

1. `Lower Dvina boundary authoring package directed segments boundary crossing compiler import activation yp025 yp026`
2. `Lower Dvina yp025 yp026 boundary segment check risk consequence policy owners`

Найденные владельцы:

- world route/point/segment/context/endpoint — существующие Spatial-v3 world-base datasets;
- interval progress, elapsed time, pause и terminal outcome — существующий `@rus/turn/spatial-v3-execution`;
- d20 evidence — `party_check_resolutions` с typed scope `traversal_interval_result_id`;
- body/condition effects и атомарный commit — существующий first-playable party store/combined committer;
- first-entry receiving scene — существующий deterministic materialization owner.

Второй traversal/check/consequence engine не создаётся.

## Утверждённый входной пакет

- Source ZIP: `C:\Users\Slaven\Downloads\lower_dvina_boundary_authoring_package_v1.zip`.
- ZIP SHA-256: `244c6c98e650f20ae5bf57bc1f50b2e63ed881ce165b1561559932bb32c7641e`.
- Candidate ID: `lower_dvina_boundary_yp025_yp026_authoring_v1`.
- Candidate content digest: `cde64b5e6317cd580a16b9178e7291c326a9c2c478811c31851eb7e45e5e8f4b`.
- User decision: `APPROVE_LOWER_DVINA_BOUNDARY_AUTHORING_V1`.
- Package semantic validator: PASS.
- `MANIFEST.json`: 25/25 files, sizes and hashes PASS.
- `SHA256SUMS.txt`: 26/26 entries PASS.
- Unsafe paths/duplicates: none.

Approval относится только к exact candidate digest. Исходные строки пакета не
редактируются молча; интеграционные rows получают отдельные compiler-assigned
versions/digests.

## Прочитанные нормативы

Полностью прочитаны и зафиксированы SHA-256:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `development_rules.txt`;
- `code_critic_invocation_rule.txt`;
- `code_driven_world_materialization_architecture.md`;
- `llm_documentation_navigation.md`;
- `world_base_materialization_table_requirements.md`;
- `map_g0_g4_workflow.txt`;
- `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`;
- `read_only_database_and_graph_architecture.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- `movement_locations_regions.txt`;
- `character_parameters.txt`;
- `formulas.md`;
- `temporal_world_and_interruptible_activities.md`.

## Инварианты интеграции

- `spatial-v3-production-v2` не изменяется.
- Successor является полным immutable snapshot.
- Ровно две независимые directed routes и четыре physical segments.
- Geometry остаётся `topological_only/corridor`.
- Normal supported conditions не создают d20.
- Один фактор даёт DC 10, два совместимых — DC 12.
- Более двух факторов или одновременные check domains дают hard block.
- Pre-progress failure не двигает время/progress.
- Mid-progress failure сохраняет committed elapsed/progress и ставит traversal на паузу.
- Paused traversal после restart предлагает видимое resume-действие и
  продолжает тот же execution/travel-state с очередным interval ordinal.
- Второй unresolved failure переводит series в `stranded_in_transit`.
- Fatality, drowning, craft destruction, inventory wipe и rollback committed
  elapsed/progress запрещены.
- Exact endpoint versions/digests разрешаются только из exact parent snapshot.
- `MAX(version)`, `latest`, timestamps, file order и runtime fallback запрещены.

## Реализованный результат

- Полный immutable v3 snapshot поверх exact v2 parent.
- Exact `parent + 1` version allocation для всех carried internal records;
  новые stable entities начинаются с version 1, external dependencies не
  повышаются.
- Receiving `yp025` G4/G5 ancestry и water-navigation profile.
- Две directed routes, четыре physical segments и reciprocal endpoint roles.
- World schema 20 с normalized availability/check/consequence/risk owners.
- Universal policy resolver: normal conditions без d20, один фактор DC 10,
  два совместимых DC 12, mixed/unsupported factor sets hard-block.
- Request-bound deterministic d20; неуспешный pre-dispatch recheck не создаёт
  execution, не переключает context и не двигает часы.
- Typed availability snapshot проверяет exact policy, daylight, season,
  water, wind, visibility, craft, load и controller state fail-closed.
- `recheck.water_15m@3` реально делит 30-минутный segment на интервалы;
  post-progress failure атомарно сохраняет 50% progress, 20 минут elapsed,
  `paused_in_transit`, body effect и condition evidence.
- Resume после restart завершает тот же route execution без новой plan или
  execution identity.
- Party P16 traversal evidence, transport root location, placement
  insert/delete, boundary anchor и receiving scene materialization.
- Forward/reverse runtime, save и restart/resume.
- V3 activation bundle выполняет CAS после v2 active event в disposable
  PostgreSQL. Первый merge добавляет только operator cutover; production
  composition остаётся на v2 до фактического v3 activation readback.

## Production activation и проверка актуальности источников

- Перед readiness повторно выполнены `git fetch --prune origin`, сверка
  актуального `origin/main`, merged PR #24, post-merge CI и exact approval /
  promotion evidence. Канонический base:
  `8c4d9e5acb1017c3f6fb0dabecab74fccdf33b3e`.
- Production composition переключается на exact
  `spatial-v3-production-v3` отдельным activation/evidence commit только
  после committed DB readback.
- In-place operator cutover принимает только exact v2 predecessor event,
  exact DB/principal identities, нулевой inflight count и ровно
  авторизованный набор party IDs.
- Перед удалением world DB получает append-only, exact request-bound
  `operator_control.lower_dvina_v3_cutover_events:prepared`. Он позволяет
  безопасно продолжить тот же cutover после сбоя между party cleanup и
  activation; пустая DB без exact prepared event остаётся blocked.
- Пользователь явно разрешил удалить
  `party:b5660e1f406bb9f83379173f`. Удаление выполняется одной party-DB
  транзакцией: весь exact reviewed набор delete-blocking append-only
  триггеров временно отключается, удаляются materialization-run catalog pin,
  catalog pin, coverage evidence и party root, затем триггеры включаются и
  проверяются до commit.
- После cleanup записывается второй immutable phase event. Повтор допускается
  только для того же request digest, predecessor, DB identity и prepared
  evidence; stale/different digest блокируется.
- Непосредственно перед destructive transaction после всех длительных world
  preparation steps выполняется повторный exact inventory/recheck. Изменение
  predecessor, party scope, pins или inflight state блокирует cleanup.
- После empty-party readback применяются world schema 20, exact v3 snapshot
  import и CAS activation поверх
  `runtime_catalog_activation_6ee035c89a5d9c4f97adf3c76a2e7e1d`.
- Затем запускается production game-server с exact v3 bindings и выполняется
  smoke: scenario new game, первый экран, один ход, save, process restart и
  resume. Созданная smoke-party является первой v3 party и удалению старых
  партий не принадлежит.
- Rollback/rebinding старых партий не выполняется; operator cutover не имеет
  generic `DELETE all` или fallback-ветви.

## Команды и evidence

Выполнено:

```powershell
git fetch --prune origin
git status --short --branch --untracked-files=all
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
node --version
npm --version
python --version
uv --version
docker version
docker compose version
graphify --version
npm ci
npm run repo-intel:ensure
npm run repo-intel:status
npm run repo-intel:query -- --query "<queries above>"
python payload/tools/validate_package.py --root payload
npm run lower-dvina:boundary:test
npm run lower-dvina:boundary:test-postgres
node --test --test-concurrency=1 test/integration/first-playable-v2-activation-postgres.test.js
npm run test:tools
npm run test:integration
npm run docs:check
npm run architecture:check
node --test tools/runtime-catalog-activation/test/lower-dvina-v3-production-cutover.test.js
node --test --test-concurrency=1 test/integration/first-playable-v2-activation-postgres.test.js
npm run lower-dvina:v3:production-cutover -- preflight <exact operator args>
```

Результаты:

- Package manifest/SHA/semantic validation: PASS.
- Compiler reproducibility и validator: PASS.
- Focused unit/contracts/world schema: 8/8 PASS.
- Successor import/readback/replay поверх parent v2: PASS.
- Runtime PostgreSQL forward/pre-dispatch failure/mid-progress pause/
  restart/resume/reverse: PASS.
- V2→V3 catalog activation CAS в disposable PostgreSQL: PASS.
- `test:tools`: 218/218 PASS.
- `test:integration`: 23 PASS, 6 environment-skipped, 0 failures.
- `docs:check`: PASS.
- `architecture:check`: PASS.
- Browser-harness на real game-server + separate world/party PostgreSQL: PASS:
  scenario button, look, safe move, talk/enrichment, 1000 ml water,
  give rope, network work, board, journey, forward crossing, save,
  process restart/resume, reverse crossing.
- Browser-harness ordinary new game without `scenario_id`: PASS.
- Полный `npm test`: PASS, включая 218/218 tools, 23 integration PASS,
  6 environment-skipped, docs и architecture; browser suite имеет один
  environment skip из-за отсутствия локального Chromium.
- Один обязательный независимый critic: финальный `PASS` после исправления
  availability/recheck и restart/resume lineage.
- Независимый activation critic: первоначально `CHANGES REQUIRED` из-за
  нерестартуемого окна после cleanup; после append-only phase ledger,
  failure-injection E2E, tamper checks и fresh pre-delete recheck — `PASS`.
- Clean-clone exact-commit acceptance: `npm ci` и полный `npm test` PASS.

## Production activation result

Исходная v2 party:

```text
party_count = 1
party_id = party:b5660e1f406bb9f83379173f
world_revision_id = novgorod_spatial_v3_production_v2_candidate_001
world_catalog_digest =
  fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255
active catalog event =
  runtime_catalog_activation_6ee035c89a5d9c4f97adf3c76a2e7e1d
```

Пользователь подтвердил, что уникальных данных нет, и разрешил полный reset
`lower_dvina_party_production_v3`. БД пересоздана без backup; старая party
невосстановима. Применены:

```text
party migration count = 11
party migration chain digest =
  b7a9eb899b5d302dc27bff6797f1bb6abf31b245ace3e7c285f94543e3039d45
runtime catalog migration =
  party_runtime_catalog_pins_v2
party count before smoke = 0
```

Committed production readback:

```text
release_status = active
production_activation = true
runtime_selectable_in_canonical_production = true
activation_event_id =
  runtime_catalog_activation_823f24b68cee4434a29404f86d98df42
world_revision_id =
  novgorod_spatial_v3_production_v3_candidate_001
world_catalog_digest =
  1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e
```

Sanitized machine-readable evidence:
`evidence/production-activation-v3.json`.
