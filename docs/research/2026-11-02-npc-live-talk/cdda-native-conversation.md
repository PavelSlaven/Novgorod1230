# Родные механизмы CDDA для разговора с NPC: сверка карты со снимком

Снимок: `C:\Users\Slaven\cdda-src\0d8843f` (upstream `0d8843f`). Пути ниже — от корня снимка. Проверка: `sed -n` по каждой строке, на которую опираюсь; `grep`/`rg`-поиск по `src/`, `data/json/`. Ничего не запускалось, ничего не менялось.

## Таблица

| № | нужда | родной механизм | файл:строка | что делает |
|---|---|---|---|---|
| 1 | Текущее занятие NPC | `npc::get_current_activity()` | src/npc.cpp:4334-4337 | возвращает `current_activity_id.obj().verb().translated()`; пусто, если занятия нет |
| 1 | поле `verb` у занятия | `activity_type::verb_`, `verb()`, загрузка `"verb"` | src/activity_type.h:43, :75-76; src/activity_type.cpp:92 | текст глагола занятия из JSON |
| 1 | данные занятий | `"type": "activity_type"`, `"verb"` | data/json/player_activities.json:20-22 (`"reading"`); 138 вхождений `"verb"` в файле | например «reading» |
| 1 | тег реплики `<current_activity>` | `parse_tags` | src/npctalk.cpp:2403-2407 (перегрузки parse_tags 2320, 2334) | подставляет `get_current_activity()` в реплику, если `current_activity_id` задан |
| 1 | хранение занятия NPC | `npc::current_activity_id` | src/npc.h:1478; src/npc.cpp:4066 и npcmove.cpp:4855, :4860 (ставится при `NPC_MISSION_ACTIVITY`, сбрасывается) | поле и места установки |
| 2 | место по карте мира | `overmap_buffer.ter(tripoint_abs_omt)` → `oter_id` | src/overmapbuffer.h:231 | OMT под точкой |
| 2 | название места | `oter_t::get_name(om_vision_level) const` | src/overmap_terrain.cpp:792; объявление src/omdata.h:538 (struct oter_t с 516) | имя OMT с учётом видимости |
| 2 | NPC под крышей | `map::is_outside(tripoint_bub_ms)`, `map::is_outside(tripoint_omt_ms)` | src/map.h:1232, :2829 | клетка вне здания |
| 2 | то же, по существу | `is_creature_outside(Creature)` | src/weather.h:118; вызов src/condition.cpp:1617 (`f_is_outside`) | условие «NPC снаружи» |
| 2 | условия про место в диалоге | `f_is_outside` 1614-1617; `f_tile_is_outside` 1621-1634; `f_map_in_city` 1765-1776 (`overmap_buffer.is_in_city`); проверка OMT лагеря 912-928 (`find_camp`), радиус вокруг NPC 962-983 (`points_in_radius`, `oter_no_dir_or_connections`) | src/condition.cpp (указанные строки) | условия по OMT, городу, крыше, лагерю |
| 2 | название города в реплике | тег `<city>` | src/npctalk.cpp:2569-2576 | `overmap_buffer.closest_city(abs_sub).city->name`, иначе «nowhere» |
| 3 | спит ли NPC | `Creature::in_sleep_state()` (virtual), override `Character` | src/creature.h:736; src/character.h:3504; вызовы в src/npc.cpp:2442, :2453 | проверка сна |
| 3 | тема разговора со спящим | `talker_npc::get_topics`: при `effect_sleep` или `effect_lying_down` добавляет `TALK_SEDATED` (при narcosis) или `chatbin.talk_wake_up` | src/talker_npc.cpp:159-164; `talk_wake_up` = "TALK_WAKE_UP" в src/dialogue_chatbin.h:71; сама тема data/json/npcs/common_chat/TALK_COMMON_ALLY.json:3 | игрок заговаривает со спящим — открывается тема пробуждения, а не отказ |
| 3 | отказ от разговора | `talker_npc::will_talk_to_u` | src/talker_npc.cpp:84-103 | отказ: мёртв; при `!force` — attitude `FLEE`/`FLEE_TEMP` («убегает») или `KILL` («враждебен»); проверки сна нет |
| 3 | пробуждение игроком | `npc::wake_by_player()` (narcosis → false; иначе `wake_up`, снятие `effect_sleep`, `npc_suspend`, grace) | src/npc_sleep.cpp:199-212 | будит NPC |
| 3 | обёртка пробуждения | `talk_function::wake_up(npc&)` → `p.wake_by_player()` | src/npctalk_funcs.cpp:531-534 | вызов из меню |
| 3 | кто будится по крику | `NPC_CHAT_AWAKE` → `talk_function::wake_up` для `followers` | src/npctalk.cpp:1381 (вызов); список `followers` в game::chat — 1091-1093 (`is_player_ally && is_following && can_hear`) | только последователи, по громкой команде «Stay awake!» |
| 3 | эффект сна | `effect_sleep` (`"sleep"`), `effect_lying_down` | применяется в src/talker_npc.cpp:159, src/npc_sleep.cpp:191-197 (`npc::wake_up`) | эффекты, из которых выводится сон |
| 4 | кого можно выбрать для разговора | `game::chat(optional<tripoint_bub_ms>)`: `available` = NPC или монстр с `mon_flag_CONVERSATION`; условие: тот же `posz`, `player_character.sees(here, pos)`, `rl_dist(pos_abs) <= SEEX*2` | src/npctalk.cpp:1063, условие 1070-1077 (`sees` 1075, дистанция 1076) | основной выбор собеседника по видимости и дальности |
| 4 | видимость с учётом темноты | `Creature::sees(map, tripoint_bub_ms, is_avatar, range_mod)`: дальность зависит от `ambient_light_at(t)` и `sight_range`, освещение превышает природное → `MAX_VIEW_DISTANCE` | src/creature.cpp:777-800 (перегрузка 598) | ночью видимость ограничена светом |
| 4 | слышимость | `Character::can_hear(source, volume)` (объявление); используется для последователей и охранников в game::chat | src/character.h:3992; src/npctalk.cpp:1091-1104 | слышимость команд, не выбор собеседника |
| 4 | разговор без проверки видимости | `avatar::talk_to` вызывается из меню `examine`/`interact` без `sees` | src/game.cpp:5335 (`u.talk_to(get_talker_for(who))`) | нажатие «Talk» на соседнем NPC, проверки видимости в этом пути не найдено |
| 4 | разговор на расстоянии | параметр `radio_contact` → `dialogue_by_radio` | src/npctalk.cpp:1666, :1677 | канал связи, не физическая видимость |
| 5 | фракция NPC | `npc::get_faction()` override; присвоение `my_fac` и `add_to_membership` | src/npc.h:898; src/npc.cpp:882-890; :1222-1223 | членство |
| 5 | члены фракции | `faction::members` — `std::map<character_id, std::pair<std::string,bool>>` (public-секция с 179) | src/faction.h:177-179, :201 (`add_to_membership`), :205 | список членов с именем и флагом `known` |
| 5 | «известен ли игроку» | `known_by_u` у фракции (faction_template); `npc::known_to_u` с get/set | src/faction.h:151; src/talker_npc.cpp:92 (`known_by_u = true`); src/npc.h:1496, :1754-1756 | флаги знакомства |
| 5 | соседи по радиусу | `overmapbuffer::get_npcs_near(tripoint_abs_sm, radius)` | src/overmapbuffer.h:352 (и перегрузка 364-369) | NPC в радиусе; основа для «кто рядом» |
| 5 | лагерь / двор | `basecamp`: `comp_list` (`vector<npc_ptr>`), `get_mission_workers`; поиск лагеря OMT — `overmap_buffer.find_camp` | src/basecamp.h:65, :359; src/condition.cpp:918 | отдельной функции «NPC на дворе лагеря» в basecamp.h не найдено |
| 6 | сытость | `Character::get_hunger()`, `get_stored_kcal()`, поле `stomach` | src/character.h:720, :715, :2920 | голод и желудок |
| 6 | голод как цель BT | `npc_needs_food_badly`, `npc_has_food`, `npc_can_obtain_food`, score `npc_hunger_urgency` | регистрация src/behavior_oracle.cpp:43, :48, :49, :77; реализация src/character_oracle.cpp:98, :160, :169, :251 | предикаты и score голода |
| 6 | когда ел последний раз | `stomach_contents::last_ate`, `time_since_ate()`, `ate()` | src/stomach.h:208-210, :233; src/stomach.cpp:525, :528-530 | только время, без перечня еды |
| 6 | что ел последним | событие `character_eats_item(character, item_type)` | src/event.h:306; отправка src/consumption.cpp:1392 | в событии тип еды, но хранения «последнего» нет |
| 7 | завершение занятия | событие `character_finished_activity` (character, activity, canceled) | src/event.h:46, :331-337; отправка src/player_activity.cpp:360 (кончились ходы), :398 (`canceled`) | без количества и без предмета |
| 7 | EOC по завершению занятия | `activity_type::completion_EOC`, JSON-ключ `completion_eoc` | src/activity_type.h:56; src/activity_type.cpp:101; вызов src/player_activity.cpp:353-356 (в `player_activity::do_turn`, src/player_activity.cpp:201) | EOC при завершении занятия; ни одного файла в `data/json` с `completion_eoc` не найдено |
| 7 | событие, которое можно слушать | `u_var_changed` (name, value) | src/event.h:134, :968; отправка src/npctalk.cpp:3913 | триггер на запись переменной |
| 7 | счёт выработки | `event_statistic`, `event_transformation` | data/json/statistics.json (файл); описание src/event_statistics.h | в statistics.json нет записей о крафте или `character_finished_activity` (grep `craft[^a]`, `finished_activity` — пусто) |
| 8 | смена, работа по часам | `npc_class.work_hours` (загрузка 275-277), `get_work_hours()` 434, `is_within_work_hours` 439 | src/npc_class.cpp:275-277, :434-439 | диапазон часов класса NPC |
| 8 | на смене ли сейчас | `npc::is_on_shift()`; `post_duty_of` | src/npc_arbitration.cpp:169-188 (вызов 171, 181; проверки 184 и 188) | смена из `work_hours` |
| 8 | сверка с распорядком | `npc::reconcile_schedule()`, `reconcile_schedule_on_load()`; вызов в `on_load` | src/npc.cpp:2430-2463; :3553 | приведение состояния к смене |
| 8 | пример работы по часам | `is_within_work_hours` в интеркоме | src/iexamine.cpp:1540-1542 | реальный потребитель |
| 8 | распорядок как EOC | recurring EOC: `recurrence` 95-100; `run_for_npcs` 121-124, 378; `u_run_npc_eocs` (unique_ids) — src/npctalk.cpp:6819-6893; `npc_set_goal` — src/npctalk.cpp:5205, таблица 8624; `npc_set_guard_pos` — 5236, 8625; `npc_assign_activity` — таблица 8631 | src/effect_on_condition.cpp:95-124, 378-388 | часы задаются данными EOC; готового «час → место» нет |
| 8 | возврат на пост | трейт `RETURN_TO_START_POS` | src/npcmove.cpp:1441-1446; данные data/json/mutations/npc_only.json:52-61 | возврат к точке появления |
| 9 | проверка убеждения | `talk_trial` (тип, `mod`, roll) | src/dialogue.h:81; src/npctalk.cpp:2214 (`parse_mod`), 2241 (`calc_chance`), 2291 (`roll`), 3208 (ctor) | JSON-примеры: doc/JSON/NPCs.md:776-779, :1213 |
| 9 | выдать задание | `f_assign_mission` / `f_finish_mission`; эффекты `assign_mission`, `mission_success` | src/npctalk.cpp:6141, :6161; таблица 8715-8716; список WRAP 8772-8773 | миссия игрок↔NPC |
| 9 | назначить охрану | `talk_function::assign_guard` / `stop_guard`; эффекты | src/npctalk_funcs.cpp:419, :509; WRAP src/npctalk.cpp:8796, :8799; меню 1326-1374 | поведение NPC по результату разговора |
| 9 | следовать | эффекты `follow`, `follow_only` | src/npctalk.cpp:8826-8827 | приказ следовать |
| 9 | записать состояние | `npc_add_var` (`f_add_var`), `set_string_var` | src/npctalk.cpp:8603; :8730 | хранилище переменных NPC |
| 9 | отказ | тема-отказ: `TALK_DENY_TRAIN`, `TALK_DENY_TRAIN_SEMINAR`, `TALK_DENY_PERSONAL` в failure-ветках | data/json/npcs/common_chat/TALK_COMMON_ALLY.json:151, :170, :252, :267 | JSON-ответ отказа |
| 9 | обещание | не найдено | — | см. «Не найдено» |

