# Бой, проверки навыков, характеристики и состояния персонажа: родные механизмы CDDA

Снимок: upstream CDDA на пине `0d8843f` (описание — [INDEX](../INDEX.md) §0). Пути `src/`, `data/`, `doc/`, `tests/` — от корня upstream. Ничего не собиралось и не запускалось.
Источники Novgorod (`docs/plans/<имя>_2026-10-18.md`, состояние на 2026-10-19): CB = [Combat_Turns_and_Semantic_Actions_Discussion](../../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md) (158 строк), ST = [Character_States_Attributes_and_Dice_Checks_Discussion](../../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md) (162), RE = [Mechanics_Reuse_Strategy](../../../plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md) (105). «CB:27» = строка 27. Номера источников сверены с файлами документов.
Покрытие: полное (родное закрывает, нужны только данные) / частичное (родное есть, нужна сборка из JSON/EOC) / нет (с доказательством в разделе 4).

## 1. Таблица «нужда → родное»

### 1.1 Ближний бой и защита

| Нужда Новгорода (источник) | Родной механизм CDDA | C++ (файл:строка) | JSON (type, пример) | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Удар оружием/кулаком; оружие влияет на точность, скорость, усталость (CB:27, CB:12, CB:33) | `Character::melee_attack` → `melee_attack_abstract`, `hit_roll`, множитель точности, `attack_speed`, стоимость stamina | `src/melee.cpp:527`, `:563`, `:607`; `hit_roll :389` (`get_melee_hit_base :375`, `get_hit_weapon :358`); `attack_speed :2687`; `reduce_moves_from_attack :595`; бонус proficiency по stamina `:982` | `character_modifier` `melee_attack_roll_mod` (`data/json/character_modifiers.json:197`), `melee_stamina_cost_mod` (`:53`); enchantment `MELEE_STAMINA_CONSUMPTION` (`src/magic_enchantment.h:107`) | `doc/JSON/JSON_INFO.md:1234` (character_modifier), `doc/JSON/MAGIC.md:742` | Только данные: оружие `item` с `to_hit`, `techniques`; правка модификаторов — JSON `character_modifier`/enchantment. C++ не нужен | Двойной учёт: STR/DEX/INT/PER уже в формулах (`src/character.cpp:3517`, `:3523`), не добавлять второй бонус (ST:11) | полное |
| Попал или нет: бросок против уклонения (CB:27, ST:71) | `melee::melee_hit_range` = `normal_roll(accuracy*5, 25)`; `Creature::deal_melee_attack`: `hit_spread = hitroll - dodge_roll - size_penalty` | `src/melee.cpp:2963`, вызов `:432`; `src/creature.cpp:1049`, `:1055`; вызов `src/melee.cpp:635`; тот же бросок у монстров `src/monster.cpp:2250`, `:2788` и `src/mattack_actors.cpp:885` | `hit_range.json` сюда НЕ относится: `Creature::load_hit_range` (`src/creature.cpp:3685`, регистрация `src/init.cpp:328`) задаёт таблицу `dispersion_for_even_chance_of_good_hit` (`creature.cpp:3675`), читаемую `range_with_even_chance_of_good_hit` (`src/ranged.cpp:662`) — это разброс дальнего боя | `doc/JSON/JSON_INFO.md` (отдельного раздела нет) | Менять исход ближнего броска данными: enchantment `MELEE_TO_HIT` (`magic_enchantment.h:81`), `character_modifier`. Формулу `normal_roll` — только C++ | Сигма 25 зашита в `melee_hit_range`; JSON её не настраивает | полное |
| Попадание и урон (CB:27) | `Creature::deal_melee_hit`, `Character::roll_damage`, `Creature::deal_damage` | `src/creature.cpp:1079` (weakpoint `:1081`, `:1109`); `src/melee.cpp:1388`; `src/creature.cpp:1591` | `damage_type` (`data/json/damage_types.json`) | `doc/JSON/JSON_INFO.md:1431` | Данные: новые виды урона и сопротивления — JSON | Не заводить свои счётчики HP: HP частей тела уже родные | полное |
| Критический удар (CB:28) | `Character::scored_crit` | `src/melee.cpp:1123` | enchantments через `doc/JSON/MAGIC.md:775`; поля technique (`MARTIALART_JSON.md`) | `doc/JSON/MARTIALART_JSON.md:58-71` | Данные | Крита по d20 («натуральная 20») нет, см. строку d20 в 2a | полное |
| Приёмы и стили, исторический контент (CB:28, CB:36) | `martial_art` + `technique` | `pick_technique src/melee.cpp:1419`, `perform_technique :1739` (обезоруживание `:2861-2891`, снятие захвата при отбросе `:1885-1894`), `choose_attack_vector src/martialarts.cpp:1507`, `ma_requirements::is_valid_character` `src/martialarts.cpp:~744` | `martial_art`: `style_barbaran` (`data/json/martialarts.json:147`), `style_fencing` (`:537`), `style_medievalpole` (`:592`), `style_swordsmanship` (`:846`), `style_sojutsu` (`:1269`); `technique` (`data/json/techniques.json`) | `doc/JSON/MARTIALART_JSON.md` | Свои стили XIII века — новые JSON `martial_art`/`technique`; поведение — через `eocs`, `condition` и хуки `onhit_eocs`/`onmiss_eocs`/`oncrit_eocs`/`onblock_eocs`/`ondodge_eocs`/`onkill_eocs`/`static_eocs` (`MARTIALART_JSON.md:58-71`) без C++ | Русских стилей в ваниле нет: контент пишется заново | частичное |
| Удар копьём/древком через клетку (CB:31) | `Character::reach_attack` | `src/melee.cpp:1017`; enchantment `MELEE_RANGE_MODIFIER src/magic_enchantment.h:80` | флаг/поле reach у `item` | `doc/JSON/MARTIALART_JSON.md` | Данные | — | полное |
| Уклонение (CB:29) | `get_dodge`, `dodge_roll`, `can_try_dodge`, `get_dodge_base` | `src/melee.cpp:1213`, `:1264`; `src/character.cpp:3517`; `src/character.h:868` | `character_modifier limb_dodge_mod` (`character_modifiers.json:204`); enchantments `DODGE_CHANCE :75`, `FREE_DODGES :78`, `EVASION :131` (`magic_enchantment.h`) | `doc/JSON/MAGIC.md:742` | Данные | Число попыток уклонения ограничено движком (`can_try_dodge`) | полное |
| Блок щитом/оружием/конечностью (CB:29) | `block_hit`, `blocking_ability` | `src/melee.cpp:1991`, `:1961`; enchantment `BONUS_BLOCK magic_enchantment.h:77` | `limb_score block` (`data/json/limb_scores.json:26`) | `doc/JSON/JSON_INFO.md:1194` | Данные | Блок — реакция (CB:12), отдельной команды нет | полное |
| Броня: покрытие, материал (CB:30) | `Character::armor_absorb`, `deal_damage` | `src/character_armor.cpp:222`, `:262`; `src/character_health.cpp:2711` | `armor`/`material`/`damage_type` (`data/json/items/armor`, `materials.json`) | `doc/JSON/JSON_INFO.md` | Данные: историческая броня — новые item | Современные материалы фильтровать | полное |
| Раны, боль, HP частей тела (CB:30, ST:22-23) | `wound_type`, `wound_fix`, `apply_wound`; событие `character_takes_damage` | `src/wound.h:72`, `:207`; `src/character_health.cpp:2544`, выбор раны `:2707`, событие `:2633`; загрузка `src/init.cpp:511-512`; `src/bodypart.cpp:545/1115/1121` | `wound`, `wound_fix` — определений в `data/json` и `data/mods` нет (искал `rg -l '"type": "wound"' data/json data/mods`: определений нет) | `doc/JSON/WOUNDS.md:5` | Только свои JSON `wound`/`wound_fix` по WOUNDS.md; EOC-эффект `u_add_wound` (`doc/JSON/EFFECT_ON_CONDITION.md:3269`) | Движок есть, контента нет — рана без своих данных не появится | частичное |

