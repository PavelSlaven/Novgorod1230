# План фазы: документация и generated data

Дата: 2026-07-12  
Исходный релиз: `0.18.0-migration.18`

## Цель

Устранить дублирующиеся документы и неуправляемые generated/data artifacts, назначить каждому правилу единственный canonical path и сделать производные reference-файлы полностью воспроизводимыми.

## Работы

1. Переместить historical migration plans/reports/contract maps/parity evidence из корня в `docs/migration/` без сохранения копий.
2. Создать нормативные `DEPENDENCY_RULES.md`, `CONTRACT_POLICY.md`, `docs/pipelines/new-game.md`, `docs/pipelines/turn.md`.
3. Дополнить отсутствующие `MODULE.md` и создать generated `MODULE_INDEX.md` со всеми production packages и владельцами данных.
4. Ввести `docs/migration/CANONICAL_PATHS.json`: один canonical path на документ, все старые имена — только aliases.
5. Расширить `@rus/docs-tools` одной командой генерации module index, schema reference и generated manifest.
6. Добавить `docs:check`, который повторно строит outputs в памяти и отклоняет stale/manual edits.
7. Ввести seed-source registry, import history и manifest legacy runtime data; запретить промежуточные spreadsheet/final/fixed/v2 sources.
8. Перенести временные audit outputs в dated artifact directory с manifest.
9. Усилить architecture и release hygiene gates для документации, generated, seed и artifact policies.
10. Обновить release metadata, прогнать весь набор тестов и проверить archive integrity.

## Критерии завершения

- в корне нет historical markdown duplicates;
- canonical registry не содержит конфликтов, все targets существуют;
- `MODULE_INDEX.md` перечисляет каждый production package и владельцев;
- `npm run docs:generate` воспроизводит committed generated files;
- `npm run docs:check` проходит без diff;
- generated output отсутствует в `src/`;
- seed и artifact policies проверяются автоматически;
- полный regression suite, architecture и release hygiene проходят.
