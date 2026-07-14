# Отчёт исполнения плана ввода первой G1 в production

## Объект

- G1: `gn_nov_g1_xp017_yp026`
- Базовая содержательная ревизия: `content_revision_002`
- Целевая ревизия: `content_revision_003_production_candidate`

## Выполнено в текущем сеансе

1. Проведён аудит существующих модулей и подтверждено, что новый параллельный импортёр создавать нельзя.
2. Выбран существующий повторно используемый контур `@rus/world-catalog-workflow`.
3. Спроектированы и проверены контракты production-профилей:
   - стартовые G4;
   - G5 materialization profiles;
   - NPC materialization rules;
   - item/container/property/resource bindings;
   - seasonal runtime profile;
   - start runtime fixture.
4. Для первой G1 был собран production candidate со следующими параметрами:
   - 3 стартовых G4;
   - 17 G5-профилей;
   - 195/195 G4 assignments;
   - 6 NPC rule sets;
   - один режим `late_summer_open_water`;
   - один эталонный стартовый fixture.
5. Разработана явная проекция карты в `world_base`:
   - 243 graph nodes;
   - 358 авторских двусторонних физических связей;
   - 716 направленных канонических graph edges;
   - парные `reverse_edge_id`;
   - `contains` исключены из физического импорта;
   - локальные типы рёбер проецируются на канонические `path`, `river`, `forest_track`, `offroad_crossing`.
6. Разработан read-only production repository для `@rus/world-base`:
   - обычный runtime видит только активную утверждённую ревизию;
   - pre-activation E2E может явно загрузить draft revision;
   - отсутствие любого обязательного набора данных блокирует продолжение.
7. Спроектирован административный production importer на базе существующего `world_base_importer_v1`:
   - dry-run;
   - emit-sql;
   - atomic apply;
   - rollback при любой ошибке;
   - проверка counts, FK и reverse edges;
   - импорт не активирует ревизию.
8. Проведены два цикла критического разбора. Исправлены:
   - неправильный порядок datasets;
   - потеря `g4_id/profile_id` у G5 assignments;
   - риск загрузки draft как active runtime;
   - отсутствие revision-scoped keys;
   - коллизии reverse edge IDs;
   - попытка расширить канонический enum локальными edge types.
9. Целевой тестовый набор завершился результатом `51/51 PASS`.

## Не выполнено

Следующие операции требуют полного checkout проекта, действующей PostgreSQL и runtime credentials, которых в текущем окружении нет:

- применение миграции к staging/production `world_base`;
- фактический импорт production bundle;
- post-import readback;
- runtime visibility через production repositories;
- полный new-game E2E Stages 2–26;
- запись и повторная загрузка party DB;
- первый игровой ход;
- digest-gated activation revision.

## Текущий статус

```text
static_preparation = completed
production_import = not_performed
runtime_visibility = not_verified
new_game_e2e = not_performed
first_turn = not_performed
production_activation = false
session_readiness = BLOCKED
```

## Повреждение артефактов среды

После успешного тестового прогона временная среда очистила сгенерированные production-candidate и кодовый patch. Оставшийся файл `rus_modules_g1_production_patch.zip` содержит только `README.md` и `MODULE_INDEX.md` и не является применимым патчем. Он не должен публиковаться или использоваться.

Нельзя считать задачу завершённой до повторного формирования полного патча в устойчивом checkout и прохождения внешних gates.