### 1.2 Дальний бой

| Нужда | Родное | C++ | JSON | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Метание (CB:31-32) | `throw_item`, `throwing_dispersion`, `throw_dispersion_per_dodge` | `src/ranged.cpp:1618`, `:1493`, `:1480` | `character_modifier thrown_dex_mod` (`character_modifiers.json:67`); навык `throw` (`skills.json:554`) | `doc/JSON/JSON_INFO.md:2526` | Данные | — | полное |
| Лук, арбалет, прицеливание (CB:32) | `fire_gun`, `total_gun_dispersion`, `get_weapon_dispersion`, `skill_archery`, `ranged_target_size`; снаряд `projectile_attack_roll`, `projectile_attack` | `src/ranged.cpp:1093`, `:1105`, `:673`, `:2674`, `:182`, `:632`; `src/ballistics.cpp:210`, `:239` | `character_modifier ranged_dispersion_manip_mod` (`:74`); навык `archery` (`skills.json:345`); `hit_range` (`even_good`, `hit_range.json`) — только разброс | `doc/JSON/JSON_INFO.md` (gun, ammo) | Данные: исторические луки — item `GUN`/`ammo`; рецепты доиндустриального мода `data/mods/innawood/recipes` | Содержимое innawood по оружию не читал | полное (данные свои) |

