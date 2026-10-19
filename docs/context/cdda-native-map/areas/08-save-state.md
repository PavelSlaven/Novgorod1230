# Сохранение, загрузка, хранение состояния мира и данных Новгорода: родные механизмы CDDA

Снимок: upstream CDDA на пине `0d8843f` ([INDEX](../INDEX.md) §0; savegame_version 40, `src/savegame.cpp:84`). Граф: `cdda-upstream-0d8843f` (qualified name вида `cdda-upstream-0d8843f.src.game_io.game.save`; короткое `game::save` граф не находит). Пути C++ относительно корня upstream.
Источники нужд (состояние на 2026-10-19): PLAN = [Vertical_Slice_Implementation_Plan](../../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md); REUSE = [Mechanics_Reuse_Strategy](../../../plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md); «разбор сохранения» = внутренний разбор механизма сохранения (вне репозитория); D215 (сохранение по запросу и раз в игровой час) и D216 (откат к последнему целому сохранению) — решения владельца, определены в [INDEX](../INDEX.md) §1.

## 1. Таблица «нужда → родное»

Где что лежит в каталоге мира (проверено): `master.gsav` (`game::serialize_master`, `src/savegame.cpp:1841-1862`: next_mission_id, next_npc_id, next_item_uid, active_missions, timed_events, item_wakeups, factions, seed); `dimension_data.gsav` (`serialize_dimension_data`, `:1865-1882`: overmapbuffer.global_state, weather, power_networks); `<base64(save_id)>.sav` (`game::serialize_json`, `:97-170`: turn, active_monsters, трекеры, player, очередь глобальных EOC, `global_vals`, Messages, `unique_npcs`); также `.pt`, memorial `.log`, map memory, diary, `uistate.json`, `maps/`, overmap-файлы.

