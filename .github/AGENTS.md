# Обязательные правила работы

Корневой `AGENTS.md` является основной точкой входа и полностью обязателен. Этот файл уточняет тот же порядок для GitHub-, Codex- и Cursor-oriented workflows. При смысловом расхождении работа останавливается до синхронизации файлов.

Канонические правила: [AGENTS.md](../AGENTS.md).

## Канонический источник

Канонический репозиторий: `PavelSlaven/Novgorod1230`, актуальное состояние — ветка `main`.

Перед работой агент фиксирует repository root, remote, branch и commit SHA. Локальные копии, generated artifacts, Google Drive и ранее загруженные файлы не заменяют GitHub `main` как источник актуального состояния.

## Обязательное чтение

Перед любой задачей полностью прочитай:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`.

Затем через `llm_documentation_navigation.md` выбери и полностью прочитай профильные нормативы.

Для database/DDL/import/category/template/profile/materialization/G5/NPC/item/container/property/transport/bounded-decision задач дополнительно обязателен:

- `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`.

Если задача затрагивает базу данных, DDL, импорт, категории, шаблоны, профили, materialization rules, G5, NPC, предметы, контейнеры, имущество, транспорт или bounded decisions, обязательно полностью прочитай `world_base_materialization_table_requirements.md`.

Для G0–G4 задач дополнительно обязательны:

- `data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt`;
- актуальный региональный `G1_SEMANTIC_CATALOG.md`;
- для Новгорода — `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`.

При изменении структуры игрового графа, импорта или DDL дополнительно обязательны:

- `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- `world_base_materialization_table_requirements.md`.

Недоступный обязательный документ является hard block.

## Локальная машина — обязательная рабочая среда

Разработка выполняется в локальном checkout. На Windows используется PowerShell 7.

До любой работы агент проверяет:

```powershell
git fetch --prune origin
git status --short --branch
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
```

Также агент обязан:

1. подтвердить remote и ветку;
2. инвентаризировать локальные изменения и не перезаписывать чужие;
3. выполнить `npm ci`, если зависимости отсутствуют или lockfile изменился;
4. проверить Docker services и локальные базы, если задача от них зависит;
5. не выполнять migrations/import/seed против operator или production database;
6. записать readiness и blockers в единственный рабочий `README.md` задачи.

GitHub web/API не используется как основная рабочая файловая система. Основные изменения, генерация artifacts, tests и аудит выполняются локально. Push и обновление PR выполняются после локального завершения.

## Обязательный двойной поиск RAG + Graphify

Перед grep, file search, GitHub code search, широким чтением репозитория или изменением файлов агент обязан искать контекст одновременно в:

1. нормативном RAG `@rus/knowledge-source`;
2. отдельном repository graph Graphify.

Целевой порядок после реализации PR №13:

```powershell
npm run repo-intel:status
npm run repo-intel:query -- --query "конкретная информационная потребность"
```

Bootstrap-порядок, пока единый CLI реализуется:

```powershell
npm run knowledge:status
npm run knowledge:query -- --query "конкретная информационная потребность"
npm run knowledge:read -- --document-id <document_id>
graphify query "та же конкретная информационная потребность"
```

Для связей используются `graphify path` и `graphify explain`.

RAG определяет нормативную authority, statuses, SHA-256, conflicts и source ranges. Graphify показывает topology кода и документов. Graphify `INFERRED` edge не является нормативом. Обязательные и профильные документы после обнаружения читаются полностью.

Прямой code search разрешён только после двойного поиска и только для точного изучения implementations, contracts, call sites, dependencies и tests.

В рабочем README фиксируются query, результаты обоих каналов, прочитанные документы, найденные nodes/paths/modules/tests, readiness, gaps и conflicts.

For PR #13 MVP, a `degraded` knowledge-source is a visible warning: agents account for incomplete retrieval and fully read mandatory norms, but navigation remains available. Hard blocks are an unavailable or invalid knowledge response, a required document that cannot be read, a missing/stale Graphify graph, or a Graphify version mismatch. Full coverage, document indexing, and repairing existing semantic gaps are future work, not MVP gates.