### 1.3 Тактика NPC и монстров

| Нужда | Родное | C++ | JSON | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Выбор атаки/цели/дистанции без LLM на каждый удар (CB:34, CB:97) | `npc::method_of_attack`, `evaluate_best_attack`, `npc_attack_melee/gun/throw` | `src/npcmove.cpp:2482`, `:2505`; `src/npc_attack.h:80`, `:97`, `:115`; `src/npc_attack.cpp:252`, `:354`, `:449` | — | — | Использовать как есть; поведение тюнится личностью NPC | Тактика NPC — C++, JSON-правил выбора атаки нет | полное |
| Бегство, оценка опасности (CB:34) | `method_of_fleeing`, `assess_danger`, `act_on_danger_assessment`; эффект `npc_run_away` ставит движок (`npcmove.cpp:1350-1356`) | `src/npcmove.cpp:2474`, `:894`, `:1316`; `src/npc.cpp:3009`, `:3025` | `effect_type` `npc_run_away` (`effects.json:198`), `npc_flee_player` (`:204`), `npc_fire_bad` (`:210`) | `doc/JSON/NPCs.md` | Пороги паники — личность NPC; принудить бегство — EOC `u_add_effect`/`npc_add_effect` с `npc_run_away` | Порог паники (`mem_combat.panic`) считает C++ | полное |
| Правила боя для союзников (CB:34) | `combat_engagement`, `ally_rule`, `npc_follower_rules` | `src/npc.h:233`, `:313`, `:472` | диалоговые эффекты `set_npc_rule` и подобные | `doc/JSON/NPCs.md:969-996` | Диалоговые эффекты | — | полное |
| Личность и отношение NPC (ST:56-59, ST:63) | `npc_personality`, `npc_opinion` (trust, fear, value, anger, owed), `form_opinion` | `src/npc.h:216`; `src/npc_opinion.h:8`; `src/npc.cpp:1766` | `npc_personality` (`data/json/mutations/npc_personality.json`) | `doc/JSON/NPCs.md` (aspects `:1495`) | Данные + чтение из EOC через `val()`/`npc_fear()`; смысловой владелец Novgorod (ST:63): trust/fear/anger не обновлять второй раз | — | частичное |
| Монстры: ближняя атака, захват, спец-атаки, EOC-атака | `melee_actor`, `gun_actor`, `leap_actor`, `mon_spellcasting_actor`, `mon_eoc_actor`; `grab_data` | `src/mattack_actors.h:34/70/85/132/237`; бросок `src/mattack_actors.cpp:885` | `monster` + `special_attacks` (`data/json/monsters/*.json`) | `doc/JSON/MONSTER_SPECIAL_ATTACKS.md:227` (grab), `:327` (EOC attack) | Данные: звери с `melee`, `grab_data`; особая реакция — `eoc` | Люди-противники лучше как NPC, а не `monster` | полное |
| Мораль и бегство монстров | `monster::morale`, `anger`; `is_fleeing`; триггеры страха/гнева | `src/monster.h:560-561`; `src/monster.cpp:1681`, `:3674` | `fear_triggers`, `anger_triggers`, `placate_triggers`, `regen_morale` в `monster` (`doc/JSON/MONSTERS.md:147-149`, `:584`) | `doc/JSON/MONSTERS.md` | Данные | Есть только у `monster`, не у NPC | полное |

