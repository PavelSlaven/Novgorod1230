# VERIFICATION — time-calendar-church

- **Кто:** verifier agent (независимый старший проход, не автор сборки).
- **Когда:** 2026-09-26.
- **Что проверено:** `time/calendar_1230_1250.csv`, `time/paschalia_1230_1250.json`,
  `time/schedules_routines.csv`, `religion/church_practice.csv`,
  `religion/lifecycle_rites_burial.csv`, README трёх уровней, скрипты `time/scripts/*`,
  `religion/scripts/*`. Данные не правились.
- **Источники сверки:** book evidence `servak:/srv/novgorod-work/data/books/evidence/time-calendar-church.csv`
  (237 строк, read-only); WK `Novgorod-runtime/.../world-knowledge/production-v1/social-institutions.json`
  (копия в game-base побайтно совпадает); `Novgorod/data/world-catalogs/novgorod/temporal-v4/datasets/`;
  `Novgorod/data/novgorod-region/novgorod_occupations_v1_enriched.tsv`;
  `Одним ПРОМТОМ/.../nov_region_audit/novgorod_status_rules_v1.json`;
  `game-base-v1/food-drink/dishes/famine_1230.csv`.

## Детерминированные проверки (скриптом, не глазами)

| Файл | Строк факт | README | Пустые source_refs | confidence вне A/B/C | Дубли id |
|---|---|---|---|---|---|
| time/calendar_1230_1250.csv | 363 | 363 | 0 | 0 | 0 |
| time/schedules_routines.csv | 16 | 16 | 0 | 0 | 0 |
| religion/church_practice.csv | 148 | 148 | 0 | 0 | 0 |
| religion/lifecycle_rites_burial.csv | 19 | 19 | 0 | 0 | 0 |

- `check_calendar.py`, `check_schedules.py`, `check_religion.py` — запущены, все OK
  (запуск с `PYTHONDONTWRITEBYTECODE=1`, build-скрипты не запускались).
- Пасха 1230–1250 независимо пересчитана по таблице пасхальных полнолуний по золотому
  числу и JDN (не формулой автора): 21/21 совпадение. Все смещения подвижных дат от
  Пасхи (−55…+57) пересчитаны через JDN: 0 ошибок.
- Все 164 книжные строки religion сджойнены с evidence по (book_id, section_path,
  para_no, entity_ru): 164/164 найдены, confidence/period/value перенесены без
  искажений; ни одна из 162 строк domain=religion_church не потеряна (148 + 14).
- Дословные совпадения note/visible_traces с полем `quote` > 60 символов: 1 (rl_075,
  78 символов, фрагмент одного предложения) — в пределах лимита.
- Правило «period medieval_general / ethnographic_late — только аналогия, confidence ≤ C»:
  church_practice — 53 нарушения (medieval_general A 10, medieval_general B 39,
  ethnographic_late B 4); lifecycle — 5 (medieval_general B).
- `build_religion.py` читает evidence из `scratchpad/gb-collect-time-calendar-church/book-evidence.csv`
  — этого файла нет; сборку religion воспроизвести нельзя.

## Выборка (≥ 30 строк, стратифицировано)

Проверено против источника: календарь — все 49 строк без года (неподвижные праздники,
посты, торг, труд, событие) + все 315 годовых строк скриптом; schedules — все 16 строк
против TSV, status_rules и temporal-v4; religion — 22 строки church_practice по всем
стратам kind × confidence × period и 6 строк lifecycle против `value`/`quote`/`note`
evidence, плюс все 3 WK-строки против claims. Итого вручную ≥ 90 строк.

## Вердикты по файлам

### time/paschalia_1230_1250.json — approve_with_limits

- Даты Пасхи и производные верны (независимая проверка).
- `rusalnaya_nedelya_start` = Пасха+50 (неделя после Троицы), а источник
  (book:122328 ¶3720) определяет русальную неделю как седьмую по Пасхе, завершаемую
  Троицей (Пасха+43…+49).
- `peter_fast_length_days` считает без последнего дня (1231: 40 вместо 41 дня включительно);
  назвать «exclusive» или исправить.

### time/calendar_1230_1250.csv — rework

Годовые строки пасхалии (294) корректны. Ошибки сосредоточены в ~45 строках-константах
`build_calendar.py`:

1. **Неверная атрибуция ¶1321** (book:356156): ¶1321 не содержит Купалу, Бориса и Глеба,
   зажинки, Воздвижение, Покров. Их истинные источники: book:122328 ¶3622/¶3626/¶3631
   (реконструкция Рыбакова, medieval_general, «южнорусские сроки»), book:378072 ¶596
   (Покров); для Воздвижения как праздника в evidence опоры нет. Confidence B → C.
2. `cal_feast_semenov_den`: «новолетие по мартовскому счёту» — фактическая ошибка
   (1 сентября — сентябрьский год; мартовский год начинается 1 марта, ¶1272); обещанный
   `note` пуст.
3. `cal_feast_yuriev_spring` «первый выгон скота», `cal_feast_nikola_winter` «Никольщина» —
   этнографические детали (book:168527, ethnographic_late) внутри строк B со ссылкой на ¶1321.
4. `cal_mv_rusalnaya_*` (21 строка): дата противоречит цитируемому источнику (см. JSON).
   `cal_belief_semik`: правило easter+45..49 вместо четверга седьмой недели (Пасха+46).
5. **Строки без источника** (source_refs = «regional analogy…»): `cal_work_threshing`,
   `cal_nav_ice_breakup`, `cal_nav_ice_freeze`, `cal_fish_spring_spawning_run`,
   `cal_fish_autumn_run`, `cal_hunt_fur_season_open` — 6 строк нарушают правило
   «каждая строка с source_refs»; окна дат (09-01..11-01, 10-01..02-01) выдуманы.
