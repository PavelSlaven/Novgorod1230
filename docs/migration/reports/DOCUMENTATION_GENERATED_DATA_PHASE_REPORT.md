# Отчёт фазы: документация и generated data

Дата: 2026-07-12  
Релиз: `0.19.0-migration.19`  
Исходный архив: `Rus_modules-migration-0.18.0.zip`

## Выполнено

- 51 historical migration documents перенесены из repository root в `docs/migration/{plans,reports,contracts,parity}` без compatibility copies.
- Domain ownership и tool inventory получили отдельные canonical paths.
- Созданы правила зависимостей, политика контрактов и канонические описания new-game/turn pipelines.
- Добавлены недостающие MODULE.md для kernel, llm-runtime, pipeline-engine, party-store, world-base и new-game.
- Создан machine-readable `CANONICAL_PATHS.json`.
- `@rus/docs-tools` получил deterministic generator/checker.
- Создаются пять reproducible outputs: MODULE_INDEX, machine module index, JSON/Markdown schema reference и generated manifest.
- Schema reference извлекает экспортированные `*_SCHEMA*` constants и хеширует внешние DDL.
- Добавлены approved seed/import registries и manifest legacy compatibility data.
- Baseline audit outputs перенесены в dated artifacts с manifest.
- Release hygiene теперь обнаруживает, а не молча пропускает, `node_modules`, `.git`, `tmp` и `dist`.
- Удалён неиспользуемый `legacy/tmp` с тестовыми временными файлами.

## Проверки

- Modules: 217/217.
- Domain packages: 30/30.
- Applications: 11/11.
- Tools: 18/18.
- DB/provider integration: 3/3.
- Chromium E2E: 1/1.
- Полный набор: 280/280.
- Documentation reproducibility: passed.
- Architecture boundaries: passed.
- Release hygiene: passed.
- ZIP integrity: passed.

## Инварианты

- Код игры и игровые правила не изменены.
- Generated output не является source of truth и не находится в `src/`.
- Исторический alias не существует как вторая копия canonical document.
- Legacy runtime data сохранены только для compatibility до cutover и явно не объявлены seed source.
- Исходный архив 0.18.0 не изменялся.

## Следующая фаза

Production-corpus shadow run: одинаковые inputs для legacy/modular routes, структурное сравнение, классификация расхождений и cutover recommendation.
