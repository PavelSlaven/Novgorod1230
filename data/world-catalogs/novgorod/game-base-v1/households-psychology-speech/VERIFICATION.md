# VERIFICATION — households-psychology-speech

- Кто: независимый verifier-агент (не автор данных), проход старшей модели.
- Когда: 2026-09-26.
- Что проверено: `data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/`
  (все 7 CSV, 5 README, `scripts/build.py`, `scripts/check.py`, `scripts/build_report.json`).
- Итог по группе: **rework**. Статус всех таблиц остаётся `candidate`; ни одна таблица целиком не утверждена.

## Метод

1. Подсчёт строк, пустых `source_refs`/`confidence`, дублей id, распределений значений — скриптом (python, scratch).
2. `python scripts/check.py` — `OK: all checks passed` (проверяет только формат, не содержание).
3. Воспроизводимость: `build.py` перезапущен в scratch-копии с теми же входами — все 7 CSV побайтно совпали.
4. Сверка с источниками:
   - все 8 claims WK `production-v1/family-social-context.json` (subject, object, qualifiers, evidence, review_status);
   - 139 строк occupations/roles TSV — сверка полей источника на «шаблонность» (число distinct значений по каждому полю TSV);
   - все 25 терминов родства, 3 формулы обращения, 3 строки Русской Правды — по книжной evidence
     `servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv` (255 строк, verified; rejected.csv пуст)
     и общеизвестному тексту Пространной редакции Русской Правды.
   - Проверено содержательно ≥ 50 строк (все строки малых файлов + стратифицированно по TSV-производным файлам, все уровни A/B/C).

## Счётчики (скрипт)

| Файл | Строк | README | Пустые source_refs | Дубли id | Confidence |
|---|---|---|---|---|---|
| households_kinship/household_composition_profiles.csv | 139 | 139 | 0 | 0 | A 14, B 125 |
| households_kinship/marriage_inheritance_rules.csv | 8 | 8, но «A 0, B 5, C 3» — **неверно** | 0 | 0 | B 8 |
| households_kinship/kinship_terms.csv | 25 | 25 | 0 | 0 | B 25 |
| npc_psychology/psychology_profiles.csv | 139 | 139 | 0 | 0 | C 139 |
| speech_address/speech_registers.csv | 71 | 71 | 0 | 0 | C 71 |
| speech_address/address_forms.csv | 3 | 3 | 0 | 0 | A 1, B 1, C 1 |
| social_norms_honour_hospitality/norms.csv | 11 | 11 | 0 | 0 | B 11 |

## Корневая проблема группы

Входные поля TSV, из которых выводятся профили, почти все — шаблонный текст, одинаковый для всех строк
(distinct = 1 по скрипту): в roles TSV — `family_pattern` (3), `household_pattern`, `typical_dependents`,
`typical_fears`, `literacy_expectation`, `languages_or_speech_notes`, все четыре `attitude_*`; в occupations TSV —
`family_pattern`, `household_pattern`, `common_goals`, `common_fears`, `common_conflicts`, `witness_likelihood`,
`theft_risk`, `social_risk_if_insulted`, `typical_debts`. Детерминированный вывод из шаблона даёт шаблон:
таблицы формально покрывают 68+71 строк, но содержательно не различают роли. Поверх этого не использована
уже собранная и проверенная книжная evidence этой же группы (255 строк: 130 households_kinship, 68 speech_address,
57 npc_psychology, A 132 / B 123); README ошибочно пишет, что она «не запрошена».

## Вердикты по файлам

### household_composition_profiles.csv — rework
- `family_pattern_ru`: 4 distinct значения на 139 строк; `household_pattern_ru`: 2. Это копия шаблонного
  текста TSV («типовая семья не создаётся автоматически…»), а не состав двора.
- Ключевые поля брифа отсутствуют: `members[relation, sex, age_band, min, max]`, `servants_dependants`,
  `kinship_terms`, `customs_refs`. Лимиты для генерации и проверки биографии (D1) из таблицы получить нельзя.
- 14 строк с confidence **A** получены правилом «TSV confidence high → A». Это неверная атрибуция: A — первичный/
  археологический источник, а TSV сам помечен как «региональная социальная реконструкция… не академическая монография».
  Максимум B, для шаблонного текста — C.
