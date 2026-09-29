# Проверка группы items-weapons-armour

- **Кто:** агент-верификатор (отдельный старший проход, не автор данных). Сам ничего не утверждает в статус approved, файлы данных не правил.
- **Когда:** 2026-09-26.
- **Что проверено:** `items/weapons_armour.csv`, `items/weapon_status_access.csv`, `items/weapon_equipment_profiles.csv`, `items/weapon_source_crosswalk.csv`, `items/weapon_denylist.csv`, `military/security.csv`, `military/military_events.csv`, `military/combat_likelihood_by_role.csv`, `authoring/master_military_snapshot.csv`, `authoring/master_sources_snapshot.csv`, README (группа и домены), `counts.json`, `validation_report.json`, `scripts/*.cjs`.

## Итог

**approve_with_limits для группы в целом.** Каталог видов, источники, датировки, snapshot MASTER и военные события в основном хорошие. Выдумок и анахронизмов среди видов не найдено. Нужно исправить правило права ношения (`access.json`) и tier у нескольких видов. Это правка authoring-входа и пересборка, данные вручную переписывать не нужно. До этой правки `weapon_status_access.csv` помечен **rework**.

## Детерминированные проверки (скрипты)

1. **Пересборка.** Копия группы собрана в scratch: `build.cjs` → `validate.cjs`, репозиторий worktree. Все 8 CSV совпали с лежащими в папке **байт в байт**, `counts.json` тоже совпал (кроме даты). validate: 0 ошибок, 8 предупреждений, как в отчёте.
2. **Snapshot MASTER.** `snapshot-master.cjs` заново запущен на распакованном `MASTER_ARCHIVE_v1/.../occupations`. `master_military_snapshot.csv` (210 строк) и `master_sources_snapshot.csv` (30 строк) совпали **байт в байт**.
3. **Строки, id и заполненность** (скрипт):

| Файл | Строк (скрипт) | README | Пустые source_refs | Confidence | Дубли id |
|---|---:|---:|---|---|---|
| items/weapons_armour.csv | 71 | 71 | 0 | A 21 / B 30 / C 20 | 0 |
| items/weapon_status_access.csv | 213 | 213 | 0 | A 4 / B 208 / C 1 | 0 (role×tier) |
| items/weapon_equipment_profiles.csv | 111 | 111 | 0 | B 41 / C 70 | 0 |
| items/weapon_source_crosswalk.csv | 252 | 252 | колонки нет (строка сама является ссылкой на source_id) | колонки нет (есть source_confidence) | 0 |
| items/weapon_denylist.csv | 27 | 27 | 0 | A 14 / B 11 / C 2 | 0 |
| military/security.csv | 34 | 34 | 0 | A 7 / B 15 / C 12 | 0 |
| military/military_events.csv | 21 | 21 | 0 | A 7 / B 13 / C 1 | 0 |
| military/combat_likelihood_by_role.csv | 71 | 71 | **6** (unknown) | A 1 / B 62 / C 2 / **пусто 6** | 0 |

4. **Профили снаряжения против права ношения** (скрипт). У 18 entries роль профиля получает для предмета уровень ниже `permitted_with_reason`. Разбор в разделе о профилях.
5. **Термины denylist на всём MASTER** (1137 строк, без строк D, скрипт). Подстроки дают ложные срабатывания: `горшок` — 4 названия (POT0018, POT0019, POT0021, WTR0019); `латы` — «заплаты», «палаты» (3); `с рогами` — скот LIV0002; `двуручн` — HNT0027, CRF0112; `катан` — «катание», «обкатанные» (2).
6. **Полнота crosswalk.** В MASTER найдены оружейные строки вне семи снятых категорий: FRN0002 (ливонский/балтийский боевой наконечник) и FRN0045 (скандинавский/балтийский меч) из `foreign_material_culture`. Их нет в crosswalk.

## Проверка выборки по источникам

Всего около 50 строк, по всем файлам и уровням достоверности. Открывались сами источники: MASTER, costume, TSV, sqlite, WK, библия, веб-издания.

- **weapons_armour (19 строк: 8 A, 6 B, 5 C):** wp_sword, wp_sulitsa, wp_mace, wp_flail, wp_crossbow_bolt, wp_mail_shirt, wp_battle_axe, wp_utility_axe (A); wp_lance, wp_mail_flat_ring, wp_helmet_halfmask, wp_helmet_conical, wp_mail_chausses, wp_shield_triangular (B); wp_shield_round, wp_sabre, wp_padded, wp_helmet_western, wp_staff (C). Ещё 8 видов проверены только по структуре (tier и доступ).
  - Медведев 1959 (swordmaster.org), всё подтверждено: целых мечей нет, 2 перекрестья XII–XIII вв.; 15 наконечников копий; 6 сулиц весом 60–100 г; из 75 топоров 3 боевых; 3 булавы (первая половина XIII, конец XIII — начало XIV, XIII?); 10 гирек кистеней; больше 20 болтов весом 15–30 г при стреле до 9 г; обломок сложного лука длиной 79,5 см; больше 2000 ножей.
  - Кирпичников 1971 (arheologija.ru), подтверждено: кольчуга 5,5 и 6,15 кг, не меньше 20 000 колец, 60–70 см; около 112 кольчуг; плоские кольца около 1200 г., размеры 13–16 / 2–4 / 0,6–0,8 мм; 270 пластин от 26 панцирей, один панцирь на 4 кольчуги; тип IV — первая половина XIII в.; треугольные щиты со второй четверти XIII в.; круглые щиты после X в. редки; в городищах копий в 2–7 раз больше, чем топоров; в 144 погребениях: копья 43 %, мечи и сабли 37 %, стрелы 30 %, топоры 27 %, доспех 19 %.
  - Русская Правда ПП 23 («ударить мечемь, не вынезъ его, или рукоятию… 12 гривенъ») подтверждена поиском.
  - Ссылки на MASTER, costume и WK открыты, с утверждениями строк согласуются.