### 1.4 Время и вызов атаки

| Нужда | Родное | C++ | JSON | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Время: 1 с мира, moves как бюджет (CB:44-50) | `game::do_turn`, `moves`, `player_activity` | `game::do_turn`, `handle_action` | `activity_type` | `doc/PLAYER_ACTIVITY.md` | Использовать как есть | — | полное |
| Вызов нативной атаки из скрипта (CB:60-65, CB:98) | EOC-эффект `u_attack`/`npc_attack` (поля `technique`, `allow_special`, `allow_unarmed`, `forced_movecost`) | `talker_character::attack_target src/talker_character.cpp:1470`; регистрация `src/npctalk.cpp:8652` | `effect_on_condition` | `doc/JSON/EFFECT_ON_CONDITION.md:5219` (таблица talker `:5229-5232`: avatar и NPC, монстр нет) | Дёргать EOC из внешнего слоя; моста к `handle_action` нет (CB:98) | Только avatar/NPC | частичное |

### 1.5 Проверки навыков, броски, характеристики

| Нужда (источник) | Родное | C++ | JSON | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Характеристики влияют на исход (ST:11, ST:29) | Уже в формулах `get_hit_base`, `get_dodge_base`; proficiency-бонусы | `src/character.cpp:3523`, `:3517`; enchantment `STRENGTH src/magic_enchantment.h:40` | `proficiency` | `doc/JSON/PROFICIENCY.md:135-165` | Данные | Второй бонус сверху — double counting (ST:11) | полное |
| Навыки, опыт, ржавение (ST:29) | `Skill`, `SkillLevel` (`train`, `knowledge_train`, `rust`) | `src/skill.h:33`, `:138`; `src/skill.cpp:350`, `:404`, `:444`; enchantment `SKILL_RUST_RESIST magic_enchantment.h:102` | `skill`: speech `:4`, firstaid `:58`, swimming `:161`, survival `:280`, archery `:345`, throw `:554`, melee `:594`, bashing `:637`, cutting `:678`, dodge `:703`, stabbing `:739`, unarmed `:764` (`data/json/skills.json`) | `doc/JSON/JSON_INFO.md:2526` | Данные: свой навык — новый JSON `skill` | — | полное |
| Мастерство оружия (ST:29) | `proficiency`, `proficiency_set` | `src/proficiency.h:62`, `:120` | `data/json/proficiencies/melee_weapons.json` | `doc/JSON/PROFICIENCY.md:135-165` | Данные: русский арсенал — новые proficiency | Набор оружия современный | частичное |
| Пределы тела: хват, подъём, баланс, зрение, реакция (ST:22) | `limb_score`, `character_modifier` | `src/character_modifier.h:19` | `limb_scores.json`: manip `:4`, lift `:12`, block `:26`, vision `:40`, reaction `:54`, balance `:68` | `doc/JSON/JSON_INFO.md:1194`, `:1234` | Данные | — | полное |
| Пороговая проверка навыка (ST:74, ST:114) | Диалоговый `trial` `SKILL_CHECK` и `CONDITION` | `talk_trial::calc_chance src/npctalk.cpp:2241` (SKILL_CHECK `:2255`, CONDITION `:2258`) | `trial` в `talk_topic` | `doc/JSON/NPCs.md:759-800` | Данные | Детерминированный порог (100 или 0) | полное |
| Убеждение, ложь, запугивание (ST:73, ST:142) | `talk_trial` с модификаторами NPC | бросок `rng(0,99) < chance` `src/npctalk.cpp:2297`; практика speech `:2298-2306`; `trial_chance_mod` `src/talker_npc.cpp:279`, `src/talker_avatar.cpp:58` | enchantments `SOCIAL_*` | `doc/JSON/NPCs.md:759-800` | Данные | — | полное |
| Видимый d20: самостоятельная проверка и показ native-броска (CB:100-117, ST:113-121) | Сборка из частей: EOC `math` с `rand(N)` (целое `rng(0,round(N))`, `src/math_parser_func.h:57-60`; math-`rng(a,b)` возвращает float, `:52-55`), тернарный оператор, `jmath_function` (`src/init.cpp:275`), диалоговый `CONDITION` | RNG `src/rng.cpp:20` (`rng`), `:80` (`normal_roll`), `:126` (`x_in_y`), `:131` (`dice`) | `jmath_function`, `effect_on_condition` | `doc/JSON/NPCs.md:1303-1565`, `:1549`; `EFFECT_ON_CONDITION.md:3478` | самостоятельная d20-проверка = `1 + rand(19)` (целое 1..20) в `jmath_function` + `math` в EOC, результат сохраняется один раз, порог в `condition`; это новый бросок, не показ native-результата, у него отдельный владелец, и допустим только там, где native-броска нет; C++ не нужен | Готового глагола «проверка с броском» нет. Показ фактического native-броска: `talk_trial::roll` (`npctalk.cpp:2297`, `rng(0,99) < chance`) возвращает только bool, в тексте реплики виден процент шанса (`:2790`), число броска нет; в ближнем бою `Creature::deal_melee_attack` (вызов `melee.cpp:635`) выводит `Base hitroll`, `Dodge roll`, `Final hitspread` (`creature.cpp:1057-1075`) только через `add_msg_debug` — при `debug_mode` и фильтре `DF_CREATURE` (`messages.h:172-182`), это отладка, не игроку; `talk_trial` выводит лишь шанс в debug (`npctalk.cpp:2279`) | частичное |
| Натуральные 1 и 20 как note, не авто-крит (ST:103, ST:146) | Та же самостоятельная d20-проверка: новый бросок `1 + rand(19)` один раз записывается в переменную и сравнивается с 1 и 20 в EOC | — | EOC `math` | `EFFECT_ON_CONDITION.md` | Данные внутри обёртки | В родных `normal_roll`/crit такого понятия нет | частичное |
| Бросок успеха крафта (ST:72) | Вне области (крафт) | — | — | — | — | — | вне области |