- `wealth_band` смешивает две шкалы (`typical_status_range` и `social_rank`: `elite`, `outcast`, `dependent`,
  `low-variable`…), 12 разных значений без закрытого словаря.
- Не использованы: book evidence households_kinship (`quantity` 7, `dimensions` 3, `social_rule` 86), v6 g3
  household_estimate/household_mix, rus13tpl household_wealth_profiles, audit status_rules.

### marriage_inheritance_rules.csv — approve_with_limits
- Все 8 строк точно переносят approved claims WK (claim_ref, subject, object, evidence, confidence medium → B) — сверено.
- Ограничения:
  - по теме файла подходят только 4: RP ст. 93 ×2, ст. 96, грамота 9. Строки `collector-instruction` (гр. 7),
    `priest-fragment` (гр. 87), `settlement-demand` (гр. 112), `podvoisky pochestie` (гр. 147) к браку и наследованию
    не относятся;
  - `statement_key` — машинный ключ без человеческого описания; qualifiers `typicality`/`directness` (все `inferred`,
    кроме гр. 147) потеряны;
  - те же id `claim:*` повторно используются как `sn_id` в norms.csv (межфайловое дублирование одной сущности);
  - README домена указывает «A 0, B 5, C 3», по факту B 8;
  - датировки грамот 7/87/112/147 не заданы ни в WK, ни здесь; для гр. 147 нужно проверить, что она не позже ~1230.

### kinship_terms.csv — rework
- `source_refs` — одна и та же строка на все 25 терминов: «Зализняк… kinship-term chapter; Русская Правда… articles on
  inheritance/dowry terms». Отдельной главы о терминах родства в «Древненовгородском диалекте» нет; большинство терминов
  (тьща, свекры, пасынок, мачеха, тётка, баба, внук) в статьях Русской Правды о наследстве не встречается. Это
  неверная атрибуция, а confidence B поставлен без подтверждения на уровне строки.
- Термины противоречат проверенной книжной evidence этой группы (Колесов, «Древняя Русь: наследие в слове. Мир человека»,
  2000, book:499410 ¶92, 98, 99):
  - `kt_dyadya` «дядя / уй» (дядя по отцу и по матери): источник пишет, что до конца XIV в. различали **стрый** (по отцу) и
    **уй** (по матери), а общего «дядя» ещё не было. Форма для ~1230 анахронична, «стрый» пропущен;
  - `kt_baba` gloss «grandmother»: по источнику «баба» — пожилая женщина или повитуха, не «бабушка»;
  - нет золовки, ятрови, шурина, деверя, снохи, зятя, хотя они есть в evidence или в стандартной системе свойства.
- `kt_pri_` — испорченный id: в исходном ключе смешаны латиница и кириллица («priданое»). В `source_refs` слово
  «Прострaнная» написано с латинской «a».
- `приданое` как слово эпохи для ~1230 не подтверждено. В гр. 9 имущество описано иначе («что дал отец и родичи»),
  поэтому нужно C с пометкой или атрибуция к конкретному источнику.
- Остальные формы (отец, мати, сын, дъчи, брат, сестра, дѣдъ, вънукъ, мужь, жена, вдова, сирота, отрокъ, тьсть, тьща,
  свекръ, свекры, племянникъ, пасынокъ, мачеха, вѣно) по существу верны для древнерусского. Проблема в атрибуции,
  а не в выдумке.

### psychology_profiles.csv — rework
- Все 71 role-строки идентичны: `temperament_weights = {"calm": 2}`, `risk_traits` везде `unknown`, `motives = []`,
  одинаковые `fears` (одна строка на все роли). Ни одно ключевое слово `rule_temperament_from_role` не находится
  в шаблонном тексте `attitude_*`.
- 68 occupation-строк: 4 distinct набора темперамента; `motives` и `fears` одинаковы у всех 68. Все метки получают вес ≥ 1,
  а `hot_tempered` 4–5 у всех занятий, включая мирные. Причина: ключевые слова «высок», «спор», «конфликт», «долг»
  совпадают в общем шаблонном тексте, который есть в каждой строке. Итоговые веса не отражают занятие.
- `derivation_rule` в docstring говорит «число полей», код считает число совпавших ключевых слов по склеенному тексту.
  `initial_mood_rules` («+1 wary if typical_debts…») нигде не вычисляется, это текст-заглушка.