| Нужда Новгорода (источник) | Родной механизм CDDA | C++ (файл:строка) | JSON (тип, пример) | Документация CDDA | Как расширять минимально | Пределы и ловушки | Покрытие: полное/частичное/нет |
|---|---|---|---|---|---|---|---|
| Сохранение по запросу игрока (D215; PLAN :40-41, :161) | Действие `ACTION_QUICKSAVE` -> `game::quicksave()` -> `save()` | `src/action.cpp:312,432`; `src/handle_action.cpp:2953`; `src/game_io.cpp:891` (quicksave), `:734-783` (save) | нет (действие клавиатуры) | отдельной страницы не найдено | Ничего: уже есть; лаунчер/хоткей зовёт то же действие | Из JSON/EOC вызвать save нельзя (§4). Прочие вызовы `g->quicksave()`: `src/debug_menu.cpp:4216`, `src/handle_action.cpp:1368` (меню), `src/sdltiles.cpp:6160` (Android, потеря фокуса); из EOC — ни одного (проверено Opus). `quicksave()` возвращает `void`, результат `save()` отбрасывается | полное |
| Сохранение и выход с проверкой результата (D216) | `ACTION_SAVE`: «Save and quit?» -> `if( save() )` -> `QUIT_SAVED`; при неудаче вопрос «Unable to save, quit anyway?» | `src/handle_action.cpp:2940-2951` | -- | -- | Для безопасного выхода использовать именно это действие (оно единственное проверяет результат) | Проверка есть только в этом пути; quicksave/autosave молча продолжают ход после сбоя | полное |
| Сохранение каждый игровой час (D215; PLAN :161) | Автосейв по числу ходов + реальному времени | `src/do_turn.cpp:607-612` (`AUTOSAVE` && `once_every(1_turns*AUTOSAVE_TURNS)` && не мёртв), `src/game_io.cpp:941-947` (`autosave()`: гейт `AUTOSAVE_MINUTES` по `std::time`), `src/calendar.cpp:756` (`once_every`); `src/do_turn.cpp:549` (`calendar::turn += 1_turns`) | опции `AUTOSAVE`, `AUTOSAVE_TURNS` (10..1000, по умолчанию 50), `AUTOSAVE_MINUTES` (реальные минуты, 0..127): `src/options.cpp:1718-1740` | `doc/JSON/OPTIONS.md` (общий) | Опциями «каждый игровой час» не задать: 1 ход = 1 с, час = 3600 > 1000. Минимум C++: условие `calendar::once_every(1_hours)` рядом с `do_turn.cpp:607`; для реальных интервалов — опции | Два независимых гейта (игровые ходы И реальные минуты): при `AUTOSAVE_MINUTES > 0` сейв может не произойти в нужный ход. `autosave()` -> `quicksave()` результата наружу не отдаёт | частичное |
| Целое состояние мира в одном родном сохранении (PLAN :27, :152-167; REUSE :24) | `game::save()`: цепочка `\|\|` писателей, возвращает bool | `src/game_io.cpp:734-783`, помощники `:571-720` | -- | -- | Класть данные Новгорода в родные хранилища (строки ниже) | Набор файлов не атомарен целиком; каждый файл — temp+rename через `ofstream_wrapper` (`src/cata_utility.cpp:288-330`, `src/mapsharing.cpp:110-171`), ошибка записи -> popup; без fsync и бэкапа | частичное |
| Данные мира (флаги, счётчики, идентификаторы) внутри сохранения (PLAN :99-106) | `global_variables` («global_vals») | `src/global_vars.h`; запись `src/savegame.cpp:1902-1905`, чтение `:1777`; `src/game.cpp:11651` (`get_globals`) | EOC `global_val`, `u_val`, `npc_val`, `context_val`, `var_val` | `doc/JSON/EFFECT_ON_CONDITION.md:114-133` | EOC и `math`; из C++ API `global_variables` | Лежат в `<save_id>.sav` (не в master.gsav): уходят в кладбище вместе с живым сейвом при смерти. Значение — `diag_value` (`src/math_parser_diag_value.h`) | полное |
| Данные существа/персонажа внутри сохранения | `Creature::values` | `src/creature.h:707-715`, `:1230`, `:1264`; `src/savegame_json.cpp:4174,:4221-4231` | EOC `u_val`/`npc_val` | `doc/JSON/EFFECT_ON_CONDITION.md:123` | EOC | Теряется со смертью/сменой аватара (`doc :123`); долгие данные — в `global_val` | полное |
| Данные предмета внутри сохранения | `item::item_vars` | `src/item.h:3580`, `:2075-2093`; `src/item.cpp:1013-1087`, `:894-932` (стекирование); `src/savegame_json.cpp:3220`; из EOC — `talker_item::set_value/remove_value` (`src/talker_item.cpp:151-159`) | поле `variables` у `type: ITEM` (`src/itype.h:1497`, `src/item_factory.cpp:4569`) | `doc/JSON/ITEM.md`; JSON-синтаксис EOC для переменной предмета в доках не найден | JSON `variables` / C++ `set_var` | Предметы с разными vars не стекаются (`item.cpp:894-932`) | полное |
| Очереди отложенных событий мира | `queued_global_effect_on_conditions` (в .sav), `timed_events` и `item_wakeups` (в master.gsav) | `src/savegame.cpp:152-153,:314-320` (EOC), `:1654-1657` (чтение master), `:1855-1859` (запись master), `:1919` (timed_events); у персонажа `src/savegame_json.cpp:1206,:1438` | EOC `run_eocs` + `time_in_future` (`queue_eocs` — внутренняя C++-функция `npctalk.cpp:6476`, не ключ JSON; исправлено Opus) | `doc/JSON/EFFECT_ON_CONDITION.md` | JSON | Очередь сериализуется сама; своя очередь Новгороду не нужна | полное |
| Состояние «неактивных» глобальных EOC | `inactive_global_effect_on_condition_vector` | `src/savegame.cpp:148-149,:312-313` | EOC `recurrence`/`activate_only_when_loaded` | `doc/JSON/EFFECT_ON_CONDITION.md` | JSON | В .sav | полное |
| Учёт игры (статистика, достижения, убийства) | `stats_tracker`, `kill_tracker`, `achievements_tracker` | сериализация в `src/savegame.cpp` (сейв игрока) | `type: event_statistic`, `achievement` | `doc/JSON/EFFECT_ON_CONDITION.md` (события) | JSON | Достижения хранятся ВНЕ мира (`PATH_INFO::achievementdir`) | частичное |
| Журнал сообщений | `Messages` | `src/messages.cpp:444`, `:453`; `src/savegame.cpp:165,:328` | -- | -- | `add_msg`; сохраняется само | Только строки | полное |
| Уникальные NPC | `unique_npcs` | `src/savegame.cpp:166,:323` | -- | -- | -- | В .sav, а не master | полное |
| Версии и миграции сохранения (PLAN :152-167) | `savegame_loading_version`, `savegame_version = 40`; миграции переменных | `src/savegame.cpp:84`, `:108`; `global_variables::load_migrations` `:1907-1914` (регистрация `src/init.cpp:276`), применение `:1777` и `src/savegame_json.cpp:4223` | `type: var_migration` (`from`, `to`) | `doc/JSON/OBSOLETION_AND_MIGRATION.md:351-367` | Переименование EOC-переменных — JSON `var_migration`; «без обратной совместимости» — свои миграции не нужны | Мигрирует только Character и Global переменные | полное |
| Откат после падения к последнему целому сохранению (D216; разбор сохранения) | Нет родного. Есть temp+rename на файл | `src/cata_utility.cpp:288-330`, `src/mapsharing.cpp:110-171` | -- | -- | Лаунчер: копия каталога мира в «поколение» после успешного save + указатель current/previous (ядро разбора сохранения) | Полнота набора файлов — забота лаунчера | нет (только уровень файла) |
| Сохранение при смерти / кладбище | `move_save_to_graveyard` | `src/game_io.cpp:249` | -- | -- | -- | Перемещает файлы живого сейва (.sav, а с ним `global_vals`) в кладбище — учесть в лаунчере | полное |
| Несколько «миров» в одном каталоге; отдельные измерения | `PATH_INFO` dimension, `dimension_prefix`, `travel_to_dimension` (делает `save_maps` + `save_dimension_data`, меняет каталог, `load_dimension_data`) | `src/game_io.cpp:960-980`, `:289` (load_dimension_data), `:281` (load_master); `src/game.cpp:9791-9926` | `type: dimension`; EOC `u_travel_to_dimension` (`src/npctalk.cpp:8363`), `clear_dimension` (`:5044`), событие `dimension_travel` | `doc/JSON/DIMENSIONS.md` (:16, :37) | Только если нужны отдельные «миры» | Выгруженные измерения менять нельзя (`DIMENSIONS.md:16`); смена измерения = смена каталога + принудительное сохранение | частичное |
| Сжатие хранилища | Опция `WORLD_COMPRESSION2` (zzip для maps/ и `.sav.zzip`) | `src/options.cpp:1849`; `src/worldfactory.cpp:143`; `src/mapbuffer.cpp:158-163,:250-257` | опция | `doc/JSON/OPTIONS.md` | Опция при создании мира | Только для новых миров | полное |