### 1.6 Состояния персонажа

| Нужда | Родное | C++ | JSON | Документация | Как расширять минимально | Пределы и ловушки | Покрытие |
|---|---|---|---|---|---|---|---|
| Боль, кровотечение, падение, оглушение (ST:22-23) | `get_perceived_pain`, эффекты | `src/creature.cpp:2357`; `src/character.h:3399` | `effect_type`: `downed` (`effects.json:687`), `winded` (`:740`), `stunned` (`:920`), `bleed` (`:3108`), `grabbed` (`:4124`), `hypovolemia` (`:4565`); enchantments `PAIN_PENALTY_MOD_STR :70`, `BLEEDING_RATE :155` | `doc/JSON/EFFECTS_JSON.md` | Данные | — | полное |
| Болезни, яды, инфекции, опьянение (ST:24) | `effect_type`, `effect` | `src/effect.h:104`, `:263` | `poison` (`:1085`), `infected` (`:2781`), `bandaged` (`:2867`), `drunk` (`:3891`) | `doc/JSON/EFFECTS_JSON.md:323`, `:437`; EOC `u_add_effect :3444`, `u_lose_effect :3613` | Данные | Список современный: отбирать по существованию в XIII веке | полное |
| Голод, жажда, калории, витамины (ST:25) | `get_hunger`, `get_thirst`, `get_stored_kcal`, `update_stomach`, `update_health` | `src/character.h:720`, `:722`, `:715`, `:985`, `:979`; `src/character_body.cpp:365` | `vitamin` (`data/json/vitamin.json`) | `doc/JSON/VITAMIN.md` | Данные | — | полное |
| Сон, усталость, выносливость (ST:26) | `get_sleepiness`, `weariness`, stamina | `src/character.h:732`, `:4043`, `:3286`, `:3297`; `src/character_health.cpp:2221` | `sleep` (`effects.json:4223`); `stamina_move_cost_mod` (`character_modifiers.json:103`) | — | Данные | — | полное |
| Температура, мокрая одежда (ST:27) | `update_bodytemp`, `update_body_wetness`; NPC — `update_bodytemp_and_wetness` | `src/character_body.cpp:418`, `:126`; `src/npc.cpp:3538` | — | — | Использовать как есть | — | полное |
| Настроение (ST:28) | `player_morale` | `src/morale.h:21` | `morale_type` (`data/json/morale_types.json`, 94 типа) | EOC `u_add_morale :4389`, `u_lose_morale :4428`; math `morale :1932` | Данные | — | полное |
| Черты, предыстории (ST:30) | `mutation`, профессии/хобби | — | `mutation` (`data/json/mutations/`); профессии/хобби `data/mods/innawood/professions.json`, `hobbies.json` | `doc/JSON/MUTATIONS.md`, `doc/JSON/MAGIC.md:742`; EOC `u_add_trait :3535` | Данные | Большая часть мутаций — фантастика, фильтровать | частичное |
| NPC живёт по тем же правилам тела (ST:40-48) | `npc::process_turn`, `on_load` | `src/npc.cpp:3705` (stamina NPC раз в минуту), `:3557` (наверстывание не более 2 суток); `update_stamina` только для не-NPC `src/character_body.cpp:244` | — | — | Принять упрощения | Подтверждены чтением | частичное |

