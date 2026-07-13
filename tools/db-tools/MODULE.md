# @rus/db-tools

## Назначение

Автономные контракты и проверки для export/import/seed/audit операций БД. Инструмент не является runtime adapter и не выполняет SQL сам.

## Владеет

- versioned operation manifest;
- dry-run/approval gates для write-like операций;
- разделением `world_base` и `party_db` targets;
- формированием технического operation plan для внешнего executor.

## Инварианты

`import` и `seed` требуют `dry_run=true`, `approval_id` и source checksum. `audit` и `export` не получают права записи. Отсутствующие смысловые данные не создаются.

## Запрещено

Прямой импорт `pg`, SQL execution, provider SDK, runtime workflows и legacy modules.
