#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Builds time/calendar_1230_1250.csv (Julian calendar, feasts, fasts, market
days, annual work cycle) for Novgorod ~1230-1250.

Inputs:
  - paschalia.py (this dir)            -> movable dates per year, script-computed
  - book evidence, group time-calendar-church (fetched via ssh, cited by
    book_id/section/para in source_refs; the raw evidence CSV itself is
    NOT copied into the repo -- see README.md "Copyright").
  - wk:social-institutions.json (approved)   -> church/clergy legal context
  - data/world-catalogs/novgorod/game-base-v1/food-drink/dishes/famine_1230.csv
    (cross-ref only, not duplicated)

Run: python build_calendar.py
Writes: ../calendar_1230_1250.csv, prints row counts.
"""
import csv
import json
import os
from paschalia import add_days

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)
PASCHALIA_JSON = os.path.join(OUT_DIR, "paschalia_1230_1250.json")
OUT_CSV = os.path.join(OUT_DIR, "calendar_1230_1250.csv")

BOOK_356156 = "book:356156 (Леонтьева, Кобрин, Шорин, Вспомогательные исторические дисциплины, 2009) §Глава 6. Хронология"
BOOK_122328 = "book:122328 (Рыбаков, Язычество Древней Руси, 1987) §Часть третья, гл.13"

FIELDS = [
    "cal_id", "date_or_rule", "year", "kind", "name_ru",
    "effects", "computation_ref", "source_refs", "confidence", "status", "note",
]

rows = []


def add(cal_id, date_or_rule, year, kind, name_ru, effects, computation_ref, source_refs, confidence, note=""):
    rows.append({
        "cal_id": cal_id,
        "date_or_rule": date_or_rule,
        "year": year if year is not None else "",
        "kind": kind,
        "name_ru": name_ru,
        "effects": effects,
        "computation_ref": computation_ref,
        "source_refs": source_refs,
        "confidence": confidence,
        "status": "candidate",
        "note": note,
    })


# ---------------------------------------------------------------------------
# 1. Fixed (immovable) feasts -- recurring every year 1230-1250, Julian date.
#    book:356156 ¶1321 lists the immovable feast set; a few widely attested
#    folk/agrarian fixed days from book:122328 are added separately below.
# ---------------------------------------------------------------------------
FIXED_FEASTS = [
    ("cal_feast_epiphany", "01-06", "Крещение (Богоявление)", "church"),
    ("cal_feast_sretenie", "02-02", "Сретение", "church"),
    ("cal_feast_annunciation", "03-25", "Благовещение", "church"),
    ("cal_feast_yuriev_spring", "04-23", "Юрьев день весенний", "church"),
    ("cal_feast_nikola_spring", "05-09", "Николин весенний (перенесение мощей, 1087)", "church"),
    ("cal_feast_boris_gleb", "05-02", "Борис и Глеб (Борис-хлебник, праздник первых ростков)", "church,work"),
    ("cal_feast_kupala", "06-24", "Купала (позднее Иван Купала)", "folk"),
    ("cal_feast_ilyin", "07-20", "Ильин день", "church,folk"),
    ("cal_feast_preobrazhenie", "08-06", "Преображение (Спас, праздник первых плодов)", "church,food"),
    ("cal_feast_zazhinki", "08-07", "Зажинки (окончание жатвы)", "work"),
    ("cal_feast_uspenie", "08-15", "Успение Богородицы", "church"),
    ("cal_feast_semenov_den", "09-01", "Семёнов день", "church"),
    ("cal_feast_rozhdestvo_bogorod", "09-08", "Рождество Богородицы", "church"),
    ("cal_feast_pokrov", "10-01", "Покров Богородицы (установлен во Владимирской земле при Андрее Боголюбском)", "church,folk"),
    ("cal_feast_vvedenie", "11-21", "Введение", "church"),
    ("cal_feast_yuriev_autumn", "11-26", "Юрьев день осенний", "church,work"),
    ("cal_feast_nikola_winter", "12-06", "Николин зимний", "church"),
    ("cal_feast_nativity", "12-25", "Рождество Христово", "church"),
]
for cal_id, md, name_ru, effects in FIXED_FEASTS:
    sources = {
        "cal_feast_boris_gleb": f"{BOOK_122328} ¶3622",
        "cal_feast_kupala": f"{BOOK_122328} ¶3626",
        "cal_feast_preobrazhenie": f"{BOOK_122328} ¶3631",
        "cal_feast_zazhinki": f"{BOOK_122328} ¶3631",
        "cal_feast_pokrov": "book:378072 §Нашествие иноземцев ¶596",
    }
    source = sources.get(cal_id, f"{BOOK_356156} ¶1321")
    analogy = cal_id in {"cal_feast_boris_gleb", "cal_feast_kupala", "cal_feast_preobrazhenie", "cal_feast_zazhinki", "cal_feast_pokrov"}
    add(cal_id, f"julian:{md}", None, "feast", name_ru, effects,
        "fixed_rule", source, "C" if analogy else "B",
        note=("Распространение Покрова в Новгороде около 1230 года неясно." if cal_id == "cal_feast_pokrov" else "Южнорусская реконструкция Рыбакова; для Новгорода 1230 г. только аналогия.") if analogy else "")

add("cal_feast_intercession_omen", "julian:10-01", None, "belief",
    "Народная примета Покрова", "belief_only",
    "fixed_rule", "book:168527 ¶113", "C",
    note="«Снег на Покров предвещает много свадеб» -- народная примета, не церковное правило; см. religion/church_practice.csv rl_belief_pokrov_snow.")

add("cal_feast_svyatki_start", "julian:12-25", None, "feast",
    "Зимние святки, начало (12-дневные игрища)", "folk,fasting_free",
    "fixed_rule", f"{BOOK_122328} ¶3658", "C", note="Средневековая общая аналогия для 1230 г.")
add("cal_feast_svyatki_end", "julian:01-06", None, "feast",
    "Зимние святки, конец", "folk,fasting_free",
    "fixed_rule", f"{BOOK_122328} ¶3658", "C", note="Средневековая общая аналогия для 1230 г.")

add("cal_belief_kolyada_march", "julian:03-01", None, "belief",
    "Коляда 1 марта (упомянута в Новгородской Кормчей 1280 г. как торжество начала мартовского года)", "folk",
    "fixed_rule", f"{BOOK_122328}", "C",
    note="Кормчая 1280 г. -- позже целевого периода; для 1230-х применимость по аналогии.")

add("cal_belief_yarilin", "julian:06-04", None, "belief",
    "Ярилин день (реконструкция аграрно-языческого календаря молений о дожде)", "folk",
    "fixed_rule", f"{BOOK_122328}", "C",
    note="Реконструкция Рыбакова; сам он оговаривает гипотетичность привязки к точной дате.")

add("cal_belief_semik", "julian:movable", None, "belief",
    "Семик (летний русальский праздник, четверг седьмой недели по Пасхе)", "folk",
    "derived:easter+46 (Thursday of week 7 after Easter)", f"{BOOK_122328} ¶3720", "C",
    note='Четверг седьмой недели по Пасхе; точная привязка обычая для Новгорода 1230 г. не засвидетельствована.')

# ---------------------------------------------------------------------------
# 2. Fixed fasts (dates do not move with Easter).
# ---------------------------------------------------------------------------
add("cal_fast_uspensky", "julian:08-01..08-14", None, "fast",
    "Успенский пост", "food,church",
    "fixed_rule", f"{BOOK_356156} ¶1322", "C",
    note="Сроки по позднейшему уставу; для XIII в. длительность могла отличаться (источник сам это оговаривает).")
add("cal_fast_filippov", "julian:11-15..12-24", None, "fast",
    "Филиппов (Рождественский) пост", "food,church",
    "fixed_rule", f"{BOOK_356156} ¶1322", "C",
    note="Сроки по позднейшему уставу; см. тот же caveat.")

# Weekly fasts (recurring rule, not a date range).
add("cal_fast_weekly_wed_fri", "weekly:Wed,Fri", None, "fast",
    "Еженедельный пост в среду и пятницу", "food",
    "fixed_rule",
    "book:512565 §Глава пятая «Отцы духовные» ¶318", "C",
    note="Источник описывает спор о посте в среду и пятницу при совпадении с господским праздником; единого правила для сплошных седмиц здесь не подтверждает.")

# ---------------------------------------------------------------------------
# 3. Movable feasts/fasts, per year 1230-1250 (script-computed, see paschalia.py)
# ---------------------------------------------------------------------------
with open(PASCHALIA_JSON, encoding="utf-8") as f:
    years = json.load(f)

MOVABLE_MAP = [
    ("maslenitsa_monday", "cal_mv_maslenitsa", "feast", "Масленица (начало сырной седмицы)", "folk,fasting_free"),
    ("great_lent_clean_monday", "cal_mv_great_lent_start", "fast", "Великий пост, начало (Чистый понедельник)", "food,church"),
    ("palm_sunday", "cal_mv_palm_sunday", "feast", "Вербное (Цветоносное) воскресенье", "church"),
    ("holy_thursday", "cal_mv_holy_thursday", "feast", "Великий четверг", "church"),
    ("good_friday", "cal_mv_good_friday", "fast", "Великая пятница (строгий пост)", "food,church"),
    ("holy_saturday", "cal_mv_holy_saturday", "feast", "Великая суббота", "church"),
    ("easter_sunday", "cal_mv_easter", "feast", "Пасха", "church,fasting_free"),
    ("fomino_antipascha", "cal_mv_fomino", "feast", "Фомина неделя (Антипасха)", "church"),
    ("radunitsa", "cal_mv_radunitsa", "belief", "Радуница (поминовение предков)", "folk,burial"),
    ("ascension", "cal_mv_ascension", "feast", "Вознесение", "church"),
    ("trinity_pentecost", "cal_mv_trinity", "feast", "Троица (Пятидесятница)", "church,fasting_free"),
    ("all_saints_sunday", "cal_mv_all_saints", "feast", "Неделя Всех святых", "church"),
]

computation_ref = "time/scripts/paschalia.py:build_year (Gauss Julian-Easter congruence, cross-checked against Meeus algorithm)"
easter_source = f"{BOOK_356156} ¶1324, ¶1328-1333 (Gauss formula); {BOOK_122328} (подвижность Пасхи и масленицы)"

for y in years:
    year = y["year"]
    for key, cal_id_prefix, kind, name_ru, effects in MOVABLE_MAP:
        add(f"{cal_id_prefix}_{year}", f"julian:{y[key]}", year, kind, name_ru, effects,
            computation_ref, easter_source, "B" if kind != "belief" else "C")

    easter_y, easter_m, easter_d = map(int, y["easter_sunday"].split("-"))
    rusal_y, rusal_m, rusal_d = add_days(easter_y, easter_m, easter_d, 43)
    add(f"cal_mv_rusalnaya_{year}", f"julian:{rusal_y:04d}-{rusal_m:02d}-{rusal_d:02d}..+6d", year, "belief",
        "Русальная неделя (седьмая неделя по Пасхе, начало игрищ у воды)", "folk",
        computation_ref, f"{BOOK_122328} ¶3720", "C",
        note="Седьмая неделя по Пасхе, до Троицы; обычай для Новгорода 1230 г. дан по аналогии.")

    add(f"cal_mv_petrov_start_{year}", f"julian:{y['peter_fast_start']}", year, "fast",
        "Петров пост, начало (понедельник после Всех святых)", "food,church",
        computation_ref, f"{BOOK_122328} ¶3714 (Петровки: начало через неделю после Троицы)", "C",
        note="Средневековая общая аналогия для Новгорода около 1230 года.")
    add(f"cal_mv_petrov_end_{year}", "julian:06-28", year, "fast",
        "Петров пост, конец (канун Петрова дня)", "food,church",
        "fixed_rule", f"{BOOK_122328} ¶3714 (конец -- Петров день, 29 июня)", "C",
        note=f"Средневековая общая аналогия для Новгорода около 1230 года. Длина в этом году: {y['peter_fast_length_days']} дн. (варьируется 1-6 недель в зависимости от Пасхи, как и утверждает источник).")

# ---------------------------------------------------------------------------
# 4. Trade days and annual work cycle (agriculture / fishing / hunting /
#    navigation-icebreak) -- fixed, regional analogy where no exact date is
#    attested. NOT invented numbers: ranges are qualitative "typical window"
#    from named sources, marked confidence C unless directly attested.
# ---------------------------------------------------------------------------
add("cal_market_friday", "weekly:Fri", None, "market",
    "Торговый день -- пятница (гипотеза Б.А. Рыбакова об общерусском торге)", "trade",
    "fixed_rule", f"{BOOK_122328} (Рыбаков предполагает пятницу как древний общерусский торговый день)", "C",
    note="Источник сам маркирует это как предположение ('Рыбаков предполагает'), не как документально засвидетельствованный устав; Новгород вёл, помимо того, регулярный вечевой/торговый оборот на Торгу почти ежедневно -- еженедельный 'торговый день' не отменяет обычную торговлю.")

add("cal_market_gost_reading", "season:winter_and_summer_guests (2x/year)", None, "market",
    "Скра (устав Немецкого двора) читается дважды в год -- для зимних и летних гостей", "trade",
    "fixed_rule", "book:392896 ¶245", "C", note="Скра засвидетельствована со второй половины XIII в.; для 1230 г. только поздняя аналогия.")
add("cal_market_winter_guests", "season:autumn_last_navigation..spring_first_navigation", None, "market",
    "Зимние немецкие гости (прибывали с последней осенней навигацией, уезжали с первым весенним ходом)", "trade",
    "fixed_rule", "book:392896 ¶504", "C", note="Сведения о зимних гостях относятся преимущественно к XIV–XV вв.; для 1230 г. аналогия.")
add("cal_market_summer_guests", "season:spring_navigation_open..autumn_navigation_close", None, "market",
    "Летние немецкие гости", "trade",
    "fixed_rule", "book:392896 ¶504", "C", note="Сведения о летних гостях относятся преимущественно к XIV–XV вв.; для 1230 г. аналогия.")

WORK_SEASON = [
    ("cal_work_spring_plowing", "season:spring", "Пахота и сев ярового овса", "work", "book:849577 ¶719 (позднее описание Новгородской земли)", "C"),
    ("cal_work_autumn_sowing", "season:autumn", "Сев озимой ржи", "work", "book:849577 ¶719 (позднее описание Новгородской земли)", "C"),
    ("cal_work_grain_harvest", "season:summer", "Жатва", "work", f"{BOOK_122328} ¶3631 (аграрный календарь; южнорусская реконструкция)", "C"),
    ("cal_work_slash_burn_clearing", "season:spring_before_sowing", "Расчистка подсеки 'кто где поспел'", "work", "book:849577 ¶719 (позднее описание Новгородской земли)", "C"),
]
for cal_id, rule, name_ru, effects, source_refs, conf in WORK_SEASON:
    add(cal_id, rule, None, "work_season", name_ru, effects, "qualitative_seasonal_analogy", source_refs, conf,
        note="Качественный сезон по поздней или региональной аналогии; точные дни для Новгорода 1230–1250 гг. не установлены.")

# 1230 famine phase -- state-of-world cross-reference only, not duplicated.
add("cal_event_famine_1230_frost", "julian:1230-09-14", 1230, "event",
    "Мороз на Воздвижение (14.09.1230) побивает урожай -- начало голодной фазы", "food,work",
    "cross_ref", "cross-ref: data/world-catalogs/novgorod/game-base-v1/food-drink/dishes/famine_1230.csv#fam_frost_1230 (A)", "A",
    note="Полные данные о ценах и голоде -- в food-drink/dishes/famine_1230.csv; здесь только календарная привязка, во избежание дублирования.")

# ---------------------------------------------------------------------------
with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)

from collections import Counter
kc = Counter(r["kind"] for r in rows)
print(f"wrote {len(rows)} rows to {OUT_CSV}")
print("by kind:", dict(kc))
print("years covered:", sorted(set(int(r["year"]) for r in rows if r["year"] != "")))