- **weapon_status_access (5 ролей × 3 tier и 6 overrides):** archbishop, igumen, boyar_house_mistress, guard, hunter. Текст `weapon_rights` в TSV перенесён точно.
- **weapon_equipment_profiles (5 профилей из 16 целиком, все 111 entries скриптом):** eq_druzhinnik_field, eq_militia, eq_archer, eq_hunter, eq_messenger. Сверены с библией §10, §11, §19 и TSV weapon_access. Тексты и формулировки весов совпадают.
- **crosswalk:** все 210 строк MASTER пересняты скриптом; 4 строки costume проверены вручную (AR017, AR020, AR013, AR025).
- **denylist (8 строк):** deny_two_handed_sword, deny_katana, deny_rapier, deny_gambeson_thick, deny_heraldic_shield, deny_great_helm, deny_brigandine, deny_stone_kremlin. Ссылки на costume AR020 / AR001 / AR002 / AR015 / AR007 / AR010, MASTER WPN0024 и sqlite B002 верны: основание есть в поле do_not_confuse_with или reconstruction источника.
- **security (8 строк):** ms_unit_princely_druzhina, ms_unit_boyar_retinue, ms_unit_foreign_guests_armed, ms_post_great_bridge, ms_post_yard_gate, ms_post_storehouse, ms_fort_detinets, ms_cons_weapon_strike_fine. Сверены с sqlite: I05, I07, I12, L01, L07 (6 гривен, договор 1191–1192), L20, B002, B005, B006, B013–B016, B025, B027, B031, R10, R12, R13, social_groups. Всё совпадает.
- **events (6 строк):** 1230_strife, 1230_december, 1234_rusa, 1238_torzhok, 1242_pskov_ice, 1245_toropets. Сверены с sqlite events и таймлайном; поля таймлайна скопированы скриптом.
- **combat_likelihood (5 строк):** tysyatsky, servant, toll_collector, prince, archbishop. Сверены с TSV occupations и Несиным (cyberleninka).

## Вердикты по файлам

### items/weapons_armour.csv — approve_with_limits

Выдумок и анахронизмов не найдено. Периоды, материалы и массы соответствуют источникам. Числа масс взяты только из источников. Основания частот записаны. Требуются исправления:

1. **Tier по наследованию от родителя даёт неверный доступ.** `wp_maintenance_kit` (точильный брусок, масло, ветошь) и `wp_military_gloves` (кожаные или шерстяные рукавицы) получают elite_war. Их `status_access` — только 11 элитных ролей, а точило есть у всех. Нужен собственный tier: tool_weapon или вне права ношения.
2. **Стрелы и охотничьи наконечники при охотнике.** `wp_arrow`, `wp_quiver`, `wp_ah_blunt` (томар для пушной охоты) и `wp_ah_broad_hunting` имеют tier common_war. Поэтому `nov_role_hunter` получает `suspicious_without_reason` на собственные стрелы и колчан, хотя лук ему expected. Этого охотника нет в `status_access` этих строк, а приоритет у строк M2c. Нужно понизить tier охотничьих стрел и наконечников либо расширить override охотника.
3. **Кистень и булава как elite_war — не обосновано.** Medvedev и AR025 описывают кистень как «воины, ополченцы и горожане»; в MASTER у WPN0070 то же. У булавы в AR024 указан «средний и высокий военный слой». Для кистеня нужен common_war, либо запись источника в основании.
4. **wp_sword, freq_basis.** 37 % в погребениях XII–XIII вв. у Кирпичникова — это мечи **и сабли** вместе, и выборка в основном южная (Поросье). Сейчас цифра приписана одним мечам.
5. **wp_shield_round.** `freq_armed = contextual` противоречит главному научному источнику: Кирпичников пишет, что после X в. такие щиты редки. Нужно `rare`, пока нет новгородской находки XIII в.
6. **wp_helmet_conical (B, contextual).** Кирпичников пишет, что русские экземпляры типа I в XIII в. не прослеживаются. Основание «37 шлемов» частоту не подтверждает. Нужно C или rare.
7. **wp_mail_flat_ring.** Термин «байдана» относится к XVI–XVII вв. Для 1230 г. в `name_ru` его лучше не использовать: LLM будет строить прозу по названию.
8. **wp_staff.** Батог и жердь — это отдельная статья Русской Правды, а не ПП 23. Ссылка `lit:russkaya_pravda_pp23` приписана неверно.
9. **wp_club в одной категории с wp_mace** (`cat_item_object_mace_v1`) при разных tier: tool_weapon и elite_war. Если доступ считается по категории, одна категория получит два уровня права. Нужна отдельная категория дубины.
10. **Дубли между доменами** (передать в category_registry). Рогатина: здесь `cat_item_object_rogatina_v1`, в crafts-tools `tl_hunting_spear` → `cat_item_object_spear_v1`. Томар: здесь `cat_item_object_arrowhead_v1`, в crafts `tl_tomar` → `cat_item_object_arrow_v1`. Ножны ножа: здесь `cat_container_form_knife_sheath_v1`, в household `cat_item_object_knife_sheath_v1`. Ещё охотничий лук и стрела (`tl_hunting_bow`, `tl_hunting_arrow`) и нож в трёх доменах. Без дедупликации частоты присутствия могут учитываться дважды.
11. `status_access` и `expected_for_roles` унаследуют все исправления из `weapon_status_access.csv` (ниже).