- `theft` = `unknown` у всех 139 строк: TSV `theft_risk` шаблонный.
- Шкала ценностей и темперамента не утверждена владельцем (открытый вопрос брифа). Сделано правильно: вопрос
  вынесен и не утверждён самим автором.
- Не использованы: book evidence npc_psychology (57 строк), WK psychology_behavior / social_behavior claims.
  Нужна другая основа вывода: role_group, social_rank, freedom_status, weapon_rights, combat_likelihood,
  violence_risk (они различаются), плюс evidence.

### speech_registers.csv — rework
- `literacy_expectation_ru` и `speech_notes_ru` одинаковы во всех 71 строке (шаблон TSV).
- Правило даёт `formal_literate` только четырём ролям (князь, посадник, боярин, архиепископ), остальным 67 —
  `plain_oral`, потому что в шаблоне есть «низкая». В результате явные ошибки: `nov_role_church_scribe`, `priest`,
  `deacon`, `igumen`, `merchant_clerk` получают `plain_oral`, то есть «неграмотен», хотя сам шаблон TSV называет
  грамотными церковь, писцов и купеческих доверенных. Тысяцкий получает plain_oral, а посадник formal_literate.
- `everyday_oral` не выпадает ни разу, поэтому третья ветка правила мертва.
- Поле `typical_speech_register`, на которое ссылался бриф, в TSV действительно отсутствует. Автор верно это отметил.

### address_forms.csv — approve_with_limits
- `form_poklon` «поклон от {А} к {Б}» подтверждён evidence (book:641351, формула письма, в т.ч. от игуменьи к мирянке).
  Однако `speaker_role_ref` «боярин/госпожа» неверно сужает формулу: ею пользуются корреспонденты любого статуса.
  `source_refs` без номера грамоты («gramoty.ru corpus»). Для A нужны конкретные грамоты.
- `form_gospodine` (B) подтверждён evidence: «Слово Даниила Заточника» (book:641351 ¶1482, ¶1673) и гр. 55
  (book:709382 ¶712). Гр. 55 датирована рубежом XIII–XIV вв., это позже 1230, опираться лучше на ранние примеры.
- `form_bratie` (C) допустим как реконструкция.
- Ограничение: 3 строки против брифа (обращения по парам статусов, приветствия, прощания, клятвы, благословения, брань
  с правовым весом, языки общения с иноземцами). В evidence этой группы 36 строк speech_address/name_form и 25 social_rule
  не использованы.

### norms.csv — rework
- Посторонний CJK-символ в `sn_rp_beard.legal_weight_ref`: «штраф 12 гривен (較 высокий…»). Это мусор генерации.
- `sn_rp_beard.repair_options` «денежная выплата потерпевшему» неверно: 12 гривен здесь **продажа** (штраф князю). Так в
  Пространной редакции и в evidence book:641351 («12 гривен штрафа князю»). «Публичное извинение недостаточно» —
  утверждение без источника.
- `sn_rp_slave_insult` по существу близко к Пространной редакции (выдача холопа или уплата господином), но статьи
  не указаны нигде: «общее место в изданиях памятника». Нужны номера статей (Троицкий список) или book ref из evidence.
- 8 строк — повтор тех же WK claims, что и в marriage_inheritance_rules.csv, с теми же id, без префикса `sn_`.
  `trigger_act` здесь машинный ключ, `reaction_by_role` пуст во всех 11 строках. 5 строк (гр. 9, 7, 87, 112, 147)
  классифицированы как `social_law_economy` и нормами поведения не являются.
- `norm_kind` hospitality / gift / mutual_aid / taboo / gender_age_conduct — 0 строк, хотя в evidence есть
  taboo_or_custom (households 11, psychology 18, speech 5) и соответствующие social_rule.

## Что НЕ найдено

- Выдуманных числовых частот нет: веса выводятся заявленным правилом, пусть и из неинформативных полей.
- Дублей id внутри файлов нет. Цитат длиннее одного предложения нет (длинных цитат нет вовсе).
- Сфабрикованных сущностей не найдено. Термины и нормы реальны, проблемы — в атрибуции, глоссах, анахронизме
  «дядя» и в пустоте вывода.

## Что сделать при переработке (для автора, не для verifier)