## Не найдено (что искал)

- Название OMT как тег реплики: в списке тегов `parse_tags` (src/npctalk.cpp:2381-2581) совпадений нет; список просмотрен до строки 2581, полный не дочитан.
- «Кто ещё на моём дворе»: в src/basecamp.h нет функции, возвращающей NPC лагеря; по `grep npc` в basecamp.h — только `comp_list`, `get_mission_workers`, `start_multi_mission`.
- Есть ли в `game::chat` проверка темноты помимо `sees`: отдельной проверки нет; освещение учитывается внутри `Creature::sees`, сам `sees` не прочитан построчно полностью.
- Обещание NPC: `grep -li promise` по src/npc*.cpp, src/npc*.h, src/npctalk*.cpp, src/dialogue*.cpp, src/talker*.cpp, src/mission*.cpp — пусто. По data/json есть совпадения вне NPC (effects.json, terrain, armor); в `npcs/` не проверял.
- Запись «что ел последним» для NPC: в `stomach_contents` перечня еды нет; что `character_eats_item` шлётся и для NPC, не проверено.
- Счётчик выработки по типу предмета (сколько досок): событий с количеством, craft-события в event.h и записей в statistics.json не найдено.
- Вызов `completion_EOC` для NPC: проверено только, что код в `player_activity::do_turn(Character&)` общий; путь NPC не прослеживал.