## 2. Родные механизмы области, которые наши документы ещё не упомянули

| Механизм | Где | Чем полезен |
|---|---|---|
| `jmath_function`: JSON-определяемые math-функции | загрузка `src/init.cpp:275`; описание `doc/JSON/NPCs.md:1549` | Многоразовая d20-проверка в JSON без C++ |
| Хуки боевого стиля: `onhit_eocs`, `onmiss_eocs`, `oncrit_eocs`, `onblock_eocs`, `ondodge_eocs`, `onkill_eocs`, `static_eocs` | `doc/JSON/MARTIALART_JSON.md:58-71` | Последствия удара/промаха/блока данными |
| Техника с EOC и условиями | `ma_technique src/martialarts.h:163`; пример `data/json/techniques.json:3541-3562` (`tec_debug_eoc_demo`) | Приём с последствием и «сдачей» данными |
| EOC-события | `src/event.h:43` (character_dies), `:62` (character_takes_damage), `:67` (character_wakes_up), `:114` (npc_becomes_hostile); таблица `doc/JSON/EFFECT_ON_CONDITION.md:1841-1903`; также character_melee/ranged_attacks_*, character_kills_monster | Типизированные сигналы исхода для нарратива |
| EOC-эффекты записи состояния: `u_add_wound :3269`, `u_deal_damage :3329`, `u_add_effect :3444`, `u_add_trait :3535`, `u_make_sound :4280`, `u_add_morale :4389`, `u_roll_remainder :2475`; нокдаун `u_knockback` | `doc/JSON/EFFECT_ON_CONDITION.md` | Родной канал изменения тела и мира |
| Math-функции чтения состояния: `armor :1882`, `effect_intensity :1896`, `hp :1922`, `morale :1932`, `pain :1936`, `skill :1944`; `rng(a,b)`, `rand(N)` | `src/math_parser_diag.cpp` (таблица dialogue_funcs ~1865-1970), `src/math_parser_func.h:52`, `:57`, список `:141-161`; описание `doc/JSON/NPCs.md:1303-1565` | Чтение состояния и броски из EOC |
| Диалоговые эффекты `hostile`, `flee`, `insult_combat`, `set_npc_rule`; условия `u_hostile`/`npc_hostile` | `doc/JSON/NPCs.md:969-996`, `:1063-1072` | Сдача, пощада, смена отношения данными |
| Диалоговые trials `NONE/LIE/PERSUADE/INTIMIDATE/CONDITION/SKILL_CHECK` + `trial_chance_mod` | `doc/JSON/NPCs.md:759-800`; `src/talker_npc.cpp:279`, `src/talker_avatar.cpp:58` | Порог/шанс как данные диалога |
| Enchantments боя и социальных проверок | `src/magic_enchantment.h:36-160` (`MELEE_TO_HIT :81`, `MELEE_DAMAGE :79`, `WEAPON_DISPERSION :90`, `COMBAT_CATCHUP :126`, `OVERKILL_DAMAGE :132`, `SOCIAL_LIE/PERSUADE/INTIMIDATE :91-93`, `STEALTH_MODIFIER :112`); `doc/JSON/MAGIC.md:742`, `hit_you_effect`/`hit_me_effect :751-752` | Модификаторы из JSON, в том числе условные |
| Слабые места | `weakpoint_attack src/weakpoint.h:29`, `weakpoint :147`; `src/melee.cpp:873`, `:2261`; `data/json/proficiencies/weakpoints.json` | «Бью в горло» внутри родного удара |
| Особые атаки | `mutation_attacks src/melee.cpp:2402`, `melee_special_effects :2276` | Нестандартные атаки данными |
| Монстровые защитные реакции | `special_when_hit`, `doc/JSON/MONSTER_SPECIAL_ATTACKS.md:315` | Ответ на удар |
| Моды: `data/mods/innawood` (`professions.json`, `hobbies.json`, NPC, рецепты), `Perk_melee`, `Standard_Combat_Tests`, `Limb_WIP`, `MMA` | `data/mods/*/modinfo.json` | Готовая основа доиндустриальной настройки; боевые данные не читал |
| Тесты боя как образцы вызова | `tests/melee_test.cpp:113-312`, `tests/melee_dodge_hit_test.cpp`, `tests/martial_art_test.cpp`, `tests/npc_attack_test.cpp`, `tests/monster_attack_test.cpp`, `tests/eoc_test.cpp` | Примеры вызова боевых функций |

