# Тестирование: карта и команды

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-25, commit 59c1a33c.

Это карта, а не норма. Правила проверок задаёт [AGENTS.md §24](../governance/WORKFLOW_RULES.md) (и §22 для отладки, §29 для
отчёта). Все команды по группам перечислены в [генерируемом каталоге](../../generated/npm-script-catalog.md)
из [package.json](../../package.json); CI —
[.github/workflows/test.yml](../../.github/workflows/test.yml).

`docs:check` проверяет `npm run` в корневых инструкциях, `docs/`, `infra/`, `apps/`, `packages/`,
`scripts/`, `tools/` и CI workflows (тестовые файлы исключены). Исторические планы/журналы в
`docs/implementation/`, `docs/migration/`, `docs/work/temporal-world-v4/`, а также `DOCUMENTS/` и `legacy/`
сохраняют команды своего времени и не служат инструкцией запуска.

## 1. Главное правило

- Полный `npm test` — финальный merge gate на exact HEAD; предпочтительный владелец прогона — GitHub CI
  (AGENTS §24). Локально его не запускают после каждой правки, перед commit/push или «на всякий случай».
- Локальный полный прогон допустим, только если его прямо потребовал пользователь, CI недоступен, отладка
  действительно требует полного suite или этого требует профильный workflow (AGENTS §24).
- Во время работы — focused/profile tests затронутой области и regression test на root cause (AGENTS §24, §22).
- Для documentation-only изменения PostgreSQL, browser и integration suite не запускаются без отдельной причины
  (AGENTS §24).
- В отчёте — только реально выполненные проверки и их результат (AGENTS §24, §29).

## 2. Раскладка тестов

Все тесты — встроенный `node:test` (`node --test`). Источник раскладки — globs скриптов в package.json.

| Где лежат | Скрипт | Примечание |
|---|---|---|
| `test/modules/*.test.js` | `test:modules` | узкие срезы: `test:stage13`…`test:stage26`, `test:visible-context`, `test:hidden-boundary`, `test:g5-placement` |
| `packages/*/test/*.test.js` | `test:domain` | срезы: `test:turn`, `test:narration-presentation` |
| `apps/game-server/test`, `apps/game-web/test` | `test:apps` | |
| `tools/*/test/*.test.js` + `test/spatial-v3/p04-catalog-sync.test.js` | `test:tools` | включает файлы `test:docs`, `test:finalization`, `test:world-catalog` (тот же glob) |
| `test/shadow/*.test.js` | `test:shadow` | закрепляет фразы AGENTS.md и корпуса, см. [CORPUS_EDIT](../process/CORPUS_EDIT.md) |
| `test/cutover/*.test.js` | `test:cutover` | |
| `test/integration/*.test.js` | `test:integration` | `--test-concurrency=1`; часть тестов требует PostgreSQL |
| `test/acceptance/*.test.js` | `test:acceptance` | `--test-concurrency=1` |
| `test/e2e/*.test.js` | `test:browser-e2e` | браузерные (playwright-core) |
| `test/spatial-v3/*.test.js` | отдельные `spatial-v3:*`, `lower-dvina:*`, `temporal-v4:*`, `character-appearance:*`; все — `spatial-v3:red` | в `npm test` входит только `p04-catalog-sync` (через `test:tools`) |
| `legacy/test/*.test.js` | `test:legacy` | в `npm test` не входит |
| `test/*.test.js` (корень `test/`) | — | ни один скрипт package.json их не запускает; см. [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md) |

`test:knowledge-source` — сборный срез: `packages/knowledge-source/test` (часть `test:domain`), два файла из
`tools/docs-tools/test` (часть `test:tools`) и `test/modules/knowledge-source-architecture.test.js`
(часть `test:modules`).

PostgreSQL-тесты: часть из них пропускается без переменной окружения (например,
`test/integration/party-runtime-v2-postgres.test.js` — `skip: !process.env.PARTY_DATABASE_URL`). Зелёный прогон
без базы не доказывает DB semantics — смотрите `skip` в выводе. Только local/test база (AGENTS §23).

## 3. Состав `npm test` и CI

`npm test` = последовательно: `test:modules` → `test:domain` → `test:apps` → `test:tools` → `test:shadow` →
`test:cutover` → `docs:check` → `test:integration` → `test:acceptance` → `test:browser-e2e` →
`architecture:check` (package.json, скрипт `test`).

CI ([test.yml](../../.github/workflows/test.yml)): матрица jobs `full-npm-test-${{ matrix.suite }}` с
`suite: [fast, integration, acceptance, browser-architecture]`, `fail-fast: false`. Профиль `full` для
`pull_request`. До/вместо полного suite (по suite):

- общие: Node 22, `npm ci`; для `fast`/`acceptance`/`browser-architecture` — Python 3.12 и проверка WK encoder;
- `fast`: dry-run импорта world_base и FK-аудит; `world-db:schema-check` / `world-db:schema-doc-check`;
  контейнер `postgres:16`, DDL world_base с проверкой **208** таблиц и grants `world_reader`;
  PostgreSQL-интеграции `world-db:import:stage3b1:integration` и
  `character-appearance:test-world-v4-postgres` (**в suite `fast`**, не `integration` —
  [.github/workflows/test.yml](../../.github/workflows/test.yml));
  `knowledge:check-corpus`; `docs:generate` / `character-appearance:generate` + `git diff --exit-code` по
  `MODULE_INDEX.md`, `generated/`, `infra/world-base/SCHEMA_REFERENCE.md` и каталогам lower-dvina;
  затем `test:modules` … `docs:check` (как в package.json до integration);
