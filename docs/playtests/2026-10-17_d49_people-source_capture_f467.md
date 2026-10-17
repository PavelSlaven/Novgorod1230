# D49: проверка источников сведений о людях без вызова модели

## Результат

**PARTIAL / не приёмка игры.** После [сравнения TP2](2026-10-17_d49_tp2-profile_982d-f467.md) проверено, какие сведения о людях действительно доступны во входе вступления. Дополнительных реальных вызовов модели не было. Код приложения, сохранения и службы моделей не менялись.

## Связность данных

Старый каталог `d49-real-vikhtuy-f467` непригоден для доказательства всей цепочки: `provenance.json` относится к партии `party:58b9d6343d49225d32813c0c`, а `upstream-fresh.json` — к `party:0572dc7c442b76cc05e5b2ae`. Совпадение сохранённого writer request с замороженным входом SHA `29f51870665514b8dba10c9a27a430003b101b24c281764ecde1a96e489a2fba` не устраняет это расхождение.

Новая попытка использовала HEAD `f4674cffda83c9a91a148d5184198bc1b132dfea`, сценарий `novgorod_vikhtuy_work_storage_v1`, request `d49-linked-vikhtuy-20261017-single` и партию `party:be2a171ce9310ead18042513`. Сохранены первый экран, committed SQL snapshot и writer wire из одного запуска. Fakefetch обработал два запроса, из них один writer; реальных model calls — **0**. Ответ заглушки не является образцом художественной прозы.

Диагностические файлы находятся на сервере в `/srv/novgorod-work/tmp/d49-capture-20261017/`: `02-opening.json`, `03-committed.json`, `04-writer.json`, `07-summary.json`, `99-error.json`. Private snapshots в репозиторий не публикуются.

## Наблюдения и ограничения

- Сохранён один NPC («Сторонька») в позиции `focus:0`; герой — в `arrival:0`. Эти слоты не доказывают близость, направление, позу или действие.
- В снимке нет строк `relative_positions` и `party_npc_relations`; наблюдённые committed transitions не получены. Private `machine_state` сам по себе не доказывает видимое действие.
- Статус runtime manifest — `approved`. Исходный start-файл отдельно содержит `pending_independent_data_approval`, `approved: false`, `import_authorized: false`, `activation_authorized: false`. Тестовую fixture нельзя выдавать за подтверждение production-активации этого исходника.
- Дополнительное чтение проекции упало: временный тест искал `actor_id` и `position` в корне snapshot вместо `initial_spatial_v3_runtime` и `persisted_projection`. Точная ошибка: `assert.ok(actorId && positionId)`. Отдельные результаты `readCurrentVisibleContext` и `readEntityObservations` не сохранены. Связь сохранённых данных не заменяет отсутствующий участок трассы.

## Ошибки стенда и проверки

Первая попытка захвата дошла до первого экрана, затем временный SQL упал: `column "anchor_id" does not exist` в `entity_placements`. Следующая остановилась до импорта: `presence-e2e-pg-27972c1c-cd4 did not become ready`.

Причина второго сбоя воспроизведена отдельно: PostgreSQL 16.14 не смог создать Unix socket в `/var/run/postgresql` (`Permission denied`, exit 1). Временный отдельный запуск с `initdb` и `postgres -c unix_socket_directories=''` подтвердил готовность через TCP: `pg_isready`, локальный и внешний `psql`. После этого выполнен один импорт для описанного выше частичного захвата; повторного импорта после ошибки диагностики не было.

Исполнитель выполнил `node --check` временного теста и `git diff --check`; сам capture завершился ошибкой и не считается PASS. Собственные контейнеры и временные тесты удалены; два существовавших untracked capture-теста сохранены. Полный `npm test`, браузерная игра и проверка save/reload в этой диагностике не выполнялись. Телеметрия токенов агентов недоступна.