## 2. Родное, не упомянутое в документах Новгорода

- События EOC `game_save`, `game_load`, `game_begin`, `dimension_travel`: `src/event.h:104,:107`; отправка `src/game_io.cpp:744` (save, до записи), загрузка — `:463`. Документ: `doc/JSON/EFFECT_ON_CONDITION.md:1893-1896`.
- EOC-эффекты измерений (`u_travel_to_dimension`, `clear_dimension`) — единственный JSON-путь к отдельным «мирам» с принудительным сохранением.
- `talker_item::set_value` — запись переменных предмета из EOC (`src/talker_item.cpp:151`).
- `var_migration` для переименования EOC-переменных (`src/init.cpp:276`).
- Проверка результата только в `ACTION_SAVE` (`handle_action.cpp:2940-2951`) — готовый безопасный выход.
- `stats_tracker`/`kill_tracker`/`achievements_tracker` — готовые счётчики событий.
- `mapbuffer::save` выгружает подкарты вне пузыря после записи (`src/mapbuffer.cpp:178-228`); `debug_capture::on_game_load` (`src/debug_capture.cpp:239`).

## 3. Точки расширения

- События EOC `game_save`, `game_load`, `game_begin`, `dimension_travel`. Осторожно: `game_save` уходит на `game_io.cpp:744` ДО записи файлов, не «сохранение завершено».
- Хранилища данных мира: `global_val`, `u_val`, `npc_val`, `item_vars`/`variables`, `Creature::values`.
- Опции `AUTOSAVE*`, `WORLD_COMPRESSION2`.
- Мод в `data/mods` (JSON); C++ — только узкий патч (час, проверка результата в quicksave/autosave).

## 4. Чего родное не имеет (доказательство)