- `integration`: `world-db:schema-check` / `world-db:schema-doc-check` / DDL 208 (как в `fast`) и
  `scripts/run-integration-tests.mjs`;
- `acceptance`: `test:acceptance`;
- `browser-architecture`: `test:browser-e2e` и `architecture:check`.

Профиль `evidence_only` — отдельный job (P28 + `docs:check`). Незакоммиченный generated-артефакт роняет CI.

## 4. Матрица «тип изменения → команды»

Команды — `npm run <скрипт>`. Всегда добавляются `git diff --check` (AGENTS §24) и `npm run check:syntax` — `node --check` / `JSON.parse` для изменённых относительно `origin/main` JS и JSON ([check-syntax.mjs](../../scripts/check-syntax.mjs); `--base <ref>` или явный список файлов).

| Тип изменения | Focused/profile | Дополнительно (AGENTS §24) |
|---|---|---|
| docs-only (`docs/**`, README, CHANGELOG) | `test:docs` (или `test:tools`, включает его) | `docs:check`; `docs:generate` и коммит результата, если изменён файл из [CANONICAL_PATHS.json](../migration/CANONICAL_PATHS.json), любой `MODULE.md`/`package.json` в apps/packages/tools, `schemas/**` или экспорт `*SCHEMA` (входы `input_digest`, LW-014) |
| нормативный корпус `data/knowledge-source/corpus/**` | по [CORPUS_EDIT](../process/CORPUS_EDIT.md) | `knowledge:check-corpus`, `knowledge:check`, `knowledge:controls`, `docs:generate`, `docs:check`, `test:knowledge-source`, `test:tools` |
| пакет `packages/<name>` | `node --test packages/<name>/test/*.test.js` | `architecture:check`, если затронуты границы/экспорты |
| turn / LLM boundary | `test:turn` | unseen-equivalent случай (AGENTS §24, §28.9) |
| narration / presentation | `test:narration-presentation` | |
| game-server / game-web | `node --test apps/<app>/test/<файл>.test.js`; `test:apps` | `test:browser-e2e` — только если меняется браузерный flow |
| tools / CI-скрипты | `node --test tools/<tool>/test/*.test.js`; `test:tools` | `architecture:check` |
| world-catalog данные | `test:world-catalog`, `world-catalog:validate-novgorod-revision` | `docs:check`, если меняются generated-артефакты |
| DDL / persistence | профильные `*-postgres` тесты (`spatial-v3:test-p16-postgres`, `lower-dvina:*:test-*-postgres` и т. п.) на test-БД | не подменять mocks (AGENTS §24); `test:integration` на local/test базе |
| world_base схема | `world-db:schema-check`, `world-db:schema-doc-check` | |
| архитектурные границы, новый модуль | `architecture:check` | [MODULE_RULES](../architecture/MODULE_RULES.md) |
| hidden info / visible context | `test:hidden-boundary`, `test:visible-context` | |
| bugfix | regression test у owner, затем профильный набор | AGENTS §22 |

## 5. Non-gate проверки с известными падениями (baseline 21bd0938)

Не входят в `npm test`; сравнивайте с baseline, а не с «зелёным»:

- `spatial-v3:check-p02` — падает с исключением в `tools/spatial-v3/check-p02.mjs` («architecture: active owner does
  not route to its target supplement»).

Зелёные на baseline: `temporal-v4:check-docs` (`conflict_count: 0`), `spatial-v3:check-p01`, `check-p03`, `check-p04`,
`spatial-v3:test-p12*` (отслеживаемые файлы не меняются).

Реестр подобных долгов — [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md).

## 6. Практика

- Узкий прогон одного файла: `node --test path/to/file.test.js`; по имени теста — `--test-name-pattern`.
- PostgreSQL-тесты с `--test-concurrency=1` не распараллеливать вручную.
- Одноразовые тестовые контейнеры и данные удаляются сразу после прогона, вместе с anonymous volumes
  (AGENTS §26.1). Тестовый `docker run` получает метку владельца: `docker(['run', ...testContainerLabel(), ...])`
  из [test/helpers/test-containers.js](../../test/helpers/test-containers.js); контейнеры убитых прогонов
  удаляет следующий Docker-тест. Страж — `tools/db-tools/test/test-container-cleanup.test.js` (`test:tools`).
- Unseen-equivalent случай для свободного gameplay-поведения обязателен по AGENTS §24; как его записать в
  критерии — [CHANGE_REQUEST](../process/CHANGE_REQUEST.md).
- Полезные карты: [STACK](STACK.md), [ARCHITECTURE](ARCHITECTURE.md), [DB_SCHEMA](DB_SCHEMA.md),
  [EDGE_CASES](EDGE_CASES.md).