## 3. Точки расширения (хуки)

- EOC-события (event_bus): `character_takes_damage` (`src/event.h:62`), `character_melee_attacks_character/monster`, `character_ranged_attacks_character/monster`, `character_kills_monster`, `character_dies` (`:43`), `character_wakes_up` (`:67`), `npc_becomes_hostile` (`:114`, срабатывает при диалоговом эффекте `hostile`); таблица `doc/JSON/EFFECT_ON_CONDITION.md:1841-1903`.
- Хуки стиля: `onhit_eocs`, `onmiss_eocs`, `oncrit_eocs`, `onblock_eocs`, `ondodge_eocs`, `onkill_eocs`, `static_eocs`, поля `eocs` и `condition` у `technique` (`doc/JSON/MARTIALART_JSON.md:58-71`).
- Enchantments: `hit_you_effect`/`hit_me_effect` (`doc/JSON/MAGIC.md:751-752`), величины `src/magic_enchantment.h`.
- Монстры: `mon_eoc_actor` (`src/mattack_actors.h:85`, `MONSTER_SPECIAL_ATTACKS.md:327`), `special_when_hit` (`:315`).
- `jmath_function` (`src/init.cpp:275`) для переиспользуемой математики.
- Моды: `data/mods/<mod>/modinfo.json`, переопределение через `copy-from`/`extend`/`delete` (`doc/JSON/JSON_INFO.md`).

## 4. Чего в CDDA действительно нет

1. Готового глагола «проверка с видимым d20 и порогом». Искал: `rg -n "d20|SKILL_CHECK" src doc` — только диалоговый SKILL_CHECK (`src/npctalk.cpp:2255`), детерминированный; как d20 не подходит. Но собирается из `1 + rand(19)` + `jmath_function` (строка в 1.5): покрытие частичное.
2. Механики «сдачи». Искал: `rg -in "surrender|give up|yield" src data/json data/mods doc`: в `data/json/techniques.json:3553` только текст отладочной техники `tec_debug_eoc_demo`; в `src/npc*.cpp`, `src/monster.cpp` по теме ничего. Ближайшее родное: диалоговые эффекты `hostile`/`flee`/`set_npc_rule` (`NPCs.md:969-996`), эффекты `npc_run_away`/`npc_flee_player` (`effects.json:198`, `:204`), мораль монстров (`monster.cpp:1681`). Сдачу собирать EOC-ом из них.
3. Специального «скрытого удара». Искал: `rg -n "sneak" src/melee.cpp src/ranged.cpp src/creature.cpp` — только `src/melee.cpp:2943` («sneakily steal», кража). Собирается данными: technique `condition` + EOC-условия видимости и enchantment `STEALTH_MODIFIER` (`magic_enchantment.h:112`).
4. Боевых намерений из свободного текста (CB:13, CB:65): аналога нет, это слой Novgorod.
5. Исторического русского боевого контента XIII века: готовых данных нет (innawood — доиндустриальный, не русский). Поиск по русским названиям оружия не запускал.
6. Определений ран в данных нет (1.1): движок есть, контента нет.

