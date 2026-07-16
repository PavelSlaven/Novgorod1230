# План реализации Repository Intelligence для Codex

## 1. Цель

Развернуть на локальной Windows-машине полностью работоспособный проект «Русь XIII век» и реализовать в PR №13 отдельную комбинированную систему Repository Intelligence для поиска по всему репозиторию.

Система должна:

- сохранять существующий `@rus/knowledge-source` как нормативный RAG-канал с authority, status isolation, SHA-256, line ranges, conflicts и fail-closed provenance;
- использовать Graphify как отдельный локальный граф всех first-party документов и исходного кода проекта;
- предоставлять один обязательный интерфейс для Codex, Cursor и других агентов;
- перед любой разработческой работой выполнять поиск одновременно в RAG и Graphify;
- не смешиваться физически или логически с игровым графом G0–G5, `world_base.graph_nodes`, `world_base.graph_edges` и party state;
- полностью собираться, индексироваться, проверяться и запускаться на локальной Windows-машине;
- публиковаться в GitHub только после локальной реализации, индексации, тестирования и аудита.

Рабочая ветка: `chatgpt/repository-intelligence-graphify`.

Целевой PR: №13, base `main`.

Дополнительные ветки и PR запрещены.

## 2. Обязательные архитектурные решения

### 2.1. Гибрид вместо замены RAG

Существующий RAG не удалять.

Он остаётся единственным владельцем:

- нормативного приоритета;
- статусов `active`, `proposed`, `deprecated`;
- corpus manifest;
- SHA-256 исходных документов;
- точных диапазонов строк;
- зарегистрированных конфликтов;
- fail-closed readiness.

Graphify используется только для:

- AST-структуры исходного кода;
- импортов, вызовов, наследования и межфайловых связей;
- связей документов и кода;
- `query`, `path`, `explain`;
- impact analysis и поиска зависимостей.

Graphify edge с признаком `INFERRED` не является нормативным требованием и не может заменять чтение канонического документа.

### 2.2. Физическое разделение графов

Разрешённые каталоги:

```text
generated/knowledge-source/              # существующие производные graph/RAG нормативного корпуса
graphify-out/                            # native Graphify output
generated/repository-intelligence/       # manifest, coverage, controls и нормализованные сведения нового слоя
```

Запрещено читать, изменять или импортировать Repository Intelligence в:

```text
world_base.graph_nodes
world_base.graph_edges
party_runtime
party G5
map layouts
runtime materialization catalogs
```

Все идентификаторы нового слоя должны использовать отдельный namespace `repo_intel:*` либо сохранять native Graphify ID внутри явно помеченного graph lane.

### 2.3. Локальная машина является рабочей средой

Codex обязан выполнять исследование, изменение файлов, установку зависимостей, запуск баз данных, индексацию, тесты и аудит в локальном checkout на Windows.

GitHub используется только после локальной работы для:

- push локальных коммитов;
- обновления существующего PR №13;
- запуска CI как дополнительного подтверждения;
- code review и итоговой интеграции.

Запрещено использовать GitHub web/API как основную рабочую файловую систему, вносить основной набор изменений удалёнными одиночными коммитами или считать CI заменой локальным проверкам.

## 3. Definition of Done

Работа считается завершённой только при одновременном выполнении всех условий:

1. Свежий локальный checkout ветки PR №13 разворачивается на Windows по документированной процедуре.
2. Установлены и проверены Git, Node.js 22+, npm, Python 3.10+, `uv`, Docker Desktop с Compose и `graphifyy==0.9.17`.
3. Локальные PostgreSQL/NocoDB services запущены и healthy.
4. Развёрнуты необходимые `world_base` и `party_runtime` schemas, роли и данные; `npm run new-game:preflight` проходит на локальной базе.
5. `npm ci` завершён успешно.
6. Канонический corpus проверен и RAG полностью пересобран из текущего commit.
7. Graphify полностью индексирует все eligible tracked first-party документы и код текущего commit.
8. Для каждого tracked файла существует запись `indexed` либо явное проверяемое исключение с причиной.
9. Реализован `@rus/repository-intelligence` и единый CLI.
10. `repo-intel:query` действительно обращается к обоим каналам и раздельно возвращает их результаты.
11. Обязательные project-scoped skills/rules установлены для Codex, Cursor и Agent Skills.
12. `AGENTS.md` и `.github/AGENTS.md` требуют до любой работы выполнить local readiness и hybrid query.
13. Прямой grep, file search и GitHub search разрешены только после успешного RAG + Graphify поиска.
14. Typed failure, stale RAG, stale Graphify graph, missing skill или incomplete coverage приводят к hard block.
15. Repository Intelligence не имеет runtime-зависимости от игровых баз и не смешивается с G0–G5.
16. Targeted, contract, negative, integration, architecture, documentation и полный test suite фактически запущены и прошли.
17. После последнего изменения кода выполнена повторная полная индексация и stale checks.
18. Отдельный агент-критик вернул `PASS` либо допустимый `PASS WITH NOTES`.
19. Все изменения находятся в одном PR №13.
20. В рабочем `README.md` зафиксированы команды, результаты, решения, аудит, ограничения и порядок интеграции.

