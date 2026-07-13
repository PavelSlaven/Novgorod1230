# План миграции new-game Stages 9–12

Дата: 2026-07-12  
Статус: выполнен

## Цель

Восстановить отсутствующий модульный участок между read-only candidate retrieval Stages 2–8 и G5-материализацией Stages 13–26. Сохранить существующие контракты и semantic boundaries: Stage 9 только выбирает допустимый стартовый узел, Stage 10 независимо проверяет выбор, Stage 11 поручает LLM создать персонажа внутри утверждённой рамки, Stage 12 независимо аудирует dossier и не изменяет его.

## Работы

1. Зафиксировать доступные legacy-реализации Stages 9–12 из recovery-архива как golden fixtures.
2. Вынести Stage 9 в candidate-bound модуль: policy, input gate, selection validation, source verification, managed repair result и compatibility API.
3. Вынести Stage 10 в независимый audit-модуль: read-only DB checks, candidate/template membership, parent chain, access, season/clock, sources и repair route.
4. Вынести Stage 11 в LLM generation-модуль: input contract, dossier validation, game-profile projection и explicit executor port.
5. Вынести Stage 12 в отдельный semantic audit-модуль: code precheck, audit input/output validation, immutable dossier boundary и failed-audit builder.
6. Заменить legacy `src` и `dist/release` stage-файлы однострочными compatibility-фасадами.
7. Добавить package exports, declarative stage definitions, architecture gates и API parity tests.
8. Обновить migration manifest, status, reports, checksums и release archive.

## Критерии готовности

- все baseline named exports сохранены;
- Stage 9 не создаёт world entities и не выбирает вне candidate set;
- Stage 10 только читает и проверяет, не заменяет выбранный узел;
- Stage 11 не получает прямой доступ к DB, provider SDK, UI или sibling implementations;
- Stage 12 не изменяет dossier и блокирует commit при failed precheck/audit;
- все production-файлы короче 500 строк и не импортируют `legacy/`;
- модульная suite, architecture checker и release hygiene проходят.