6. **Выдуманные окна** при ссылке на Рыбакова без ¶: `cal_work_spring_plowing` 04-23..05-15,
   `cal_work_autumn_sowing` 08-15..09-14, `cal_work_hay_harvest` 06-24..07-20,
   `cal_work_grain_harvest` 07-20..08-07 (источник: начало жатвы 24 июля, южная
   реконструкция; для Новгорода позже). Сев овса/ржи и подсека на деле из
   book:849577 ¶719 (описание XVI в.).
7. `cal_work_slash_burn_clearing` B: источник book:849577 ¶719, а не Рыбаков; фраза
   «соседствует с трёхпольем» — анахронизм для 1230 (note evidence: трёхполье с XVI в.).
8. `cal_market_gost_reading`, `cal_market_winter_guests`, `cal_market_summer_guests`
   приписаны Рыбакову; истинный источник book:392896 ¶245/¶504 (Рыбина, глава о XIV–XV вв.).
   Скра (устав Немецкого двора) — памятник второй половины XIII в. и позже: для 1230 —
   анахронизм или confidence C с note.
9. `cal_fast_weekly_wed_fri`: приписан Рыбакову, реальный источник book:512565 ¶318.
10. `cal_fastfree_*` (4): ни ¶1321–1324, ни Рыбаков не говорят о сплошных седмицах —
    опоры в evidence нет, B не обоснован.
11. Confidence B при источнике medieval_general: `cal_fast_uspensky`, `cal_fast_filippov`
    (¶1322 medieval_general), `cal_feast_svyatki_*` (¶3658) → должно быть ≤ C.
12. `cal_feast_intercession_omen`: source_refs «book:?»; истинный источник book:168527 ¶113.
13. Гигиена: id со смешанной кириллицей (`cal_belief_koляda_march`, `cal_belief_ярилин`);
    опечатка «Великая субхота»; много ссылок `book:122328` без ¶.

Корректно: `cal_event_famine_1230_frost` — cross-ref на `famine_1230.csv#fam_frost_1230`
существует, A по НПЛ.

### time/schedules_routines.csv — approve_with_limits

- Утверждение об одинаковом шаблоне для всех 68 occupation_id подтверждено скриптом;
  перенос текстов точен; 4 adaptation rules точны (файл draft, requires_human_audit —
  указано в note).
- `sch_place_monastic_refectory`: day_type=church_day не подтверждён — запись temporal-v4
  не ограничена церковным днём (только 1 мая – 1 окт.); это аналог по уставу Бенедикта.
- Нет распорядков по ролям, хотя evidence группы (domain schedules_routines, 21 строка:
  монашеский день, обед в полдень, послеобеденный сон, счёт часов от восхода) даёт опору
  хотя бы для монаха и горожанина; README утверждает, что источника нет.
- README/скрипт расходятся: README называет spring_rasputitsa частичным, фактически он
  содержит все 4 сегмента.

### religion/church_practice.csv — rework

Содержание верно переносит evidence (164/164). Причины rework:

1. 53 строки period medieval_general/ethnographic_late с confidence A/B — нарушение правила
   (≤ C). README ложно утверждает, что такие строки получили C; `check_religion.py`
   этого не проверяет.
2. Поздние реалии с B без пометки аналогии: rl_029 (Домострой XVI в.), rl_037 (било,
   примеры XV–XVII вв.), rl_117 (владычный штат XIV–XV вв.), rl_122 (юродивые XIV в.),
   rl_129 (обыденные церкви XIV–XV вв.), rl_134/rl_135 (Скра, колокол Немецкого двора XIV в.),
   rl_039, rl_099, rl_104 (этнография XIX в.). rl_059: почитание Варлаама Хутынского
   с конца XIII в. — для 1230 анахронизм как праздник.
3. Эвристики скрипта дают ошибочные поля: rl_040 (бубенчики) → cue «звон в било»;
   rl_018 (любовная магия) → calendar_refs на Пасху; rl_059 (житие) → kind=rite;
   rl_049 (волхв 1071) → institution.
4. roles/pf_ids/items_refs пусты во всех строках (брифовые key_fields); службы не
   связаны с calendar (calendar_refs только у 6 строк).
5. Сборка не воспроизводима: входной evidence-файл по пути в скрипте отсутствует.

### religion/lifecycle_rites_burial.csv — rework

1. 5 строк medieval_general с B (lr_003, lr_006, lr_010, lr_014, lr_015) → ≤ C.
2. lr_017–lr_019 (WK): confidence A завышена — claims имеют confidence medium,
   directness inferred, «preliminary»; находки конкретного памятника (Ильинский),
   привязка к G4 zaostrovye_burial_area — аналогия → B/C с note. `name_ru` — английские
   slug-и, `visible_traces` — заглушка «see WK claim payload»: пул для G4 фактически пуст
   по содержанию.
3. lr_002 «вдовство и прелюбодеяние попадьи» классифицирован как death — это брачное
   право клира.
4. Бриф требует облик погоста по сезону, отпевание, ориентацию, поминальные дни,
   участников и звуки — не собрано; README не называет это gap.

## Общие ограничения

- README корня и `religion/README.md` содержат неверные утверждения (C для
  недатированных; Скра/гости «по Рыбакову»); после rework — синхронизировать.
- Блокер v17 `temporal_authoring_records = 0` сборщиком не проверен (честно указано).
- `region_id`/universal (critic #1) не добавлен ни в один файл.