## 4. Этап 0 — обязательное нормативное чтение

### Действия

До изменения файлов полностью прочитать из актуального GitHub `main`:

```text
AGENTS.md
.github/AGENTS.md
data/knowledge-source/corpus/DOCUMENTS/development_rules.txt
data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt
data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md
data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md
data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md
docs/architecture/KNOWLEDGE_SOURCE_POLICY.md
packages/knowledge-source/MODULE.md
docs/modules/KNOWLEDGE_SOURCE.md
```

Затем изучить текущую реализацию, публичные exports, CLI, storage adapters, materializer, tests, registries и CI workflow.

### Результат

В рабочем `README.md` записаны:

- commit SHA `main`, относительно которого начата работа;
- SHA или blob SHA каждого обязательного нормативного файла;
- затронутые подсистемы;
- границы изменения;
- критерии готовности;
- обнаруженные конфликты.

### Критерии завершения

- все обязательные документы действительно прочитаны полностью;
- решение hybrid подтверждено нормативами;
- существующая реализация не принята за норматив при конфликте;
- игровой граф исключён из области новой системы.

## 5. Этап 1 — локальный Git и Windows preflight

### Действия

Работать из PowerShell 7 в локальном checkout.

Проверить:

```powershell
git --version
git rev-parse --show-toplevel
git remote -v
git fetch --prune origin
git branch --show-current
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Требования:

- текущая ветка — `chatgpt/repository-intelligence-graphify`;
- remote указывает на `PavelSlaven/Novgorod1230`;
- worktree чист либо все существующие изменения инвентаризированы и относятся к PR №13;
- чужие или несвязанные изменения не перезаписываются;
- ветка синхронизирована с согласованным `main` без создания второго PR.

Проверить инструменты:

```powershell
node --version
npm --version
python --version
py --version
uv --version
docker version
docker compose version
graphify --version
```

Минимальные версии:

```text
Node.js >= 22
Python >= 3.10
graphifyy = 0.9.17
PostgreSQL image = 16
```

Установить npm dependencies:

```powershell
npm ci
```

### Результат

Создать machine-readable local readiness report с:

- OS и PowerShell version;
- tool versions;
- repository root;
- branch;
- HEAD SHA;
- base SHA;
- dependency install status;
- Docker status;
- Graphify status.

Секреты, абсолютные user paths и пароли в tracked report не записывать.

### Критерии завершения

- все инструменты доступны;
- version pins соблюдены;
- `npm ci` проходит;
- локальная ветка и область изменений подтверждены;
- readiness failure останавливает дальнейшую реализацию.

## 6. Этап 2 — локальное развёртывание проекта и баз данных

### Действия

Использовать Docker Desktop и repository-owned Compose/configuration.

Сначала изучить фактические database contracts и env resolution. Не предполагать, что одного автоматически созданного `POSTGRES_DB` достаточно для runtime.

Подготовить локальный `.env` на основе `.env.example`. Файл `.env` не коммитить.

Обязательные классы настроек:

```text
POSTGRES_*
WORLD_DB_ADMIN_URL
DATABASE_URL или RUS_WORLD_DATABASE_URL
PARTY_DATABASE_URL или RUS_PARTY_DATABASE_URL
WORLD_DATA_SOURCE=postgres
RUS_RUN_PARTY_MIGRATIONS
DEEPSEEK_* только для LLM smoke tests
```

Если текущий Compose не создаёт все требуемые logical databases и roles, добавить в PR идемпотентный local-development provisioning:

- PostgreSQL 16;
- world database/schema;
- read-only world role;
- party database/schema;
- party writer role;
- NocoDB, если он остаётся частью утверждённого локального development stack.

Provisioning должен быть повторяемым и не зависеть от ручных SQL-действий, не представленных в репозитории.

Запустить:

```powershell
docker compose up -d
docker compose ps
npm run world-db:schema-check
npm run world-db:schema-doc-check
npm run world-db:seed
npm run world-db:prepare-staging
npm run world-db:import:dry-run
npm run world-db:import:apply
npm run party-db:seed
npm run new-game:preflight
```

`world-db:import:apply` выполнять только против локальной development database после успешного dry-run и проверки connection target. Запрещено направлять apply в operator/production database.

Проверить:

- containers healthy;
- обязательные world tables существуют;
- read-only grants соответствуют DDL;
- party tables существуют;
- необходимая Новгородская G1–G4 data фактически импортирована;
- runtime preflight видит world и party databases;
- NocoDB подключается только к локальной базе.

### Результат

Документированный Windows database runbook и автоматизированные локальные setup/check scripts.

Предпочтительные поверхности:

```text
scripts/setup-local-development.ps1
scripts/check-local-development.ps1
scripts/reset-local-development.ps1
```

 destructive reset должен требовать явного параметра подтверждения и работать только с локальным Compose project.

### Критерии завершения

- fresh local database deployment воспроизводим;
- повторный setup идемпотентен;
- `new-game:preflight` проходит;
- world runtime остаётся read-only;
- party writes направлены только в party schema/database;
- секреты не попали в Git;
- локальные базы не требуются CI consumer'ам, которым они не нужны.

## 7. Этап 3 — установка Graphify и project-scoped skills

### Действия

Установить pinned package:

```powershell
uv tool install "graphifyy==0.9.17"
graphify --version
```

Не устанавливать одноимённые неофициальные PyPI packages.

Установить project-scoped integrations из корня репозитория:

```powershell
graphify install --project --platform codex
graphify cursor install --project
graphify install --project --platform agents
```

Для Codex проверить пользовательский файл:

```text
%USERPROFILE%\.codex\config.toml
```

Требуемая настройка:

```toml
[features]
multi_agent = true
```

Repository scripts не должны молча изменять пользовательский `config.toml`. Проверка должна вернуть понятную инструкцию и typed failure.

Изучить generated project files installer'а. Закоммитить только project-scoped skill/rule/hook files, которые:

- не содержат absolute machine paths;
- не содержат секреты;
- воспроизводимы;
- действительно поддерживаются Graphify 0.9.17;
- не изменяют unrelated agent rules.

### Критерии завершения

- Graphify 0.9.17 доступен в новом PowerShell process;
- Codex skill существует и обнаруживается;
- Cursor always-on rule существует;
- generic Agent Skill существует;
- install-check обнаруживает missing/wrong version/missing skill;
- user-global install без project files не считается достаточным.

## 8. Этап 4 — полный inventory индексируемых файлов

### Цель

Доказать, что система охватывает весь first-party код и документы, а не случайное подмножество.

### Действия

Построить deterministic inventory из `git ls-files`.

Каждый tracked файл классифицировать:

```text
indexed_by_rag
indexed_by_graphify
indexed_by_both
excluded_secret_or_local_config
excluded_dependency_or_cache
excluded_generated_derivative
excluded_binary_or_archive
excluded_runtime_or_database_state
excluded_with_explicit_policy
```

Обязательный Graphify scope:

- `apps/**`;
- `packages/**`;
- `tools/**`;
- `scripts/**`;
- `src/**`;
- `test/**`;
- `schemas/**`;
- `infra/**` source files;
- `.github/**` source/config/docs;
- root configs;
- canonical documents;
- ordinary project documentation;
- tests, fixtures and contract maps;
- legacy first-party code/documents, если они не исключены отдельным явным нормативным решением.

Нельзя скрыто исключать каталог только потому, что он создаёт шум. Любое исключение должно иметь причину и тест.

Допустимые обязательные исключения:

- `.env` и credentials;
- private keys;
- `node_modules`;
- caches;
- database dumps и party saves;
- runtime artifacts;
- `graphify-out` для предотвращения рекурсии;
- generated repository-intelligence output;
- большие производные artifacts, которые не являются source of truth.

Рассмотреть удаление общего исключения `legacy/`, если пользовательское требование «весь код и все документы» невозможно выполнить при его наличии. Если legacy остаётся исключённым, в README требуется отдельное нормативное обоснование и точный список потерянного покрытия.

### Результат

Создать generated coverage manifest, например:

```text
generated/repository-intelligence/source-coverage.json
```

Минимальные поля:

```json
{
  "schema_version": "rus.repository_intelligence_source_coverage.v1",
  "git_commit": "...",
  "tracked_file_count": 0,
  "eligible_file_count": 0,
  "graphify_indexed_count": 0,
  "rag_registered_count": 0,
  "excluded_count": 0,
  "files": []
}
```

### Критерии завершения

- 100% tracked files классифицированы;
- 100% eligible files индексируются Graphify;
- 100% registered canonical documents имеют RAG coverage metadata;
- нет неизвестных или silently skipped files;
- exclusions reviewable и протестированы;
- manifest привязан к текущему Git commit.

## 9. Этап 5 — полная пересборка и проверка RAG

### Действия

Использовать только штатный knowledge-source pipeline:

```powershell
npm run knowledge:inventory
npm run knowledge:check-corpus
npm run knowledge:import
npm run knowledge:generate
npm run knowledge:check
npm run knowledge:status
npm run knowledge:controls
```

Не редактировать вручную:

```text
generated/knowledge-source/graph
generated/knowledge-source/rag
```

Проверить:

- corpus manifest SHA;
- retrieval policy completeness;
- active-only default visibility;
- proposed/deprecated explicit access;
- semantic coverage dispositions;
- conflicts;
- deterministic regeneration;
- control queries;
- source line provenance.

### Критерии завершения

- нет `required_before_merge` blockers;
- registered corpus и generated RAG согласованы;
- контрольные запросы проходят;
- повторная генерация не создаёт diff;
- RAG artifact привязан к текущему corpus manifest;
- stale state приводит к typed failure.

## 10. Этап 6 — полная Graphify индексация

### Действия

Перед build проверить `.graphifyignore` и source coverage inventory.

Выполнить полный build, не incremental:

```powershell
graphify . --no-viz
```

Если Graphify semantic pass документов запускается через Codex skill, выполнить эквивалентный `$graphify .` workflow и зафиксировать фактическую команду/режим. Если используется headless backend, provider должен быть явно настроен локально; ключ не коммитить.

После полного build допускается проверить incremental mode:

```powershell
graphify . --update --no-viz
```

Создать repository manifest:

```text
generated/repository-intelligence/manifest.json
```

Минимальные поля:

- repository identity;
- Git commit SHA;
- Git tree SHA;
- Graphify package/version;
- build command/mode;
- `.graphifyignore` digest;
- source coverage digest;
- graph artifact SHA-256;
- node/edge counts;
- indexed source counts;
- build timestamp только как metadata, не влияющая на reproducible digest;
- schema version.

Проверить graph JSON:

- parseable;
- source paths относительны repository root;
- нет path escape;
- нет secrets;
- нет database dumps или party saves;
- нет рекурсивной индексации `graphify-out`;
- нет namespace collision с G0–G5;
- все eligible source files присутствуют либо объяснимо агрегированы Graphify.

### Критерии завершения

- full graph построен на текущем HEAD;
- manifest соответствует graph artifact;
- stale commit/config/source inventory обнаруживается;
- incremental rebuild после отсутствия изменений не ломает manifest;
- graph query/path/explain работают локально;
- игровой runtime не зависит от Python или Graphify.

## 11. Этап 7 — реализация `@rus/repository-intelligence`

### TDD

Сначала написать падающие contract/negative tests, затем минимальную реализацию.

### Планируемая структура

```text
packages/repository-intelligence/
  MODULE.md
  package.json
  src/
    index.js
    cli.js
    domain/
    services/
    adapters/
  test/
```

### Публичные порты

```text
KnowledgeLane
RepositoryGraphLane
RepositoryIntelligenceService
RepositoryIntelligenceStorage
ProcessRunner
GitRevisionReader
```

Все внешние зависимости должны передаваться явно. Смысловой service не должен напрямую вызывать `child_process`, файловую систему, Git или knowledge-source globals.

### Команды

```powershell
npm run repo-intel:install-check
npm run repo-intel:status
npm run repo-intel:query -- --query "..." --mode hybrid
npm run repo-intel:read -- --document-id <id>
npm run repo-intel:path -- --from <node> --to <node>
npm run repo-intel:explain -- --node <node>
npm run repo-intel:controls
npm run repo-intel:build
npm run repo-intel:coverage
```

### Обязательный query workflow

```text
validate request
→ verify local readiness
→ query normative RAG lane
→ query Graphify lane
→ normalize both responses independently
→ compose immutable hybrid envelope
→ return provenance/readiness/conflicts
```

Graphify failure не должен превращаться в RAG-only success для mandatory hybrid mode. RAG failure не должен превращаться в Graphify-only success. Для диагностических режимов допускается явный `mode=normative|code`, но правила агентов используют только `mode=hybrid`.

### Query result

```json
{
  "schema_version": "rus.repository_intelligence_query.v1",
  "query": "...",
  "mode": "hybrid",
  "normative_results": [],
  "graph_results": [],
  "connections": [],
  "conflicts": [],
  "readiness": {},
  "provenance": {}
}
```

Normative result сохраняет:

- `document_id`;
- status;
- normative priority;
- SHA-256;
- canonical path;
- section;
- start/end line;
- retrieval method;
- related documents/contracts/modules;
- conflict metadata.

Graph result сохраняет:

- graph node ID;
- source path;
- source range;
- symbol/node type;
- relation type;
- `EXTRACTED|INFERRED|AMBIGUOUS` confidence;
- path/hop information;
- graph artifact digest.

### Typed failures

Минимальный набор:

```text
LOCAL_ENVIRONMENT_NOT_READY
KNOWLEDGE_SOURCE_NOT_READY
RAG_STALE
GRAPHIFY_NOT_INSTALLED
GRAPHIFY_VERSION_MISMATCH
GRAPHIFY_SKILL_MISSING
REPOSITORY_GRAPH_MISSING
REPOSITORY_GRAPH_INVALID
REPOSITORY_GRAPH_STALE
SOURCE_COVERAGE_INCOMPLETE
GRAPH_PATH_OUTSIDE_REPOSITORY
GAME_GRAPH_NAMESPACE_COLLISION
HYBRID_LANE_FAILED
INVALID_ARGUMENT
```

### Критерии завершения

- package имеет одну ответственность;
- public API зарегистрирован;
- inputs/outputs immutable;
- нет hidden I/O;
- CLI JSON contract стабилен;
- stdout содержит success JSON;
- stderr содержит typed failure JSON;
- argument error exit code отличим от readiness failure;
- оба канала реально вызываются в hybrid mode;
- нет semantic fallback.

## 12. Этап 8 — обязательные правила агентов

### Обновить

```text
AGENTS.md
.github/AGENTS.md
.cursor/rules/knowledge-rag.mdc либо новый repository-intelligence rule
.agents/skills/graphify/SKILL.md
Codex project-scoped skill/hook files
```

### Правило до любой работы

Агент обязан:

```text
1. работать в локальном checkout;
2. проверить актуальность Git branch и local environment;
3. проверить databases и required services;
4. выполнить repo-intel:install-check;
5. выполнить repo-intel:status;
6. сформулировать конкретную информационную потребность;
7. выполнить repo-intel:query в mode=hybrid;
8. полностью прочитать обязательные и найденные профильные нормативы;
9. выполнить path/explain для затронутого кода и зависимостей;
10. только после этого использовать grep/file search и менять файлы.
```

Переходный bootstrap до реализации CLI:

```powershell
npm run knowledge:status
npm run knowledge:query -- --query "конкретная потребность"
graphify query "та же конкретная потребность"
```

Переходный режим действует только внутри PR №13 до появления проходящего `repo-intel:query` и должен быть удалён либо явно закрыт перед merge.

### Обязательная фиксация evidence

Для каждой задачи в рабочем README записывать:

- точный query;
- RAG top results;
- Graphify nodes/paths;
- полностью прочитанные документы;
- обнаруженные реализации/tests/call sites;
- readiness status;
- gaps/conflicts.

### Hard block

Работа не продолжается при:

- stale local checkout;
- неподготовленной локальной среде;
- недоступной локальной базе, когда задача зависит от неё;
- missing/wrong Graphify;
- отсутствующих project skills;
- stale/missing Graphify graph;
- stale/blocked RAG;
- incomplete source coverage;
- недоступном обязательном нормативе.

Запрещено обходить block прямым GitHub search, похожим документом, старым graph artifact, legacy copy или предположением.

### Критерии завершения

- Codex автоматически видит правило;
- Cursor автоматически видит правило;
- generic Agent Skills видят правило;
- tests подтверждают наличие обязательных команд в instruction surfaces;
- rules не противоречат друг другу;
- GitHub publication описана как финальная стадия, а не рабочая среда.

## 13. Этап 9 — Windows automation и cross-platform compatibility

### Действия

Добавить Windows-first scripts, но сохранить возможность запуска core CLI на Linux CI.

PowerShell отвечает за orchestration local workstation setup. Node CLI отвечает за cross-platform contracts и проверки.

Проверить:

- разрешение `.cmd`/`.exe` в `spawnSync` на Windows;
- пробелы и Unicode в repository path;
- `PATH` после `uv tool install`;
- PowerShell exit codes;
- CRLF/LF tolerance;
- path separators;
- отсутствие Bash-only assumptions в npm scripts;
- no shell injection: пользовательские query передаются как arguments, не конкатенируются в shell command.

### Критерии завершения

- setup/check scripts работают в PowerShell 7;
- Node tests эмулируют win32 path/process cases;
- CI Linux не ломается;
- commands документированы отдельно для PowerShell;
- failure messages содержат исправляющее действие.

## 14. Этап 10 — тесты

### Обязательные тесты

#### Contract

- inputs/outputs каждой public function;
- immutable results;
- CLI schemas;
- exit codes;
- stdout/stderr separation.

#### Unit

- hybrid composition;
- provenance retention;
- conflict retention;
- manifest digest;
- stale detection;
- source coverage classification;
- path normalization.

#### Negative

- Graphify missing;
- wrong version;
- missing Codex/Cursor/Agent skill;
- malformed graph JSON;
- stale graph commit;
- changed `.graphifyignore`;
- missing eligible source file;
- unknown document ID;
- stale RAG;
- path escape;
- secret/dump included;
- game graph namespace collision;
- one hybrid lane failed;
- direct fallback attempted.

#### Integration

- real current knowledge-source + fixture Graphify graph;
- full local Graphify artifact controls;
- package CLI subprocess;
- fresh local PostgreSQL schemas;
- agent instruction contract;
- generated artifact reproducibility.

#### Architecture

- package not imported by game runtime;
- no import from gameplay graph packages;
- no database access from repository-intelligence domain/service;
- no Graphify dependency in production runtime dependency graph;
- no repository graph artifact under world/party paths.

### Команды

Добавить и выполнить:

```powershell
npm run test:repository-intelligence
npm run test:knowledge-source
npm run architecture:check
npm run docs:check
npm run repo-intel:controls
npm run repo-intel:coverage
```

### Критерии завершения

- каждый новый behavior сначала имел падающий test;
- все target tests проходят;
- negative tests доказывают fail-closed;
- integration использует public interfaces;
- tests не требуют hidden global state.

## 15. Этап 11 — документация и проектные реестры

Обновить в том же PR:

```text
packages/repository-intelligence/MODULE.md
MODULE_INDEX.md
docs/modules/TOOLS_INVENTORY.md
docs/modules/KNOWLEDGE_SOURCE.md
docs/architecture/KNOWLEDGE_SOURCE_POLICY.md
docs/architecture/REPOSITORY_INTELLIGENCE.md
docs/setup/REPOSITORY_INTELLIGENCE_AGENT_SETUP.md
docs/migration/contracts/* при необходимости
README.md
package.json
AGENTS.md
.github/AGENTS.md
.cursor/rules/*
```

Если нормативные документы canonical corpus меняются:

- обновить manifest и retrieval policy штатным pipeline;
- пересобрать generated knowledge graph/RAG;
- обновить control queries;
- не редактировать generated artifacts вручную.

### Критерии завершения

- новый reusable package зарегистрирован во всех обязательных реестрах;
- public API и contracts документированы;
- Windows runbook воспроизводим;
- query-first и local-first правила одинаковы во всех agent surfaces;
- single PR README содержит полную историю.

## 16. Этап 12 — финальная локальная индексация

После последнего изменения code/docs/rules:

```powershell
npm run knowledge:generate
npm run knowledge:check
graphify . --no-viz
npm run repo-intel:coverage
npm run repo-intel:status
npm run repo-intel:controls
```

Затем проверить отсутствие незакоммиченного generated drift:

```powershell
git status --short
git diff --check
```

### Критерии завершения

- RAG и Graphify соответствуют одному текущему HEAD;
- manifest digests актуальны;
- source coverage 100% classified;
- повторный build не создаёт неожиданный diff;
- stale checks проходят.

## 17. Этап 13 — полная локальная проверка проекта

Запустить минимум:

```powershell
npm run world-db:schema-check
npm run world-db:schema-doc-check
npm run new-game:preflight
npm run test:repository-intelligence
npm run test:knowledge-source
npm run architecture:check
npm run docs:check
npm test
```

Выполнить smoke запуск проекта:

```powershell
npm start
```

Либо, если предусмотрен отдельный health command, запустить server, проверить health endpoint и корректно остановить process.

CLI smoke:

```powershell
npm run start:cli
```

Не заявлять smoke PASS, если process не запускался фактически.

### Критерии завершения

- полный test suite проходит;
- server/CLI smoke подтверждены;
- PostgreSQL integration проходит локально;
- generated artifacts воспроизводимы;
- Browser E2E честно отмечен PASS или SKIP с точной причиной;
- фактические команды и результаты записаны в README.

## 18. Этап 14 — независимый аудит

Изменение затрагивает несколько модулей, CLI, agent rules, generated artifacts и архитектуру, поэтому аудит обязателен.

Передать отдельному агенту-критику:

- исходное требование;
- этот план;
- обязательные нормативы;
- полный diff PR №13;
- package contracts;
- manifests и coverage;
- agent rules;
- tests;
- результаты полного local run;
- известные ограничения;
- предыдущий audit report при повторной проверке.

При результате:

```text
CHANGES REQUIRED
```

или:

```text
REJECT
```

выполнить:

```text
исправление
→ targeted tests
→ full required tests
→ повторная индексация
→ повторный аудит
```

### Критерии завершения

- итоговый результат `PASS` либо допустимый `PASS WITH NOTES`;
- все BLOCKER/CRITICAL/MAJOR закрыты повторным аудитом;
- после последнего аудита нет непроверенных behavioral changes.

## 19. Этап 15 — локальный commit и публикация в GitHub

Только после локального завершения:

```powershell
git status --short --branch
git diff --check
git diff --stat
git add <только файлы PR13>
git commit -m "feat: add hybrid repository intelligence"
git push -u origin chatgpt/repository-intelligence-graphify
```

Обновить существующий PR №13. Новый PR не создавать.

PR body должен содержать:

- цель;
- архитектурное решение;
- Windows setup;
- database setup;
- RAG и Graphify coverage;
- agent installation/rules;
- список изменённых файлов;
- локальные проверки;
- CI checks;
- audit result;
- ограничения;
- порядок интеграции.

CI используется как дополнительное подтверждение. Если CI расходится с локальным run, конфликт расследовать; локальный результат не переписывать задним числом.

## 20. Финальный отчёт Codex

Codex должен вернуть:

1. Commit SHA `main`, от которого начата работа.
2. Финальный branch HEAD SHA.
3. Полный список изученных обязательных и профильных документов.
4. Полный список изменённых файлов.
5. Описание local Windows environment и versions.
6. Описание развернутых containers/databases/schemas/roles.
7. RAG corpus/coverage/status/control results.
8. Graphify node/edge/file coverage и manifest digests.
9. Результаты каждого фактически выполненного test/check/smoke command.
10. Результат независимого аудита.
11. Ссылку на PR №13.
12. Известные gaps, ограничения и deferred tasks.

Запрещено писать «всё прошло», если не приложены фактические команды и результаты.