## Расхождения с картой

- Карта 03, строка «Торговля» / math `price()` указывает `math_parser_diag.cpp:1938`. Факт: `price` — :1937; :1938 — `price_postapoc`.
- Карта 03, строка тем разговора: `get_topics :1686/:1689` — строки верны, но обе — один и тот же цикл, повторённый дважды (src/npctalk.cpp:1686-1688 и 1689-1691). `dialogue::add_topic` (src/npctalk.cpp:2612-2619) дубли не отфильтровывает. Влияние на диалог не проверено.
- Карта 02, строка «Жизнь вне пузыря»: `npc::on_load` 3557-3680 — верно; TODO про сон у строки 3585 — верно.
- Карта 03 «`npc::say` не тратит moves»: проверено, в src/npc.cpp:2077-2120 вызова `mod_moves` нет. Верно.
- Карта 03 «`talk_trial` … NPCs.md:761–813»: примеры `trial` в doc/JSON/NPCs.md — строки 663, 697, 776-779, 1213; диапазон 761-813 частично совпадает.
- Карта 02 «`npc_arbitration.cpp:169-188`»: верно; строка 184 (`return false`) и 188 (`is_within_work_hours`) подтверждены.
- Карта 03 не упоминает: `talker_npc::get_topics` вызывает `me_npc->mod_moves(-to_moves<int>(1_seconds))` (src/talker_npc.cpp:170) — NPC тратит 1 секунду на начало разговора.

## Неопределённости

- Видимость: `Creature::sees` (creature.cpp:777-800) прочитан частично; точную связь освещения и `sight_range` не верифицировал.
- `character_eats_item` при еде NPC и порядок срабатывания `completion_EOC` для NPC — не проверены.
- Все тесты `tests/npc_talk_test.cpp` и др. не открывались; поведение в игре не запускалось.