1. Использовать `households-psychology-speech.csv` из book evidence (255 строк, verified) как основной источник
   для kinship, speech, norms и psychology. `source_refs` в формате `book:<id> §<section> ¶<para>`.
2. Строить состав двора с min/max по составу членов из evidence `quantity` / `dimensions` и из v6 g3 / rus13tpl.
   Убрать маппинг TSV high → A.
3. Выводить профили психологии и речи из различающихся полей TSV (role_group, social_rank, freedom_status,
   weapon_rights, violence_risk, combat_likelihood, speech_and_testimony_weight), а не из шаблонных.
4. Исправить kinship: стрый/уй, глосс «баба», id `kt_pri_`, построчные ссылки. Добавить свойство
   (золовка, ятровь, шурин, деверь, сноха, зять).
5. Исправить norms: убрать «較», продажу — князю, номера статей, убрать дубли WK-строк или дать им `sn_` id.
6. Исправить README marriage_inheritance_rules («A 0, B 5, C 3» → B 8).

## Исправления 2026-09-26

Исполнитель (fixer-агент), не verifier. Изменён только `scripts/build.py` (генератор) плюс README
доменов и корневой README; CSV пересобраны заново через `python build.py`, `python check.py` →
`OK: all checks passed`. Источник числовых/атрибуционных фактов — book evidence
`servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv` (255 строк, verified),
процитировано не длиннее одного предложения на факт. `marriage_inheritance_rules.csv` и
`address_forms.csv` (`approve_with_limits`) не входили в объём — не изменены, кроме пункта 6 ниже.

### household_composition_profiles.csv (households_kinship)
- `norm_conf`: убран маппинг TSV `high` → A; потолок теперь B для любой TSV-строки (TSV — «региональная
  реконструкция», не первичный источник). Было: 14 строк с A.
- `wealth_band`: единая закрытая шкала `{elite,high,middle,low,dependent,outcast,variable}` вместо смеси
  `typical_status_range`/`social_rank` (12 разных значений).
- Добавлены `members_estimate_min/max/basis` — оценка состава двора по `wealth_band` на основании
  book:622242 §519 (рядовой двор ~6 чел., диапазон 4–8; боярский в 2,5–4 раза больше, диапазон 10–24);
  для `dependent`/`outcast`/`variable` — `unspecified` (источника нет, не выдумано).
- Добавлены `servants_dependants_ref`, `kinship_terms_ref`, `customs_refs` (указатели/гэп, не фиктивные
  числа) и `note`, явно помечающий `household_pattern_ru` как шаблонный текст, не сигнал состава.
- Гэп остался: `members[relation,sex,age_band]` не выводится ни из TSV, ни из evidence — явно в README.

### kinship_terms.csv (households_kinship)
- Убрана неверная общая строка `source_refs` (несуществующая «глава о терминах родства» у Зализняка;
  большинство терминов не встречаются в статьях РП о наследстве, как заявлялось).
- Каждая из 32 строк получила свой `source_refs`: 9 — book evidence с §/¶ (book:499410, book:641351,
  book:641352), 23 — явная пометка «общая реконструкция, без per-row attestation» с confidence B/C.
- «дядя / уй» разделено на **стрый** (по отцу) и **уй** (по матери) — book:499410 §99; убран анахронизм.
- Глосс «баба» исправлен с «grandmother» на «пожилая женщина / повитуха» — book:499410 §99.
- Добавлены **золовка**, **ятровь**, **шурин** (book:499410 §92/§98), **деверь**, **сноха** (реконструкция,
  C, гэп явно указан), **зять** (book:641352 §1722/§1765).
- Испорченный id `kt_pri_` (латиница+кириллица) исправлен на `kt_pridanoe`; «приданое» получил
  ссылку на конкретную грамоту (book:641351 §2974) вместо общей непроверенной.
- Было 25 строк, стало 32: убран 1 объединённый «дядя/уй» (25→24), добавлены стрый и уй раздельно
  (24→26), добавлены золовка, ятровь, шурин, деверь, сноха, зять (26→32).

