# PR13: Repository Intelligence

## Статус

`in_progress`

Рабочая ветка: `chatgpt/repository-intelligence-graphify`  
Базовая ветка: `main`  
Единственный рабочий журнал задачи: этот `README.md`.

## Цель

Создать отдельную комбинированную систему поиска и навигации по всему репозиторию проекта:

- каноническим нормативным документам;
- обычной документации;
- исходному коду;
- контрактам, схемам, тестам и конфигурации;
- связям между документами, модулями, символами и точками вызова.

Система должна стать обязательным read-only интерфейсом для агентов разработки, Codex и Cursor и не должна смешиваться с игровым графом мира G0–G5.

## Исходное состояние

Текущий `@rus/knowledge-source` обеспечивает fail-closed доступ к каноническому нормативному корпусу, проверяет manifest/SHA-256/provenance и предоставляет ranked retrieval по committed RAG chunks. Он не индексирует весь код проекта и не предоставляет полноценную навигацию по AST-связям.

В репозитории уже существуют generated knowledge graph и RAG для нормативного корпуса. Они являются производными представлениями канонических документов и не являются игровым графом, однако их область ограничена knowledge corpus.

Graphify рассматривается как внешний локальный движок репозиторного графа. Зафиксированная исследуемая версия:

- package: `graphifyy==0.9.17`;
- CLI: `graphify`;
- upstream branch: `Graphify-Labs/graphify@v8`;
- upstream commit на момент проектирования: `ecf1416a7e0ef3a2273a2ad9c796c4e573ca8037`;
- license: MIT.

## Принятое архитектурное решение

Текущий нормативный RAG не удаляется и не заменяется Graphify.

Причины:

1. `@rus/knowledge-source` владеет нормативным приоритетом, статусами `active/proposed/deprecated`, corpus manifest, SHA-256 и точными source locations.
2. Graphify эффективен для AST-графа, межфайловых связей, path/explain/query и общего обзора кода, но не является источником нормативной authority.
3. Замена текущего RAG одним графом ослабила бы fail-closed provenance и status isolation.
4. Гибридный слой может использовать сильные стороны обоих движков без смешения контрактов.

Целевая схема:

```text
agent / Codex / Cursor
        │
        ▼
@rus/repository-intelligence CLI
        │
        ├── normative lane
        │     └── @rus/knowledge-source RAG/read/status/controls
        │
        ├── repository graph lane
        │     └── Graphify code+docs graph/query/path/explain
        │
        └── hybrid result composer
              └── typed immutable envelope + provenance
```

## Жёсткая граница с игровым графом

Repository Intelligence запрещено:

- читать или изменять `world_base.graph_nodes`, `world_base.graph_edges` и party G5;
- использовать игровые node IDs как repository graph IDs;
- публиковать repository graph через игровой runtime/UI;
- рассчитывать игровые маршруты, соседство, доступность или расстояние;
- импортировать Graphify output в world/party database;
- использовать общий каталог, manifest или namespace с G0–G5.

Целевые каталоги должны быть раздельными:

```text
generated/knowledge-source/*          # существующий нормативный graph/RAG
generated/repository-intelligence/*   # новый graph кода и всех документов
world_base / party_runtime             # игровой граф и состояние, вне этой системы
```

## План реализации

### RI-01. Нормативы и исследование

Вход:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- обязательные нормативы;
- knowledge-source policy, module и contracts;
- текущие CLI и tests;
- Graphify README, package metadata, skill/install behavior и license.

Результат:

- зафиксированные границы;
- решение hybrid вместо замены RAG;
- version pin Graphify;
- список обязательных интеграций.

Критерии готовности:

- источник истины нормативов не меняется;
- игровой граф явно исключён;
- внешняя зависимость и лицензия зафиксированы.

### RI-02. Новый модуль `@rus/repository-intelligence`

Добавить отдельный package с публичными портами:

- `KnowledgeLane` — адаптер над `@rus/knowledge-source`;
- `RepositoryGraphLane` — адаптер над Graphify CLI/graph artifact;
- `RepositoryIntelligenceService` — status/query/read/path/explain;
- immutable typed results;
- typed failures без semantic fallback.

Планируемые команды:

```text
npm run repo-intel:status
npm run repo-intel:query -- --query "..."
npm run repo-intel:read -- --document-id <id>
npm run repo-intel:path -- --from <node> --to <node>
npm run repo-intel:explain -- --node <node>
npm run repo-intel:controls
npm run repo-intel:build
npm run repo-intel:install-check
```

