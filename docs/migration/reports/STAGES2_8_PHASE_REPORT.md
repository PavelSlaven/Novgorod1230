# Отчёт по фазе Stages 2–8

Дата: 2026-07-12  
Релиз: `0.10.1-migration.10-recovery`

## Выполнено

- Stage 2 перенесён в `packages/new-game/src/stages/stage-2-normalization/`.
- Stage 3 перенесён в `packages/new-game/src/stages/stage-3-historical-frame/`.
- Stages 4–8 перенесены в отдельные read-only stage-модули с явными портами.
- Legacy stage-файлы 2–8 заменены однострочными compatibility-фасадами.
- Legacy data retrievers локализованы в `packages/new-game/src/legacy-adapter.js`; stage core от них не зависит.
- Добавлены декларативные `stage2Definition`–`stage8Definition` и package exports.
- Golden fixtures исходного API сохранены в `test/fixtures/stage2-8-baseline/`.
- Добавлены проверки API parity, запретов материализации, candidate boundaries, port isolation и фасадов.

## Архитектурный результат

| Stage | Назначение | Production JS files | Максимальный файл |
|---|---|---:|---:|
| 2 | нормализация заявки | 7 | 378 строк / 16 672 байта |
| 3 | выбор исторической рамки | 8 | 314 строк / 16 476 байт |
| 4 | региональный контекст | 4 | 9 строк / 985 байт |
| 5 | стартовые кандидаты | 5 | 13 строк / 482 байта |
| 6 | допустимые place templates | 5 | 15 строк / 596 байт |
| 7 | NPC-кандидаты | 5 | 17 строк / 1 434 байта |
| 8 | item profile candidates | 6 | 12 строк / 1 479 байт |

Все семь legacy-фасадов занимают по одной строке и 53 байта.

## Проверки

- специализированный suite Stages 2–8: 6/6;
- полный модульный suite: 193/193;
- architecture boundaries: passed;
- release hygiene: passed;
- baseline named export parity: passed.

## Legacy baseline

Полный последовательный legacy suite дважды не завершился в пределах 300 секунд из-за зависания после UI-server tests. До остановки выполнено 229 тестов; обнаружены четыре уже известные baseline-ошибки: два ожидания старой последовательности `SemanticAuditRepairer`, `op5-audit.test.js` и `op7-audit.test.js`. Новых отказов в Stages 2–8 до точки остановки не обнаружено.

## Ограничение исходных данных

Корневой Drive-документ указывает, что существовал релиз `migration-0.10.0` со Stages 9–26, однако доступный в папке архив кода заканчивается на `0.9.0-migration.9`, где модульны Stages 13–26. Поэтому эта сборка честно помечена как recovery: она завершает Stages 2–8 поверх последнего доступного архива, но не объявляет отсутствующие артефакты Stages 9–12 восстановленными.