Если candidate set пуст, этап обязан создать типизированный data gap и выполнить hard block. LLM repair в этом случае запрещён. Repair допускается только для исправления формата, контракта или отклонённого LLM-ответа в пределах неизменённого входа и существующего candidate set. В bounded decision workflow LLM выбирает только один `option_id` и `command_token` из предоставленного конечного option set; это не заменяет отдельные нормативные процедуры генерации персонажа игрока, аудита, разрешённой конкретизации key entity и создания прозы. Для любой задачи G0–G4 обязательно прочитай `map_g0_g4_workflow.txt` и актуальный `G1_SEMANTIC_CATALOG.md`. При изменении структуры графа, узлов, рёбер, координат, полей, импорта или DDL дополнительно прочитай `read_only_database_and_graph_architecture.md`, `SCHEMA_REFERENCE.md` и `world_base_materialization_table_requirements.md`.

## Graphify skills

Требуется pinned package:

```powershell
uv tool install "graphifyy==0.9.17"
```

Обязательны project-scoped integrations:

```powershell
graphify install --project --platform codex
graphify cursor install --project
graphify install --project --platform agents
```

Для parallel extraction Codex пользователь вручную включает в `%USERPROFILE%\.codex\config.toml`:

```toml
[features]
multi_agent = true
```

Repository scripts не изменяют пользовательский config автоматически. User-global install без project-scoped files недостаточен.

## Изоляция от игрового графа

Repository Intelligence не является частью game runtime.

Запрещено:

- смешивать `graphify-out/graph.json` с G0–G5;
- импортировать repository graph в `world_base` или party database;
- использовать repository nodes как world facts, routes или materialization candidates;
- читать или изменять `world_base.graph_nodes`, `world_base.graph_edges` или party G5 через Repository Intelligence;
- добавлять Python/Graphify dependency в production game runtime.

Раздельные области:

```text
generated/knowledge-source/
graphify-out/
generated/repository-intelligence/
world_base и party_runtime — вне Repository Intelligence
```

## Приоритет источников

1. `code_driven_world_materialization_architecture.md`;
2. профильный норматив подсистемы;
3. `development_rules.txt`;
4. DDL, schemas и formal contracts;
5. navigation docs;
6. implementation;
7. comments/examples.

Код, RAG result и Graphify edge не отменяют более приоритетный норматив.

## Перед изменением кода

1. Изучи текущую implementation, public API, contracts, schemas, validators, call sites и tests.
2. Проверь module maps и registries, чтобы не создать duplicate implementation.
3. Зафиксируй scope и Definition of Done.
4. Работай через TDD: Red → Green → Refactor.
5. Не выполняй unrelated refactoring.
6. Не меняй public contracts, orchestration, DDL или save format без нормативного основания.

Каждый этап имеет formal input/output/errors/dependencies, не читает hidden global state, не изменяет input, не запускает следующий этап и не выполняет скрытые I/O/DB/network/LLM вызовы.

## Оркестрация и один PR

Одна главная LLM владеет общим планом, единственной локальной веткой и единственным PR. Субагенты выполняют только назначенный шаг, не меняют план, не создают другой PR и не аудитят собственный код.

Зависимые шаги выполняются последовательно:

```text
план
→ исполнитель
→ tests/checks
→ независимый критик
→ исправления
→ повторные tests
→ повторная индексация
→ повторный аудит
→ финальная приёмка
```

## Проверки и аудит

После изменения фактически запускаются относящиеся tests, static/type/lint checks, architecture checks, docs checks, database checks и generated reproducibility. Готовое интеграционное изменение проходит полный `npm test`.

Агент-критик вызывается по `code_critic_invocation_rule.txt`. После `CHANGES REQUIRED` или `REJECT` обязательны исправление, повторные checks, повторная индексация при изменении code/docs и повторный аудит до `PASS` или допустимого `PASS WITH NOTES`.

## Публикация в GitHub

До push локально должны быть завершены:

1. implementation;
2. RAG/Graphify rebuild для изменённых индексируемых файлов;
3. mandatory tests/checks;
4. независимый аудит;
5. `git status`, `git diff --check` и staged scope review;
6. обновление единственного рабочего `README.md`.

Только затем выполняются local commit и push в существующую ветку/PR. GitHub CI является дополнительным подтверждением.

## Итоговый отчёт

Укажи изученные нормативы и файлы, RAG/Graphify queries, изменённые файлы, реализованные требования, локальные services/databases, фактически запущенные commands и результаты, audit result, branch/commit/PR, gaps и ограничения.

Не объявляй работу завершённой без local readiness, двойного поиска, обязательных tests, актуальной индексации и требуемого аудита.