### psychology_profiles.csv (npc_psychology)
- Вывод темперамента/ценностей переведён с шаблонных полей (`attitude_to_*`, `typical_fears`,
  `common_fears`, `common_goals`, `social_risk_if_insulted`, `theft_risk`, `witness_likelihood` — все
  distinct=1 по строкам) на реально различающиеся категориальные поля: `role_group`/`occupation_group`,
  `social_rank`/`wealth_band`, `freedom_status` (roles), `combat_likelihood`/`violence_risk` (occupations).
  Результат: 16 различных сигнатур темперамента на 68 occupation-строк (было ≈3–4), 21 на 71 role-строку
  (было ≈2).
- `risk_traits.violence` теперь из `violence_risk` (реально различается); `theft`/`witness` —
  `"unspecified"` вместо непояснённого `"unknown"`, с причиной в новом столбце `fears_motives_note`.
- `motives`/`fears` — пустой список вместо разбора шаблонного `common_goals`/`common_fears`/`typical_fears`
  (та же строка на все 139), чтобы не выдавать константный список за построчное различие.
- Гэп остался (явно в README домена): WK psychology_behavior/social_behavior и книжная evidence
  npc_psychology (57 строк) не привязаны построчно к конкретным occupation/role id.

### speech_registers.csv (speech_address)
- Правило починено: раньше искало «выс»/«низ» в шаблонном `literacy_expectation` (одинаковый на всех 71
  строке), что фактически решалось только через `social_rank`-фолбэк → `nov_role_church_scribe`, `priest`,
  `deacon`, `igumen`, `merchant_clerk` получали `plain_oral` (хотя сам шаблон называет их грамотными),
  тысяцкий получал `plain_oral`, а `everyday_oral` не выпадал ни разу.
- Новое правило матчит именованные шаблоном группы-исключения (элита/церковь/писцы/купеческие доверенные)
  по `social_rank`, `role_group`, `role_title`/`historical_term`. Результат: 22 formal_literate /
  36 plain_oral / 13 everyday_oral (было 4 / 67 / 0).

### norms.csv (social_norms_honour_hospitality)
- Убран посторонний CJK-символ «較» из `sn_rp_beard.legal_weight_ref`.
- `sn_rp_beard`/`sn_rp_blunt_sword`: `repair_options` исправлен — 12 гривен это продажа (штраф) князю,
  не выплата потерпевшему; добавлена ссылка на book:641351 §2821/§2776.
- Добавлены `sn_rp_bare_sword` (1 гривна, §2775) и `sn_rp_push_slap` (3 гривны при двух свидетелях, §2782)
  — соседние по evidence нормы с иным правовым весом.
- `sn_rp_slave_insult`: номер статьи не подтверждён per-row в доступной evidence — confidence понижен
  B→C, гэп указан явно в `source_refs`, номер статьи не выдуман.
- 8 WK-строк получили id с префиксом `sn_wk_` — больше не совпадают с `mi_id` в
  `marriage_inheritance_rules.csv` (проверено скриптом: пересечение id пусто).
- Добавлены 6 строк из book evidence, закрывающие 4 из 5 ранее пустых `norm_kind`: `hospitality`
  (`sn_hospitality_guest`), `gender_age_conduct` (`sn_gender_age_elders`, `sn_gender_age_youth_conduct`),
  `mutual_aid` (`sn_mutual_aid_kin_liability`), `taboo` (`sn_taboo_oath_causes_drought`,
  `sn_taboo_witch_trial_water` — period=medieval_general, confidence снижен до C по правилу проекта).
  `gift` остался 0 строк — гэп, явно в README.
- Было 11 строк (8 WK + 3 RP-insult), стало 19: 8 WK (те же, с новым id) + 5 RP-insult (было 3, добавлены
  `sn_rp_bare_sword` и `sn_rp_push_slap`) + 6 новых evidence-норм = 19.

### README marriage_inheritance_rules.csv (households_kinship, файл не менялся)
- Счётчик в README households_kinship исправлен: «A 0, B 5, C 3» → фактическое B 8.

### Проверки, фактически выполненные
- `python build.py` — пересборка всех 4 переработанных CSV + `marriage_inheritance_rules.csv`/
  `address_forms.csv` (без изменений в правилах генерации этих двух).
- `python check.py` → `OK: all checks passed`.
- Повторный запуск `build.py` в той же папке — CSV побайтно совпали (детерминированность подтверждена).
- Скриптовая проверка: 0 совпадений CJK-паттерна во всех 5 переработанных CSV; пересечение
  `mi_id` (marriage_inheritance_rules.csv) и `sn_id` (norms.csv) — пусто.
