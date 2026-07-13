# Rus_modules

Текущий релиз: `0.23.0-migration.23`.

Проект содержит modular new-game Stages 2–26, общий orchestrator, domain packages, turn workflow, narration/presentation, game-server/game-web, production DB/provider adapters, MapMaker/tools и автономный нормативный корпус через `@rus/knowledge-source`.

## Нормативный корпус

Канонические документы находятся в:

```text
data/knowledge-source/corpus/DOCUMENTS
```

Runtime получает их только через injected `KnowledgeSourceReader`. Production fallback в `legacy/DOCUMENTS` отсутствует. Graph и RAG находятся в `generated/knowledge-source` и проверяются против corpus manifest.

Команды:

```bash
npm run knowledge:inventory
npm run knowledge:check
npm run knowledge:generate
npm run test:knowledge-source
```

`knowledge:import` является миграционной командой и повторно копирует утверждённый legacy corpus; в обычной разработке она не требуется.

## Каноническая документация

- [MODULE_INDEX.md](MODULE_INDEX.md);
- [Правила модулей](docs/architecture/MODULE_RULES.md);
- [Правила зависимостей](docs/architecture/DEPENDENCY_RULES.md);
- [Политика контрактов](docs/architecture/CONTRACT_POLICY.md);
- [Политика knowledge-source](docs/architecture/KNOWLEDGE_SOURCE_POLICY.md);
- [New-game pipeline](docs/pipelines/new-game.md);
- [Turn pipeline](docs/pipelines/turn.md);
- [Canonical path registry](docs/migration/CANONICAL_PATHS.json).

## Generated data

```bash
npm run docs:generate
npm run docs:check
```

`docs:check` также проверяет byte parity корпуса и актуальность generated graph/RAG.

## Проверка релиза

```bash
npm ci --ignore-scripts
npm test
npm run release:check
npm run migration:status
```

## Граница релиза

Modular runtime является default. Legacy сохраняется как explicit rollback route и read-only evidence. Автоматическое удаление legacy запрещено; для удаления нужны отдельные операторские и владельческие подтверждения.
## Новгородская карта и поячеечный workflow

Технический контур подготовки региональной карты находится в:

```text
tools/world-catalog-workflow
data/world-catalogs/novgorod
schemas/world-catalogs
```

Инструмент валидирует ревизию карты и G1-пакеты, строит очередь `global_grid_y DESC, global_grid_x ASC` и формирует dry-run импорта. Он не создаёт исторические факты, названия, маршруты, NPC или предметы и не записывает данные в production `world_base`.

Текущая ревизия `novgorod_1230_research_revision_001` является staging-ревизией поверх read-only baseline v6. Все 70 legacy G1 заблокированы до утверждения расширенной исторической маски и обязательных полей `control_status`, `subregion_id`, `land_fraction`, `water_fraction` и `playability_status`.

Команды:

```bash
npm run test:world-catalog
npm run world-catalog:validate-novgorod-revision
```

Подробности: `docs/migration/NOVGOROD_WORLD_CATALOG_WORKFLOW.md`.