### items/weapon_status_access.csv — rework

Правило «класс из текста TSV × матрица» воспроизводится точно. Но результат содержит историческую ошибку, а README её не отмечает:

1. **Духовенство.** `nov_role_archbishop` получает `permitted` для elite_war, `nov_role_igumen` — `permitted_with_reason`. Поэтому архиепископ и игумен входят в `status_access` меча, кольчуги, шлемов и т. п. Священник, дьякон и монах получают `requires_grounds`. Каноническое право запрещает клирикам лично носить оружие. Текст TSV у архиепископа («знак власти и охраны») говорит о его вооружённых людях, а не о личном ношении. Нужен override для духовных ролей: личное боевое оружие — не допускается или raises_accusation_risk, охрана — через `bishop_man` и `church_guard`.
2. **nov_role_boyar_house_mistress** получает `permitted_with_reason` для elite_war. Сборщик пробел указал, но строка всё равно попадает в `status_access` меча и кольчуги. До исправления TSV нужен override.
3. **Охотник:** override покрывает только tool_weapon (см. пункт 2 для weapons_armour).
4. **Завышенная достоверность overrides.** Для druzhinnik и prince стоит A, хотя основания — status_rules, TSV, библия, sqlite и WK-claim по Britannica с confidence medium. Это не первичный и не археологический источник, должно быть B.

### items/weapon_equipment_profiles.csv — approve_with_limits

Формулировки весов проверены по библии и TSV, 8/4/2/1 назначены по правилу. Скрипт нашёл 18 entries с доступом ниже допустимого:
- eq_militia — 8 entries. Копьё, щит и прочее у householder, journeyman и других при `requires_grounds` или `suspicious_without_reason`. Контекст `militia_callup` должен работать как «основание», но в данных это не выражено: нужна запись, что профиль с `context=militia_callup` сам даёт основание;
- eq_hunter — 4 и eq_archer — 3: стрелы, колчан и сложный лук у охотника подозрительны;
- eq_junior_druzhinnik — 2: меч и кольчуга;
- eq_sotsky — 1: копьё.

eq_messenger без роли выбирает «редкое боевое оружие» `wp_flail`, но основание этого выбора не записано. `eq_storehouse_keeper` привязан к `nov_role_guard`; допустимо, но стоит проверить по TSV occupation.

### items/weapon_source_crosswalk.csv — approve_with_limits

Все 210 строк MASTER и 42 строки costume сопоставлены, snapshot точный. Не хватает FRN0002 и FRN0045 (оружие в категории `foreign_material_culture`) — их нужно сопоставить: вероятно, с `wp_sword` и `wp_arrow`/наконечниками как иноземный вариант, либо с denylist. Шпоры HRS0033/0034 разумно оставить домену конского снаряжения. Колонок source_refs и confidence нет, но для таблицы сверки это приемлемо: `source_id` сам по себе является ссылкой.

### items/weapon_denylist.csv — approve_with_limits

Содержание запретов обосновано, ссылки верны. Ограничения:
1. `match_terms` — это подстроки, и на всём MASTER они дают ложные срабатывания (см. проверку 5): «горшок» (кухонная посуда!), «латы» (заплаты, палаты), «с рогами» (скот), «двуручн», «катан». Вероятные срабатывания также: «пушк» (опушка), «забрал» (забрали), «латн» (платно, платный), «gun». Для применения к прозе или к другим доменам нужны границы слов и область применения (только оружие и доспех), иначе фильтр будет вырезать допустимое.
2. У `deny_later_halfmask`, `deny_mongol_default` и `deny_late_rampart` пустые `match_terms`, поэтому скриптом они не применяются.
3. `deny_great_helm` и `deny_kettle_hat` запрещают вещь новгородцу, а для приезжего ливонского рыцаря 1230-х вещь допустима. Это правильно отражено в reason и должно сохраниться при загрузке как запрет с исключением, а не как абсолютный запрет.