- Не выполнено (осталось на следующий проход): построчная привязка WK psychology_behavior/
  social_behavior и book evidence npc_psychology (57 строк) к конкретным occupation/role id;
  подтверждение номера статьи для `sn_rp_slave_insult`; заполнение `norm_kind=gift`;
  `members[relation,sex,age_band]` в household_composition_profiles.csv.

## Повторная проверка 2026-09-26

- Кто: независимый re-checker (проход старшей модели), не автор и не fixer. Данные не правились.
- Метод (скриптом, scratch): пересчёт строк/дублей/confidence/пустых source_refs/CJK/смешанных id; `python scripts/check.py` → `OK`;
  пересборка `build.py` в scratch-копии → все 7 CSV побайтно совпали с текущими; все цитируемые book-ссылки сверены
  с `servak:.../evidence/households-psychology-speech.csv` (book_id + para_no, period, confidence); выборка до 15 строк
  на файл сверена с TSV (`novgorod_social_roles_v1_enriched.tsv`, `novgorod_occupations_v1_enriched.tsv`).
- Замечание по формату для всех файлов: ссылки записаны как `book:<id> §<para_no> (<section>)`, а не
  `book:<id> §<section_path> ¶<para_no>`; разрешимы, но формат нарушен. В `source_refs` пересказ поля `value` evidence
  оформлен в «» как цитата (напр. `sn_rp_bare_sword`), хотя дословная цитата книги другая.

| Файл | Строк (скрипт) | Confidence | Вердикт |
|---|---|---|---|
| households_kinship/household_composition_profiles.csv | 139 | B 139 | **rework** |
| households_kinship/kinship_terms.csv | 32 | A 9, B 17, C 6 | approve_with_limits |
| npc_psychology/psychology_profiles.csv | 139 | C 139 | **rework** |
| speech_address/speech_registers.csv | 71 | C 71 | approve_with_limits |
| social_norms_honour_hospitality/norms.csv | 19 | A 5, B 12, C 2 | approve_with_limits |

### household_composition_profiles.csv — rework
- Исправлено: A→B (0 строк A), `wealth_band` — закрытый словарь из 7 значений, добавлены `members_estimate_*`.
- Не исправлено / новые ошибки:
  - `members_estimate` назначается только по `wealth_band`, без учёта статуса. Монахам, послушнику, архиепископу, игумену
    и `nov_occ_monastery_steward` дан семейный двор 4–8 или 10–24, хотя `family_pattern_ru` той же строки говорит, что
    мирская семья не создаётся. Тот же двор получили `foreign_guest` (приезжий), `servant`, `apprentice`,
    `youth_helper`, `orphan`, `pilgrim`, то есть люди, живущие в чужом доме. Для лимитов биографии (D1) это неверно.
  - `dependent` 1–3 (4 строки: kholop, captive, dependent_peasant, household_servant): basis сам пишет, что источника нет.
    Это выдуманное число, должно быть `unspecified`.
  - Диапазон 4–8 при источнике «~6» и нижняя граница 10 («widened») для элиты — авторская конвенция, правило разброса
    не заявлено. По book:622242 ¶519 получается 15–24. Отнесение `high` (дружинник, гость) к боярскому масштабу —
    допущение без источника.
  - `servants_dependants_ref` в 71 role-строке — шаблонный текст TSV `typical_dependents` (distinct=1), но не помечен
    как шаблон. `members[relation,sex,age_band]` по-прежнему нет (гэп заявлен).

### kinship_terms.csv — approve_with_limits
- Исправлено и подтверждено по evidence: стрый/уй (book:499410 ¶99), «баба» (¶99), золовка/свекры/ятровь (¶92),
  шурин (¶98), `kt_pridanoe`, латинская «a» убрана, общая ложная ссылка убрана.
