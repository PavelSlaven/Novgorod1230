# Operator review for migration finalization

Статус: **ожидает ручного выполнения**.

Этот документ не содержит секретов и не подтверждает live environment автоматически. Оператор заполняет evidence вне исходного кода либо прикладывает подписанный отчёт с безопасными, отредактированными значениями.

## 1. Live deployment configuration

Проверить на целевой staging/production машине:

- рабочий каталог и release service указывают на `Rus_modules`;
- `RUS_RUNTIME_ROUTE=modular` либо переменная отсутствует и применяется modular default;
- `RUS_RUNTIME_BINDINGS_MODULE` указывает на существующий operator-supplied bindings module;
- обязательные modular feature flags согласованы с cutover plan;
- секреты, DSN и credentials не копируются в migration evidence;
- health check, first screen и один turn проходят в live-like окружении;
- explicit rollback запуск с `RUS_RUNTIME_ROUTE=legacy` документирован и проверен без изменения party storage.

Evidence: дата, оператор, deployment/release id, безопасный checksum конфигурации, результаты smoke/rollback. Секретные значения запрещены.

## 2. External read-only legacy archive

Создать архив исходной внешней старой папки вне рабочего проекта. Зафиксировать имя, SHA-256, размер, место хранения, read-only/immutable policy и restore test.

## 3. Unique-file review

Сравнить старую папку с canonical paths, approved seed registry, migration reports и новым release archive. Подтвердить, что в старой папке не осталось единственного экземпляра нужного файла.

## 4. Owner decision

Владелец проекта отдельно решает, разрешено ли ручное удаление. Даже после подписи инструмент `@rus/finalization` не удаляет legacy автоматически.
