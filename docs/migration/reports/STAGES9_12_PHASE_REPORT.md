# Отчёт по фазе Stages 9–12

Дата: 2026-07-12  
Релиз: `0.11.0-migration.11`

## Выполнено

- Stage 9 перенесён в `packages/new-game/src/stages/stage-9-start-node-selection/`.
- Stage 9 приведён к `bounded_decision_request_v2/result_v2`: singleton выбирает код, неоднозначный выбор требует подписанный command token; semantic retry со свободным JSON удалён.
- Stage 10 перенесён в `packages/new-game/src/stages/stage-10-start-place-audit/`.
- Stage 11 перенесён в `packages/new-game/src/stages/stage-11-player-character/`.
- Stage 12 перенесён в `packages/new-game/src/stages/stage-12-player-character-audit/`.
- Legacy-файлы в `legacy/src` и `legacy/dist/release` заменены однострочными compatibility-фасадами.
- Сохранены все именованные exports доступного recovery-baseline.
- Добавлены package entries, declarative definitions, parity tests и architecture gates.

## Архитектурный результат

| Stage | Назначение | Production JS files | Максимальный файл |
|---|---|---:|---:|
| 9 | выбор стартового узла | 10 | 157 строк |
| 10 | аудит стартового места | 11 | 272 строки |
| 11 | генерация персонажа | 9 | 329 строк |
| 12 | аудит персонажа | 10 | 203 строки |

Stage core не импортирует legacy, SQL-клиент, provider SDK, UI/server или sibling stage implementations. DB-доступ Stage 10 и bounded-decision/LLM executors Stages 9/11/12 передаются только через explicit services.

## Проверки

- специализированный suite Stages 9–12: 7/7;
- полный модульный suite: 200/200;
- architecture boundaries: passed;
- release hygiene: passed;
- baseline named export parity: passed;
- legacy pipeline import через compatibility facades: passed в полном модульном suite.

## Ограничения

- реальный provider вызов не выполнялся;
- DB-backed happy-path Stage 10 не запускался против production `world_base`;
- browser E2E и production-corpus shadow run не выполнялись;
- полный legacy suite ранее зависал в UI-server участке и в этой фазе не заявляется как пройденный.