Основной query contract:

```text
query
mode = normative | code | hybrid
top_k
allowed_document_ids?
statuses?
graph_depth?
```

Результат обязан раздельно возвращать:

```text
normative_results
graph_results
connections
conflicts
readiness
provenance
```

Нормативные результаты не должны терять status/priority/SHA/line ranges. Graphify `INFERRED` edge не может становиться нормативным утверждением.

### RI-03. Graphify adapter и reproducibility

Добавить:

- version lock;
- проверку установленной версии;
- deterministic project root и output path;
- `.graphifyignore`;
- manifest с commit/tree/config digests;
- stale detection;
- typed error, если Graphify отсутствует или graph stale;
- read-only query path без автоматической скрытой пересборки.

Graph build является явной tool-командой. Runtime игрового приложения не зависит от Python/Graphify.

### RI-04. Обязательные agent skills и правила

Проект должен содержать или проверять project-scoped Graphify integrations:

```bash
uv tool install graphifyy==0.9.17
graphify install --project --platform agents
graphify install --project --platform codex
graphify cursor install --project
```

Для Codex дополнительно документируется обязательный `multi_agent = true` в пользовательском `~/.codex/config.toml`; repository preflight не изменяет пользовательский файл автоматически.

Планируемые committed surfaces:

- `.agents/skills/graphify/SKILL.md` и references;
- `.cursor/rules/graphify.mdc`;
- Codex project hook/config, если upstream installer создаёт безопасный project-scoped файл;
- repository-owned правила hybrid query-first.

`AGENTS.md` и `.github/AGENTS.md` будут изменены так, чтобы перед прямым поиском агент выполнял:

```text
repo-intel:install-check
→ repo-intel:status
→ repo-intel:query
→ полное чтение обязательных нормативов
→ scoped graph navigation / code search
```

Typed failure, stale index, missing skill или provenance blocker являются hard block для действий, зависящих от поиска.

### RI-05. Документация и реестры

Обновить в том же PR:

- module documentation;
- tools inventory;
- contract map;
- dependency/module registries, если применимо;
- root scripts and README usage;
- canonical knowledge policy/documentation navigation, если правило становится нормативным;
- generated manifests через штатный pipeline, а не вручную.

### RI-06. Тесты

Обязательные уровни:

- contract tests публичных inputs/outputs;
- unit tests ranking/composition и adapter errors;
- negative tests missing Graphify, wrong version, stale graph, malformed output;
- isolation tests, запрещающие ссылки на game graph/runtime;
- CLI subprocess tests JSON/stdout/stderr/exit codes;
- agent installation preflight tests;
- architecture boundary tests;
- integration test current RAG + fixture Graphify graph;
- reproducibility/stale detection tests.

### RI-07. Проверки и независимый аудит

Минимально запланированы:

```text
npm run test:repository-intelligence
npm run test:knowledge-source
npm run architecture:check
npm run docs:check
npm run repo-intel:controls
npm test
```

После автоматических проверок обязателен независимый аудит агентом-критиком. При `CHANGES REQUIRED` или `REJECT` выполняется полный цикл исправление → повторные проверки → повторный аудит.

## Порядок интеграции

1. Ветка основана непосредственно на `main`.
2. Все изменения входят только в один PR.
3. PR остаётся draft до прохождения обязательных проверок и аудита.
4. Generated Graphify output допускается включать только после определения размера, reproducibility и reviewability.
5. Если полный `graph.json` окажется слишком большим для code review, в репозитории остаются config/manifest/control fixtures, а production artifact создаётся штатной командой после checkout. Обязательная зависимость от Google Drive запрещена.

## Выполненные изменения

- создана отдельная ветка;
- создан этот единый рабочий журнал;
- зафиксировано решение hybrid вместо удаления текущего RAG;
- зафиксирована граница с игровым графом;
- зафиксирован upstream Graphify и version pin для дальнейшей реализации.

## Выполненные проверки

На текущем этапе автоматические тесты не запускались. Выполнено read-only изучение GitHub `main` и upstream Graphify.

## Аудит

Не запускался: реализация ещё не завершена.

## Известные ограничения и оставшиеся задачи

- требуется изучить точные generated files upstream installers для Agent Skills, Codex и Cursor;
- требуется реализовать package, CLI, adapters и tests;
- требуется определить policy коммита полного Graphify artifact после измерения размера;
- требуется обновить normative corpus и пересобрать существующие generated knowledge artifacts;
- требуется выполнить все проверки и независимый аудит.