## 5. Как искать дальше

- Граф `cdda-upstream-0d8843f`, `search_graph` с semantic_query: «melee hit roll dodge», «npc fleeing panic», «martial art technique effect on condition», «monster morale fear triggers», «trial chance skill check».
- `rg -n "melee_hit_range|dispersion_for_even_chance" src`
- `rg -n "onhit_eocs|ondodge_eocs|static_eocs" src data/json doc`
- `rg -n "jmath_function" src data/json doc`
- `rg -l "effect_on_condition" data/mods` — готовые EOC-образцы.
- `rg -n "fear_triggers|npc_run_away" src data/json`

## 6. Не проверено

- Тела функций читались выборочно (`hit_roll`, `deal_melee_attack`, `calc_chance`, `trial_chance_mod`, `npc::process_turn`); остальное — по имени и расположению.
- Целиком не читались `techniques.json`, `martialarts.json`, `effects.json`, `character_modifiers.json`: подтверждены id и строки, не значения.
- Содержимое `data/mods/innawood` (оружие, NPC, профессии), `Perk_melee`, `Standard_Combat_Tests`, `Limb_WIP`, `MMA`; тела тестов `tests/`.
- Калибровка шума d20 (CB:111) и статистика `normal_roll` не считались.
- Граф `cdda-upstream-0d8843f` не запрашивался (поиск rg и чтением); `Vertical_Slice_Implementation_Plan` и документ видения игры (память проекта, вне репозитория) не читались.
- Для rg недоступен `doc/JSON/JSON_LOADING_ORDER.md` (ошибка доступа ОС).

## 7. Правки скептика

Ссылки: сверено около 320 токенов файл:строка черновика (скрипт + ручной sed); неверных номеров строк не найдено. Номера источников CB/ST (CB 12, 27-34, 36, 44, 60, 97-100, 111; ST 11, 22-30, 40, 56, 63, 71-74, 100, 103, 113-114, 125, 142, 146) сверены с файлами документов в `docs/plans/`, все на месте.

Исправлены описания:
- `hit_range.json` был «не прослежен» и стоял рядом с `melee_hit_range`: это путало. Он грузится `Creature::load_hit_range` (`creature.cpp:3685`, `init.cpp:328`) в таблицу разброса дальнего боя (`ranged.cpp:662`). Ближний бросок — только `normal_roll(accuracy*5, 25)` (`melee.cpp:2963`); тот же бросок у монстров (`monster.cpp:2250`, `mattack_actors.cpp:885`).
- Диапазон `math_parser_diag.cpp:1882-1972` выходил за таблицу (1972 — weather): сужен до ~1865-1970.
- `rand(N)` дополнен `rng(a,b)`; d20 и натуральные 1/20 переведены из «НЕТ» в «частичное» (самостоятельная проверка из `jmath_function` + `rand`; показ native-броска — только отладочный вывод ближнего боя); «сдача» — не «ничего нет», а сборка из диалоговых эффектов, `npc_run_away` и морали монстров.
- Фраза «других JSON-способов не нашёл» в 1.4 убрана как слишком сильная; оставлено подтверждённое (`u_attack`/`npc_attack`).

Найдено сверх черновика: хуки `onhit/onmiss/oncrit/onblock/ondodge/onkill/static_eocs` и поля technique (`MARTIALART_JSON.md:58-71`); `jmath_function`; диалоговые trials и `trial_chance_mod`; диалоговые эффекты `hostile/flee/set_npc_rule`; эффекты `npc_run_away`/`npc_flee_player`/`npc_fire_bad`; мораль и триггеры страха монстров (`monster.cpp:1681`, `MONSTERS.md:147`); `mon_eoc_actor`, `grab_data`, `special_when_hit`; math-функции `rng`, `limb_score`, `npc_fear`; `u_knockback`, `u_roll_remainder`; тесты боя как образцы; мод innawood (профессии/хобби).

«Как расширять»: везде первым JSON/EOC (стили, хуки, jmath_function, effect_type, диалоговые эффекты); C++ упомянут только для формулы `normal_roll` и выбора атаки NPC, где JSON-аналога нет.