### military/security.csv — approve_with_limits

Строки A и B подтверждаются sqlite и WK. Посты, у которых нет прямого свидетельства (ворота, Торг, дорожная сторожа, церковь), честно помечены C. Ограничения:
- у `ms_post_great_bridge` стоит A, но A относится к месту конфликта, а постоянная стража не подтверждена (сказано в note). При загрузке пост не должен порождать постоянных стражников;
- ссылки `sqlite:events:<date>` неоднозначны: у ключа `1230-лето` два события;
- `ms_unit_gridba` и `ms_unit_strelci` опираются на НПЛ 1234 только через вторичную передачу, B — верхняя граница.

### military/military_events.csv — approve

Выборка совпадает с sqlite и таймлайном; даты, известные по летописи (Торжок 5 марта 1238, бой 5 апреля 1242, Нева, Копорье, Шелонь 1239), соответствуют НПЛ. Статус needs_review у 1245 г. отражён в C. Ограничение общее для домена: сверки с Насоновым нет, опора — таймлайн аудита (Michell & Forbes).

### military/combat_likelihood_by_role.csv — approve_with_limits

Правило воспроизводится. Ограничения:
1. **Правило максимума завышает оценку у широких ролей.** `servant` получает medium_high из-за занятия junior_retainer, `toll_collector` — medium_high из-за market_guard. Нужно правило по основному занятию или по взвешенному среднему, либо пометить роли, где результат определяет чужое занятие.
2. **tysyatsky = low** противоречит источнику самого сборщика. У Несина тысяцкий участвует в походах, а Фёдор Якунович пал в бою с Литвой в 1234 г. Посадник тоже водил полки, поэтому unknown у него — слишком слабый результат при имеющихся данных.
3. Шесть строк unknown не имеют ни source_refs, ни confidence. Они заявлены как пробел, но формально правило «каждая строка с источником и confidence» не выполнено: такие строки нужно исключить из загрузки или явно пометить как gap.

### authoring/master_military_snapshot.csv, master_sources_snapshot.csv — approve

Пересняты скриптом, совпали байт в байт.

## Что не найдено

Выдуманных вещей, чисел или событий не найдено. Все проверенные числа есть в источниках. Анахронизмов среди видов нет: поздние формы вынесены в denylist. Коллизий id внутри группы нет.

## Что остаётся за автором и координатором

- Правки идут в authoring: `access.json` (overrides для духовенства, хозяйки боярского двора и стрел охотника) и `weapon_kinds.json` (tier у maintenance_kit, military_gloves, arrow, quiver, охотничьих наконечников и flail; частоты у round shield и conical helmet; название flat ring; ссылка у staff; категория club), затем `build.cjs` и `validate.cjs`.
- Добавить FRN0002 и FRN0045 в crosswalk.
- Denylist: границы слов и поле области применения.
- Дедупликация категорий с crafts-tools и household в домене category_registry.
- Непроверенными остаются пробелы, указанные сборщиком: МИА 65 без OCR, вып. 2 Кирпичникова в пересказе, НПЛ 1233–1245 без Насонова.

## Исправления 2026-09-26

Правка касается только файлов, помеченных **rework**: `items/weapon_status_access.csv` (и его authoring-вход `authoring/access.json`, `authoring/literature.json`, README и пересборка). Прочие файлы группы не тронуты.