- Ограничения (до использования нужно исправить confidence):
  - `kt_sirota` (book:499410 ¶521, period=medieval_general) — B, а потолок для этого period C;
  - `kt_tyi_test`, `kt_zyat` (book:641352 ¶1722/¶1765, Галицко-Волынская летопись, period=medieval_general) — A,
    потолок C;
  - `kt_pridanoe` A: грамота подтверждает понятие («что дал отец и родичи»), но не словоформу «приданое» (это слово
    перевода). Для формы нужны B/C;
  - 9 строк B без какого-либо источника («standard Old East Slavic term… gap»): отец, мати, сын, дъчи, дѣдъ, вънукъ,
    отрокъ, пасынокъ, мачеха. Нужна ссылка (напр. статьи РП в evidence) или C;
  - в VERIFICATION fixer указал «9 book evidence / 23 gap», по скрипту book-ссылки в 17 строках. `gloss_en` у «баба»
    дан транслитом с опечаткой («pojhilaya»); колонка `note` — один шаблон на 32 строки.

### psychology_profiles.csv — rework
- Исправлено: вывод идёт из различающихся полей (17 сигнатур темперамента на 68 occupations, 21 на 71 role; в README
  написано «16»). Константные motives/fears больше не выдаются за различия; `unknown` → `unspecified` с пояснением.
- Не исправлено:
  - `hot_tempered` ≥1 у всех 68 occupations (`combat_likelihood=low` → +1 при low у 44 из 68). У 39 из 68 он не
    меньше `calm`, в том числе у мирных занятий: рыбак и перевозчик получают `hot_tempered 3`, у дьякона и знахаря
    он тоже есть. Исходная претензия «hot_tempered у всех, включая мирные» сохраняется;
  - `violence_risk` (риск столкнуться с насилием) трактуется как вспыльчивость, хотя тот же код для
    `high_against_them` понимает его как риск для самого человека. Это смешение категорий;
  - `motives`/`fears` пусты у 139 из 139 строк, `risk_traits` у всех 71 роли `unspecified`, `initial_mood_rules` —
    заглушка. 57 строк evidence npc_psychology и claims WK psychology/social_behavior не использованы, хотя это
    было прямое требование переработки;
  - шкала весов — авторская таблица без источника, владелец её не утвердил.

### speech_registers.csv — approve_with_limits
- Исправлено: поп, дьякон, игумен, церковный писец, купеческий приказчик и тысяцкий теперь `formal_literate`, ветка
  `everyday_oral` работает (22 / 36 / 13 по скрипту, совпадает с отчётом).
- Ограничения: правило `role_group=церковь → formal_literate` без учёта ранга даёт грамотный регистр
  `nov_role_church_guard`, `nov_role_pilgrim` (мирянин-богомолец) и `nov_role_monastery_worker` (зависимый работник).
  Это ошибки, и `ponomar`/`novice` под вопросом. `nov_role_foreign_guest` → `formal_literate`, хотя язык общения не
  учтён. `register` смешивает грамотность и речевой регистр. Не используется различающееся поле
  `speech_and_testimony_weight`. `literacy_expectation_ru` и `speech_notes_ru` остаются шаблоном (distinct=1).

### norms.csv — approve_with_limits
- Исправлено и сверено: «較» удалён; 12 гривен — продажа князю (book:641351 ¶2821, ¶2776); `sn_rp_bare_sword` (¶2775,
  1 гривна) и `sn_rp_push_slap` (¶2782, 3 гривны, два свидетеля) соответствуют evidence. Id `sn_wk_*` не пересекаются
  с `mi_id`. `sn_rp_slave_insult` → C с честным гэпом: в evidence группы статьи о холопе, ударившем свободного, нет.
  Новые строки hospitality/gender_age/taboo соответствуют ¶1786/¶1779 (book:641342), ¶1737 (641351), ¶1994 (641352, C).
- Ограничения:
  - `sn_rp_beard` сохраняет «публичного извинения недостаточно» без источника, хотя это помечено. Утверждение нужно
    убрать;
  - `sn_mutual_aid_kin_liability` A: обобщение правовой нормы по одной жалобе (¶2958). Для нормы уровень не выше B,
    а `mutual_aid` для правила «родич не отвечает за долг» — спорная классификация;
  - `reaction_by_role` пуст во всех 19 строках. 5 строк `sn_wk_social-*` (гр. 7, 9, 87, 112, 147) остаются
    `social_law_economy` и нормами поведения не являются. У 8 WK-строк `trigger_act` — машинный ключ. В отчёте fixer
    эти пункты не указаны ни как исправленные, ни как неисправленные;
  - `norm_kind=gift` — 0 строк (гэп заявлен).
