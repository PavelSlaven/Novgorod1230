# Интеграция перехода Нижней Двины yp025 ↔ yp026

## Статус

- Этап: validated candidate; production activation blocked fail-closed.
- Capability `local_scene`: уже активна в `spatial-v3-production-v2`.
- Capability `boundary_crossing`: интегрируется из утверждённого authoring package v1.
- Successor: `spatial-v3-production-v3`,
  `novgorod_spatial_v3_production_v3_candidate_001`.
- Catalog digest:
  `1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e`.
- Manifest SHA-256:
  `593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea`.
- Production activation successor не выполнялась: empty-party preflight
  обнаружил существующую v2-pinned party.
- Operator/production DB текущим worktree не изменялась.

## Рабочая среда

- Repository: `PavelSlaven/Novgorod1230`.
- Checkout: `C:\tmp\Novgorod-lower-dvina-boundary-authoring-v1`.
- Branch: `codex/lower-dvina-boundary-authoring-v1`.
- Exact task base: `0a196b3293cc8c87ea52ec55b7bc493b21b03d19`.
- `origin/main`: `0a196b3293cc8c87ea52ec55b7bc493b21b03d19`.
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
  PostgreSQL; production composition остаётся pinned на текущий active v2 до
  фактического cutover.

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
- Clean-clone exact-commit acceptance: `npm ci` и полный `npm test` PASS.

## Текущие blockers

Production read-only preflight 2026-07-26:

```text
party_count = 1
party_id = party:b5660e1f406bb9f83379173f
world_revision_id = novgorod_spatial_v3_production_v2_candidate_001
world_catalog_digest =
  fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255
active catalog event =
  runtime_catalog_activation_6ee035c89a5d9c4f97adf3c76a2e7e1d
```

Это противоречит допущению «существующих партий нет». Активный contract
`rus.runtime_catalog_party_preflight.v2` допускает initial activation только
при `party_count=0`. Партия и production DB не изменялись. Для cutover нужно
отдельное решение пользователя: сохранить партию и согласовать versioned
preflight для already-pinned parties либо явно признать exact party
disposable. Автоматическое удаление/rebinding запрещено.

Production activation/smoke остаются заблокированными только указанным
расхождением.
