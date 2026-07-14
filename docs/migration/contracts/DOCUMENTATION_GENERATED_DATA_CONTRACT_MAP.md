# Карта контрактов документации и generated data

## Источники истины

| Категория | Canonical source | Generated/consumer |
|---|---|---|
| Module purpose/ownership | `<module>/MODULE.md` | `MODULE_INDEX.md`, `generated/module-index.json` |
| Contract schema names | экспортированные `*_SCHEMA*` constants | `generated/schema-reference.*` |
| External DB schemas | `schemas/` | schema reference с SHA-256 |
| Canonical document paths | `docs/migration/CANONICAL_PATHS.json` | docs check и generated input digest |
| Approved seed inputs | `data/seeds/APPROVED_SOURCES.json` | import tooling |
| Seed import history | `data/seeds/IMPORT_HISTORY.json` | audit tooling |
| Legacy compatibility data | `data/LEGACY_RUNTIME_DATA.json` | legacy runtime до cutover |
| Temporary evidence | `artifacts/<YYYY-MM-DD>/manifest.json` | release/audit review |

## Команды

- `npm run docs:generate` — единственный writer generated reference.
- `npm run docs:check` — deterministic rebuild comparison и policy validation.
- `npm run architecture:check` — structural documentation boundary.
- `npm run release:check` — archive/source hygiene.

## Запрещённые состояния

- две canonical copies одного документа;
- historical migration reports в repository root;
- generated files внутри `src/`;
- ручное изменение generated output без повторной генерации manifest;
- spreadsheet/final/fixed/v2 файлы в approved seed tree;
- undated artifacts без manifest;
- SQL dump свыше 100 MB в source tree.