- **`authoring/access.json` (overrides, раздел «Духовенство», пункт 1 вердикта по `weapon_status_access.csv`).** Добавлены отдельные overrides для `nov_role_archbishop`, `nov_role_igumen`, `nov_role_priest`, `nov_role_deacon`, `nov_role_monk`: личное боевое оружие (`common_war`, `elite_war`) теперь `raises_accusation_risk` вместо унаследованных от матрицы `permitted` (архиепископ), `permitted_with_reason` (игумен) и `requires_grounds` (священник, дьякон, монах). Основание — общий принцип восточного канонического права (запрет клирикам лично применять оружие под страхом отлучения), запись как аналогия с confidence C; `tool_weapon` (нож, посох) не тронут. Вооружённая охрана и «знак власти» у архиепископа остаются за отдельными служебными ролями `nov_role_bishop_man` и `nov_role_church_guard`, а не за личным доступом архиепископа/игумена.
- **`authoring/access.json` (пункт 2 вердикта — boyar_house_mistress).** Добавлен временный override для `nov_role_boyar_house_mistress`: `common_war`/`elite_war` понижены с `permitted_with_reason` (класс R_status из TSV) до `suspicious_without_reason`, confidence C, до правки самой роли в домене social_strata (известный пробел, не устранён этой правкой).
- **Пункт 3 вердикта (охотник, tool_weapon override) и пункт про tier `wp_arrow`/`wp_quiver`/охотничьих наконечников — не тронуты.** Это правка `weapon_kinds.json`/`items/weapons_armour.csv`, файл не помечен rework; оставлено координатору.
- **`authoring/access.json` (пункт 4 вердикта — завышенная достоверность).** Confidence overrides для `nov_role_princely_druzhinnik` и `nov_role_prince` понижена с A до B: основания (statusrules, TSV, библия, sqlite, WK-claim по Britannica с confidence medium) не являются первичным или археологическим источником.
- **`authoring/literature.json`.** Добавлены два источника уровня C для основания клирик-overrides: `sokolov_2016_ancient_church_clergy_weapons` (В. Д. Соколов, «Занимательная история Древней Церкви», book_id 877674, ¶866 — на Востоке участие клириков в войнах с оружием было строго запрещено под страхом отлучения) и `guryev_2020_alexander_nevsky_clergy_weapons` (В. И. Гурьев, «Загадки сражений Александра Невского», book_id 828627, ¶1011 — оружие в руках монахов противоречило христианским представлениям). Оба — общий канонический принцип, применён как аналогия к Новгороду 1230 г., не новгородский первоисточник.
- **Пересборка.** `node scripts/build.cjs` → `node scripts/validate.cjs`: 0 ошибок, 8 предупреждений (без изменений), 1437 резолвнутых ссылок (было 1439, посчитано скриптом, не вручную — разница от замены источников у изменённых overrides). Число строк файлов не изменилось: `items/weapon_status_access.csv` — 213 (роль × tier), `items/weapons_armour.csv` — 71.
- **Производные изменения в `items/weapons_armour.csv` (не rework, но пересобран тем же build.cjs из общего authoring-входа: столбцы `status_access`/`expected_for_roles` выводятся из access.json).** Архиепископ, игумен и боярская домоправительница ушли из `status_access` меча, кольчуги, шлемов и прочих elite_war/common_war видов (например, `wp_sword.status_access` больше не включает `nov_role_archbishop`, `nov_role_igumen`, `nov_role_boyar_house_mistress`). Строки самого CSV (виды, массы, freq_basis, denylist-термины и т. п.) не редактировались вручную — файл целиком получен пересборкой.
- **`items/README.md`.** Обновлены счётчик overrides (6 → 12, с перечислением новых), таблица уровней доступа (`permitted 65, suspicious_without_reason 69, requires_grounds 29, permitted_with_reason 9, raises_accusation_risk 22, by_order_only 9, expected 7, depends_on_guarantor 3` вместо старых чисел), число резолвнутых ссылок (1439 → 1437) и запись про boyar_house_mistress в разделе «Известные пробелы» (override добавлен, правка TSV социальных ролей всё ещё не сделана).
- **`README.md` (группа).** Обновлено число резолвнутых ссылок (1439 → 1437) в «Итог проверки».
- **Не тронуто по scope.** Остальные вердикты `approve_with_limits` из раздела выше (`weapons_armour.csv` пункты 1–10, `equipment_profiles.csv`, `crosswalk.csv`, `denylist.csv`, `security.csv`, `combat_likelihood_by_role.csv`) не входят в единственный rework-файл этой задачи и оставлены координатору/автору для отдельной правки `weapon_kinds.json`, `equipment_profiles.json`, `denylist.json`, `military.json` и category_registry, как указано в разделе «Что остаётся за автором и координатором» выше.

## Повторная проверка 2026-09-26

- **Кто:** независимый повторный проверяющий (старший проход, не исправитель). Файлы данных не правил.
- **Объём:** единственный rework-файл `items/weapon_status_access.csv` и его вход `authoring/access.json`, `authoring/literature.json`; производный `items/weapons_armour.csv` — только в части `status_access`.

### Детерминированные проверки (скрипт)

1. Копия группы собрана в scratch (`build.cjs` → `validate.cjs`, REPO указан на Novgorod-game-base). Все 8 CSV, `counts.json` и `validation_report.json` совпали с лежащими в папке **байт в байт**. validate: 0 ошибок, 8 предупреждений.
2. `items/weapon_status_access.csv`: 213 строк, 71 роль × 3 tier, дублей role×tier 0, пустых source_refs 0, confidence B 200 / C 13 (было A 4 / B 208 / C 1). Уровни: permitted 65, suspicious_without_reason 69, requires_grounds 29, permitted_with_reason 9, raises_accusation_risk 22, by_order_only 9, expected 7, depends_on_guarantor 3 — совпадает с `counts.json` и `items/README.md`. Overrides в `access.json`: 12, как в README.
3. Ни archbishop, igumen, priest, deacon, monk, ни boyar_house_mistress больше не входят в `status_access` видов common_war/elite_war. `wp_sword.status_access`: prince, posadnik, tysyatsky, city_elder, princely_druzhinnik, boyar, merchant_guest, foreign_guest.

### Выборка (16 строк)

Строки common_war/elite_war для archbishop, igumen, priest, deacon, monk (10), boyar_house_mistress (2), prince (2), princely_druzhinnik (2), а также для контроля tool_weapon у этих ролей и все три tier у bishop_man, church_guard, hunter. Абзацы книг открыты в индексе только для чтения: book:877674 §Часть V > Глава вторая > 1. На Западе ¶866 (Соколов 2016) и book:828627 §Глава III > Рыцарские ордены ¶1011 (Гурьев 2020). Оба текста подтверждают заявленное: запрет клирикам воевать с оружием на Востоке и «духовенство не должно проливать кровь». Текст `status_weapon` в statusrules открыт, строка TSV хозяйки боярского двора тоже.