- Вызов save из JSON/EOC: не найдено, искал `rg "quicksave|save\(\)"` по `src/*.cpp` (остались `debug_menu.cpp:4216` и `handle_action.cpp:2953`, оба UI) и эффекты save в `doc/JSON/EFFECT_ON_CONDITION.md`; граф `trace_path` inbound `game.save` — 5 вызывающих (do_turn, autosave, quicksave, do_regular_action, handle_action), EOC среди них нет.
- Установка опции (в т.ч. AUTOSAVE) из EOC: не найдено, искал `set_option|setValue` в `src/npctalk.cpp`, `math_parser_diag.cpp`; `game_option` в math только читает (`math_parser_diag.cpp:1914`).
- Автосейв раз в игровой час опциями: не найдено; `AUTOSAVE_TURNS` 10..1000.
- Атомарный набор файлов, поколения, бэкапы, fsync: не найдено, искал `fsync|FlushFileBuffers|backup` в `src/*.cpp`; `ofstream_wrapper` — flush+rename одного файла.
- Скриптовый слой (Lua) для сохранения: не найдено, снимок без Lua.
- Результат автосохранения наружу: `autosave()`/`quicksave()` — `void` (`game_io.cpp:891,:941`).
- Идентификаторы выполненных операций (exactly-once) на диске: не найдено; по разбору сохранения при D215 не нужно.

## 5. Готовые запросы

1. Граф: `search_graph name_pattern="game.save|game.quicksave|game.autosave"`, затем `trace_path function_name="cdda-upstream-0d8843f.src.game_io.game.save" direction=outbound` (писатели) и `inbound` (кто вызывает).
2. Граф: `search_graph name_pattern="serialize_master|serialize_dimension_data|serialize_json|global_variables"`.
3. rg: `rg -n "AUTOSAVE|once_every" src/do_turn.cpp src/options.cpp src/game_io.cpp`.
4. rg: `rg -n "savegame_loading_version|savegame_version|load_migrations" src/savegame.cpp src/init.cpp`.
5. rg: `rg -n "game_save|game_load|dimension_travel" src/event.h doc/JSON/EFFECT_ON_CONDITION.md`.
6. rg: `rg -n "set_value|remove_value" src/talker_*.cpp` — какие носители принимают переменные.

## 6. Не проверено

- Игра не запускалась: поведение при ошибке записи посреди цепочки `save()` и совместная работа `AUTOSAVE_MINUTES` с `AUTOSAVE_TURNS` не наблюдались.
- JSON-синтаксис EOC для переменной предмета (есть C++ `talker_item::set_value`, в `EFFECT_ON_CONDITION.md` не описан).
- `PATH_INFO::achievementdir` на Windows; `WORLD`/`save_t`/worldfactory; `worldoptions.json` (`doc/JSON/OPTIONS.md:12-19`).
- tests/ (`force_load_game_test`, `submap_load_test`, `json_load_test`) не открывались.
- Поведение `once_every(1_hours)` при смене времени из EOC/отладки.

## 7. Правки скептика

Проверено около 60 ссылок файл:строка; подавляющее большинство подтверждено.

Исправлено:
- Структурная ошибка: `global_vals`, очередь глобальных EOC, `unique_npcs`, трекеры и `Messages` лежат в `<save_id>.sav`, а не в master.gsav; в master — `timed_events`, `item_wakeups`, счётчики id, миссии, фракции. Добавлено описание файлов над таблицей.
- `savegame.cpp:1913` не относился к timed_events: заменено на `:1654-1657`, `:1855-1859`, `:1919`.
- Приблизительные номера («~») заменены точными: `move_save_to_graveyard` `:249`, `travel_to_dimension` `game.cpp:9791-9926`, миграции `savegame.cpp:1907-1914`.
- `DIMENSIONS.md:11` -> `:16`; `OBSOLETION_AND_MIGRATION.md` перечитан (`:351-367`); пометка «запросы графа не выполнялись» убрана (граф использован, qualified name указан).
- Автосейв: пропущен реал-тайм гейт `AUTOSAVE_MINUTES` (`game_io.cpp:944`); ловушка переформулирована.
- Миграции: регистрация `var_migration` в `init.cpp:276`; мигрируются только Character и Global переменные.

Найдено сверх черновика:
- `ACTION_SAVE` проверяет результат `save()` (`handle_action.cpp:2940-2951`) — готовый безопасный выход; quicksave/autosave не проверяют.
- EOC `u_travel_to_dimension`/`clear_dimension` и `travel_to_dimension` с принудительным сохранением как JSON-путь к отдельным мирам.
- `talker_item::set_value` (переменные предмета из EOC); `unique_npcs`; `inactive_global_effect_on_condition_vector`.
- Подтверждено отсутствие: save из EOC, установка опций из EOC, fsync/бэкапы, Lua.
