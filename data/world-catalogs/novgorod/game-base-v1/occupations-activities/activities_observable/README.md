# activities_observable/activities_new_occupations.csv

**Что.** 135 строк цепочек действий (`ac_*`, с `prev_ref`/`next_ref` и `observable_text_ru`), извлечённых скриптом из `master-archive-v1` `activities.csv` (2442 строки) — но **только** для 27 `PRO####`, процитированных как источники в `occupations/occupations_additions.csv` этого же коллектора (18 новых занятий, 5 действий на профессию в среднем).

**Это не весь домен.** Полный домен `activities_observable` по брифу — все 2442 строки master-архива × связь с уже существующими 37 approved занятиями и последующая проверка/переработка в `region_activity_profiles` (приоритет M3 по брифу; критик считает эту оценку приоритета спорной, см. ниже). Здесь закрыта только узкая, прямо связанная с работой этого коллектора часть — цепочки для НОВЫХ занятий, чтобы `occupations_additions.csv` не оставался без единого связанного действия.

**Метод (чистая экстракция + скриптовая проверка).** `scripts/build_activities_for_new_occupations.py`:
1. Фильтрует `activities.csv` по `profession_ids`, содержащим один из 27 целевых `PRO####`.
2. Копирует поля без изменения (`name_ru`, `season_scope`, `duration_estimate`, `description_ru` → `observable_text_ru`, `historical_confidence` → `confidence`).
3. Строит граф по `previous_activity_ids`/`next_activity_ids`, ограниченный отобранным множеством, и ищет циклы (DFS) — это прямой аналог acceptance-критерия брифа («в графе prev/next нет циклов внутри цепочки»).
4. Проверяет, что у каждой строки непустой `observable_text_ru`.

**Счёт и результат проверки (по скрипту).** 135 строк написано; **циклов не найдено**; строк без `observable_text_ru`: **0**.

## Известные разрывы (gaps)

- **Входы/выходы (`inputs`/`outputs`) не резолвились в items** — acceptance-критерий брифа («входы и выходы резолвятся в items») не проверен: скрипт не сверял `held_item_ids`/`used_item_ids`/`consumed_item_ids`/`produced_item_ids` из `activities.csv` со справочником предметов (`material_items.csv`/`material_entities.csv`) — отдельный join, не сделан из-за бюджета.
- **`pf_id` (привязка к `activity_categories_profiles`, approved, 6 категорий из temporal-v4)** не проставлен — не сверялось в этом проходе, какая из 6 категорий соответствует каждой строке.
- **Основной объём домена (2442 строки, 68+ занятий) не тронут.** Критик брифа прямо указывает, что приоритет `M3` для activities/transport спорен, так как стартовая территория v17 — преимущественно речная (плёсы, протоки, пристани), и деятельность на воде должна быть в `M2c`; этот коллектор эту оценку не пересматривает (не входит в мандат «collect», это решение владельца/архитектурного триажа), но фиксирует наблюдение для эскалации: полноценная выборка `activities.csv` по занятиям водного транспорта/переправ (лодейный мастер, работник пристани/причала — уже есть в источнике: `PRO0236`, `PRO0295`) не сделана в этом проходе и является хорошим кандидатом для следующего срочного under-M2c прохода.
- **`region_activity_profiles` (целевая таблица world_base) не заполнялась** — не подключались к БД (`world-base-postgres-1` не запрашивался в этом проходе, чтобы не расходовать бюджет без явной необходимости).

## Источники

- `data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/occupations/activities.csv` (2442 строки, `historical_confidence` A/B/C, `source_ids` = SRCxxx того же датасета).