### Пункты исходного вердикта

1. **Духовенство — исправлено.** Личное боевое оружие: `raises_accusation_risk`, C, аналогия по каноническому праву. Ограничение: этих абзацев нет в проверенном evidence CSV. Они найдены прямо в индексе и дословно подтверждены при этой проверке.
2. **boyar_house_mistress — исправлено временно.** Override `suspicious_without_reason`, C. Опора только на `statusrules:status_weapon`: правило прямо её не называет, это модельное решение до правки TSV в social_strata.
3. **Охотник и стрелы — не исправлено.** `nov_role_hunter` × common_war = suspicious_without_reason, `wp_arrow` остаётся common_war. Override на весь common_war был бы неверен (дал бы expected на копья и щиты), поэтому правка действительно лежит в tier `weapon_kinds.json` (пункт 2 вердикта weapons_armour). Проблема остаётся открытой.
4. **Достоверность overrides druzhinnik и prince — исправлено:** A → B.

### Новые замечания

- В `access.json` и в `basis` у архиепископа написано, что охрана идёт «через override ролей bishop_man/church_guard». Таких overrides нет: `nov_role_bishop_man` common_war = requires_grounds, `nov_role_church_guard` = suspicious_without_reason. Текст надо исправить на «через отдельные служебные роли по их собственному классу». Новый override допустим только с источником 1230 г.: владычный полк — более поздний.
- Опечатка со смешанным алфавитом в note хозяйки двора: «personal boевое» → «личное боевое».
- У клириков tool_weapon = permitted, и в него попадают `wp_rogatina`, `wp_bow_self`, `wp_sling`. Это следствие tier в `weapon_kinds.json`, а не overrides. Стоит учесть вместе с пунктом 3.
- В `literature.json` ссылка оформлена как `book:<id>`, а раздел и абзац вынесены в title. Формат `book:<id> §… ¶…` не соблюдён, но ссылка разрешается однозначно.

### Вердикт

- `items/weapon_status_access.csv` — **approve_with_limits** (было rework). Главная историческая ошибка (духовенство) и завышенная достоверность устранены, сборка воспроизводится байт в байт. Остаются пункт 3 (стрелы охотника зависят от tier в weapon_kinds), неверная ссылка на несуществующие overrides bishop_man/church_guard в тексте basis и опечатка.
- `items/weapons_armour.csv` (производные столбцы) — вердикт не меняется: approve_with_limits, пункты 1–10 исходного вердикта открыты.

## Правки C002

Добавлен кандидат `items/role_tier_pf_crosswalk.csv`: 628 строк (`source` 80, `rule` 427, `no_source` 121); все 44 `pf_id` и 16 `pf_kind` представлены. `python -B scripts/pf_crosswalk.py --check` сверяет таблицу побайтно с таблицами security, снаряжения, доступа, оружия, ролей и PF, включая разрешение ID и отсутствие дублей. Данные не утверждены.

## Независимая проверка C001b/C002 (Claude Opus 5.5, коммит fe11f19b)

Второй проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### items/role_tier_pf_crosswalk.csv — rework

Проверено: Claude Opus 5.5 (независимая проверка C001b/C002, коммит fe11f19b).

**Механика (скрипты в scratch, `git status` чистый).**
- 628 строк: source 80, rule 427, no_source 121. Все `candidate`.
- `pf_crosswalk.py --check` (только чтение): PASS, таблица побайтно воспроизводится.
- Независимый пересчёт из security.csv × weapon_status_access: ожидалось 507 троек роль × уровень × PF со связью, получено 507, лишних и пропущенных нет. security_ids совпадают во всех строках.
- access_level и pf_kind совпадают с источниками в каждой строке. Каждая ссылка на security и снаряжение разрешается, дублей ключа нет.

**Главный вопрос: право доступа не стало утверждением о наличии.** Соблюдено. В таблице нет веса, частоты и слотов. access_level переносится как ограничение. README прямо пишет, что строка не утверждает наличия оружия в месте.

**Выборка.** 16 строк по seed 20260927: 6 source, 7 rule, 3 no_source. Каждая сверена со строкой security (роли, pf_ids), с записями снаряжения (роль, wp_id → effective_tier) и со строкой доступа. Выдуманных значений нет.

**Находки.**
1. **Существенная.** Скрипт ищет снаряжение только по `role_id`. У eq_militia и eq_archer роли записаны в `base_role_ids`, поэтому городское и волостное ополчение не дают ни одной строки source.
   - 94 строки помечены `rule`, хотя по определению README это `source`.
   - Пример: мастер × common_war × town_street, где у eq_militia есть копьё и щиты.
   - Затронуты road, town_street, market_square, river_wharf и другие.
   - Это 18,5% связанных строк. `--check` этого не ловит, потому что сверяет байты, а не правило.
