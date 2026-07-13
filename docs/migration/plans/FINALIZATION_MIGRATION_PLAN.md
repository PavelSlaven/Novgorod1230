# План финализации — migration-0.22.0

## Цель

Закрыть автоматизируемую часть миграции после успешного staged cutover, собрать единый evidence package и оставить ручное удаление legacy под отдельным operator/owner gate.

## Работы

1. Добавить автономный `@rus/finalization` с versioned plan/report contracts.
2. Проверить cutover, shadow, regression, restore и import-graph evidence.
3. Зафиксировать modular default и explicit legacy rollback без live environment mutation.
4. Создать operator review template без секретов.
5. Выпустить `finalization-report.json/.md` и обновить migration manifest/status.
6. Выполнить полный regression, docs, architecture и release hygiene gates.
7. Собрать release archive и проверить его восстановление и checksums.
8. Не подтверждать четыре ручных пункта без оператора/владельца.

## Критерий завершения автоматической части

Все автоматические gates пройдены, report имеет решение `automation_complete_manual_hold`, новый release archive восстанавливается, legacy не удалён и `legacy_deletion_allowed=false`.

## Ручной остаток

Live deployment review, внешний read-only архив старой папки, unique-file review и owner approval выполняются только человеком. До этого полная финализация и удаление legacy не считаются подтверждёнными.