2. Контекст профиля не учитывается. 19 строк source держатся только на походных наборах в городе: боярин и князь «в походе» во дворе и на улице, младший дружинник (field) на торгу.
3. Нет confidence. За строками source стоят записи снаряжения C 178 и B 90.
4. Строки-последствия (пленные, раненые, заложники) перемножены со всеми уровнями оружия: это шум.

**Ограничения.**
- Места берутся только из security.csv. 7 из 16 целевых PF (болото, бор, пойма, опушка, угодье, ручей, русло) есть только как no_source, в том числе охотничье угодье, хотя профиль охотника существует. Проверка «16/16» засчитывает no_source как покрытие.
- 3 строки source со стрелами охотника при доступе suspicious_without_reason унаследованы от п. 3 weapon_status_access.

Итог: ничего не выдумано, право доступа не превращено в наличие. Но производный столбец `basis` посчитан неверно у 94 строк: правка нужна в скрипте (`base_role_ids`) и в независимой проверке basis.

## Независимая проверка C002b/C003a (Claude Opus 5.5, коммит fb21aeaa)

Третий проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### items/role_tier_pf_crosswalk.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка C002b/C003a, коммит fb21aeaa).

**Прошлые замечания.**
- **Существенное (base_role_ids): исправлено.**
  - Скрипт сопоставляет снаряжение по `role_id` или по `base_role_ids`.
  - Diff с fe11f19b: ровно 94 перехода rule → source, другие значения basis не менялись.
  - Места и роли совпадают с прошлой находкой: road 21, town_street 20, market_square 18, river_wharf 18 и т. д.
  - Все 94 строки держатся на eq_militia и eq_archer.
  - Ещё у 6 строк, которые уже были source, добавились записи eq_archer (охотник на road, младший дружинник на town_street и town_wall_edge).
- **«`--check` не ловит правило»: исправлено.** Добавлен пересчёт basis, security_ids и equipment_entry_ids. Мутационная проверка в копии в scratch: старое сопоставление вместе со старым CSV проходит побайтную сверку, но падает на пересчёте basis. Оговорка: пересчёт использует то же толкование, что и сборщик, поэтому общую для обоих ошибку он не поймает.
- Minor 2 (контекст набора): не исправлено, охват вырос (см. ниже).
- Minor 3 (нет confidence): не исправлено.
- Minor 4 (строки-последствия): не исправлено, 54 строки rule опираются только на consequence.

**Механика (скрипты в scratch, `git status` чистый).**
- 628 строк: source 174, rule 333, no_source 121. Все `candidate`.
- `pf_crosswalk.py --check`: PASS.
- Отдельный пересчёт из security × доступ × снаряжение: 507 связанных троек, лишних и пропущенных 0. Расхождений в security_ids, equipment_entry_ids, basis, access_level и pf_kind — 0.
- У строк no_source (25 по PF, 96 по паре роль × уровень) ссылки пустые.

**Выборка.** 12 строк из 94 переходов, 6 строк с добавленными записями и 4 строки rule (seed 20260927). Каждая сверена с профилем снаряжения (wp_id → effective_tier) и со строкой security. Примеры:
- craftsman_master × tool_weapon × river_wharf: нож, топор и простой лук из eq_militia, всё tool_weapon.
- trader × elite_war × river_wharf: кольчуга и меч, eq_militia__07/08.
- householder × tool_weapon × town_wall_edge: eq_archer через ms_unit_strelci.

Выдуманных значений нет.

**Что осталось.**
- 133 из 174 строк source держатся только на наборах похода или сбора ополчения. В 34 из них access = suspicious_without_reason (наёмный работник, подмастерье, торговец, охотник, смерд). Пример: наёмный работник × common_war × town_street. Таблица не говорит, что набор носят только при сборе. Нужен столбец контекста.
- Нет confidence: у записей снаряжения за строками source B 398 и C 274, все записи eq_archer — C.
- В VERIFICATION.md нет записи о правке C002b, и остались старые числа 80/427.
- 7 из 16 целевых PF по-прежнему только no_source, security.csv не менялся. eq_militia (в библии «городской ополченец») через сельское ополчение стоит и в деревне.

Итог: главная ошибка исправлена, basis верен во всех 507 связанных строках. Годно для M2c как candidate с перечисленными ограничениями.

## Независимая проверка imp-crafts PR-A (Claude Opus 5.5, 2026-09-29)

- **Кто.** Проверял Claude Opus 5.5, независимо от автора. Автор — Codex (задача imp-crafts, PR-A), ветка `fleet/imp-crafts-a`, коммит `a68c7533` поверх main `19c4bd3c`. Данные автора проверяющий не правил. Статус данных — `candidate`.
- **Что.** Архивные решения D46 группы: 25 строк — entity 3 (HLM0013/14/18 как research_only + denylist), variant 2 (FRN0045 → `wp_sword`, MIL0026 → `wp_sword_belt`), routed 12, rejected 8. Правка маршрутов после круга 3. Общий checker владения архивными id.
- **Проверено скриптами** (копия `git archive a68c7533`; crafts и BIC — как в main):
  - две сборки `scripts/build.cjs`: hash-list группы равен коммиту и между прогонами;
  - `scripts/validate.cjs`: ok, 0 ошибок, 12 предупреждений. Из них 11 закоммиченных и 1 от среды (нет внешней sqlite). Отчёт отличается от коммита только этой строкой;
  - общий checker: 0 ошибок (272 csv, 413 архивных id, 279 владельцев); исключений для пар нет; `node --test` — 36 из 36; `build-catalog.cjs`, `build-status.mjs` — PASS; `git diff --check` — PASS;
  - полнота: из 26 строк сверки, назначенных группе, в журнале 25, каждая по одной; числа равны кругу 3. Отказы: 4 по периоду (HLM0012, ARM0024, ARM0025, HLM0006), 3 как несуществовавшие или фэнтезийные (HLM0019, ARM0021, ARM0029), ARM0030;
  - маршруты: 3 с целью в main (MIL0006 → `bp_hearth_open`, MIL0032 → `bp_awning`, AR037 → `of_warrior_male_cold_any`; на AR037 есть ответное решение clothing); 9 с `awaits_owner` (transport 6, BIC 2, crafts 1). У получателей в main сущностей для этих id нет.
- **Ограничения.**
  1. MIL0015 «Деревянная миска походная» назначена группе сверкой, но строки в журнале нет. Решение есть только в журнале BIC будущего PR-B (ссылка на `it_hh_turned_bowl`). До PR-B у строки нет решения.
  2. ARM0030 «Конский доспех» отклонён как «не норма 1230». Это не анахронизм: период содержит 1230, чужая вещь по D40 не исключается. Последовательнее оформить как HLM0013/14.
  3. HLM0013/14/18 оставлены сущностями `research_only` с denylist, по решению прошлых кругов (D40). Это расходится с буквой правила «research_only → reject». Им, как и `wp_helmet_western`, назначены `expected_for_roles` по tier; генерацию сдерживает только `generation_policy` и denylist.
  4. `validate.cjs`: проверки FRN0045 и MIL0026 закреплены по id; общий checker запускается через подмену `process.argv` и `console`.
  5. Без внешней sqlite `validate.cjs` переписывает `validation_report.json` с лишним предупреждением среды — такой файл не коммитить.

**Общий `scripts/check-archive-ownership.mjs` и `scripts/check-archive-ownership.test.mjs`: approve_with_limits.** У корня каталога своей VERIFICATION нет, поэтому оценка записана здесь.

Все требования круга 3 выполнены и подтверждены 23 мутационными пробами на копии реальных данных:
- коллизию имён гасит только решение, которое называет второй id пары;
- скобочные уточнения снимаются;
- у варианта сверяются категория и материал цели;
- `target_ref` у routed должен существовать и лежать в `target_group`;
- `awaits_owner` допустим только при пустой цели и без решения получателя;
- сущность без строки `new` — ошибка;
- HLM0013/14/18 из кода убраны;
- live-тест пробует OMI01505, OMI00990, OMI01687 и подмену OMI01504 → `mt_plinfa`.

Для данных PR-A ложных пропусков нет. **Как фильтр для импорта crafts и BIC checker пока не годится:**
- сверка материалов не сводит словари master и crafts: верные варианты OMI00221 → `mt_flax`, OMI00424 → `mt_fur`, OMI01687 → `mt_quartz_sand` падают, на черновике PR-B — 456 таких ошибок;
- поиск коллизий не видит garments, компонентов, украшений, контейнеров, частей построек, материалов BIC и ингредиентов;
- слишком широкие основы-модификаторы выбрасывают «серп», «серебро», «чернила», «бочонок», «короб»;
- цель маршрута не сверяется с решением получателя;
- `target_ref` может указывать на не-сущность;
- маршрут в свою группу не ловится;
- период у вариантов не проверяется, вместо общего правила зашит WTR0024;
- остались мёртвые фильтры категорий и фразовые исключения.

Корневые `catalog.json`, `CATALOG.md`, `scripts/domains-a.src.json`, `scripts/domains-b.src.json` — approve: добавлены только регистрации таблиц weapons и clothing.

### Вердикты по файлам imp-crafts PR-A

- authoring/archive_inclusion_manifest.json — approve_with_limits: MIL0015 без решения; отказ ARM0030 обоснован слабо
- authoring/weapon_kinds.json — approve_with_limits: три research_only шлема получают `expected_for_roles` по tier, генерацию ограничивают только `generation_policy` и denylist
- counts.json — approve
- items/archive_inclusion_ledger.csv — approve_with_limits: как у манифеста (MIL0015, ARM0030)
- items/weapon_source_crosswalk.csv — approve
- items/weapons_armour.csv — approve_with_limits: `expected_for_roles` у research_only шлемов
- scripts/build.cjs — approve
- scripts/validate.cjs — approve_with_limits: проверки FRN0045 и MIL0026 закреплены по id; общий checker запускается через подмену argv и console
- validation_report.json — approve
