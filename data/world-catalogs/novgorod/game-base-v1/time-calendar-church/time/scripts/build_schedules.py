#!/usr/bin/env python
"""Build occupation-specific candidate routines; exact hours are editorial."""
import argparse
import csv
import io
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "schedules_routines.csv"
REPO = HERE.parents[6]
BASE = REPO / "data/novgorod-region/novgorod_occupations_v1_enriched.tsv"
ADDITIONS = HERE.parents[2] / "occupations-activities/occupations/occupations_additions.csv"
PLACES = HERE.parents[2] / "places-binding/places/place_families.csv"
PRESENCE = HERE.parents[2] / "places-binding/presence/people_presence_authoring.csv"
ROLES = REPO / "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"
LIGHT = REPO / "data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json"
MONTHS = {"winter": (12, 1, 2), "spring": (3, 4, 5), "summer": (6, 7, 8), "autumn": (9, 10, 11)}
LIGHT_REF = "data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json#record:calendar_daylight_light_profiles:novgorod_1230_1233_v2"
FIELDS = ("sch_id", "revision", "role_ref", "occupation_ref", "day_type", "season",
          "months", "local_start_minute", "time_blocks", "place_access_ref",
          "source_refs", "source_rule_ref", "no_source", "confidence", "status", "note")

# Occupation, starting place, work place, season, day type, source field, action.
# These are candidates for a scene, not committed locations of individual NPCs.
SCHEDULES = (
    ("nov_occ_ferryman", "pf_ferry_landing", "pf_ferry_landing", "summer", "normal", "where_work_happens", "ожидает перевоз и помогает при переправе"),
    ("nov_occ_ferryman", "pf_ferry_landing", "pf_ferry_landing", "winter", "normal", "where_work_happens", "следит за переправой; речной перевоз может быть недоступен"),
    ("nov_occ_ploughman", "pf_peasant_homestead", "pf_arable_field", "spring", "normal", "where_work_happens", "работает в поле при подходящей погоде"),
    ("nov_occ_ploughman", "pf_peasant_homestead", "pf_arable_field", "summer", "normal", "where_work_happens", "работает в поле при подходящей погоде"),
    ("nov_occ_ploughman", "pf_peasant_homestead", "pf_peasant_homestead", "winter", "normal", "where_work_happens", "занимается зимними хозяйственными делами"),
    ("nov_occ_haymaker", "pf_rural_yard", "pf_hay_meadow", "summer", "normal", "where_work_happens", "занят сенокосом при подходящей погоде"),
    ("nov_occ_herder", "pf_rural_yard", "pf_pasture", "summer", "normal", "where_work_happens", "пасёт доверенный скот"),
    ("nov_occ_herder", "pf_rural_yard", "pf_rural_yard", "winter", "normal", "where_work_happens", "присматривает за скотом при дворе"),
    ("nov_occ_fisher", "pf_fishing_camp", "pf_riverbank", "summer", "normal", "where_work_happens", "занят ловом и осмотром снастей у берега"),
    ("nov_occ_fisher", "pf_fishing_camp", "pf_fishing_camp", "winter", "normal", "where_work_happens", "чинит снасти и готовит промысел"),
    ("nov_occ_fish_weir_keeper", "pf_fishing_camp", "pf_riverbank", "summer", "normal", "where_work_happens", "осматривает место лова"),
    ("nov_occ_parish_priest_service", "pf_church_interior", "pf_church_interior", "any", "church_day", "where_work_happens", "занят приходской службой и обращениями людей"),
    ("nov_occ_ponomar", "pf_church_interior", "pf_churchyard", "any", "church_day", "where_work_happens", "готовит церковь и помогает при службе"),
    ("nov_occ_church_guard", "pf_churchyard", "pf_churchyard", "any", "normal", "where_work_happens", "следит за доступом к церковному двору"),
    ("nov_occ_local_trader", "pf_market_square", "pf_market_square", "any", "market_day", "where_work_happens", "ведёт торг и расчёты"),
    ("nov_occ_market_stall_seller", "pf_market_square", "pf_market_square", "any", "market_day", "where_work_happens", "держит торговое место"),
    ("nov_occ_market_guard", "pf_market_square", "pf_market_square", "any", "market_day", "where_work_happens", "наблюдает за порядком на торгу"),
    ("nov_occ_blacksmith", "pf_smithy", "pf_smithy", "any", "normal", "where_work_happens", "занят кузнечной работой"),
    ("nov_occ_carpenter", "pf_ordinary_workshop", "pf_ordinary_workshop", "any", "normal", "where_work_happens", "занят плотницкой работой"),
    ("nov_occ_potter", "pf_ordinary_workshop", "pf_ordinary_workshop", "any", "normal", "where_work_happens", "занят гончарной работой"),
    ("occ_locksmith", "pf_smithy", "pf_smithy", "any", "normal", "where_work_happens", "делает или чинит замки и скобы"),
    ("occ_netmaker", "pf_ordinary_workshop", "pf_ordinary_workshop", "any", "normal", "where_work_happens", "вяжет или чинит рыболовные сети"),
    ("occ_market_baker", "pf_market_square", "pf_market_square", "any", "market_day", "where_work_happens", "продаёт выпеченный хлеб на торгу"),
)


def read_rows(path, delimiter=","):
    with path.open(encoding="utf-8", newline="") as stream:
        return {row["occupation_id"]: row for row in csv.DictReader(stream, delimiter=delimiter)}


def phase(state, minutes, summary, presence, location, reason=""):
    return {"state_id": state, "duration_minutes": minutes,
            "runtime_status": "sleeping" if "sleep" in state or state.endswith("rest") else "available",
            "activity_ref": "routine_" + state + "_v1", "summary": summary,
            "activity_status": "active", "uses_current_activity": False,
            "can_continue_automatically": True, "decision_required": False,
            "presence_state": presence, "location_ref": location,
            "absence_reason_ru": reason}


def daylight(season):
    record = json.loads(LIGHT.read_text(encoding="utf-8"))[0]
    assert record["status"] == "approved" and record["record_id"] in LIGHT_REF
    month = MONTHS[season][1]
    value = record["payload"]["daylight_boundary_rules"]["year_daily_boundaries"]["1230"][f"{month:02d}-15"]
    return int(value["sunrise_minute_of_day"]), int(value["sunset_minute_of_day"])


def routine_blocks(origin, work, season, action, *, household=False, sleep_location="", early_service=False, baker=False, night=False, market=False):
    sunrise, sunset = daylight(season)
    wake = min(sunrise, 270 if season == "winter" else 330) if season in {"winter", "autumn"} else sunrise
    bedtime = max(sunset + 60, 1260) if season != "summer" else max(sunset + 60, 1320)
    parts = []

    def add(state, start, end, summary, location, presence=None):
        if end <= start:
            return
        presence = presence or ("on_site" if location else "away")
        reason = (f"занятие у {location}" if location else
                  ("дома; место не установлено" if state in {"preparation", "evening_tasks"} else
                   "ночлег требует индивидуальной привязки" if "sleep" in state else
                   "место вне службы требует индивидуальной привязки")) if presence == "away" else ""
        parts.append(phase(state, end - start, summary, presence, location, reason))

    if baker:
        add("night_baking", 0, sunrise, "Выпечка с ночи у дворовой печи; час условный.", origin)
        add("morning_work", sunrise, 720, action, work)
    elif early_service:
        bell = max(0, sunrise - 60)
        add("sleep_before_service", 0, bell, "Сон до заутрени; ночлег не установлен.", "", "away")
        add("early_service", bell, sunrise, "Заутреня; пономарь подаёт сигнал к службе.", work)
        add("morning_work", sunrise, 720, action, work)
    elif night:
        start = max(sunset, 1080)
        add("night_work", 0, 120, action, work)
        add("day_rest", 120, start, "Отдых между ночными сменами; место ночлега не установлено.", "", "away")
        add("night_work_after_dusk", start, 1440, action, work)
        assert sum(p["duration_minutes"] for p in parts) == 1440
        return parts
    else:
        add("sleep_before_dawn", 0, wake, "Сон в своём дворе." if household else "Ночной сон; место неизвестно.", sleep_location if household else "", "on_site" if household else "away")
        work_start = max(wake + 60, sunrise)
        add("preparation", wake, work_start, "Утренние дела: забота о скоте, печи и воде (поздняя аналогия)." if household else "Готовится к работе дома; место не установлено.", origin if household else "")
        add("morning_work", work_start, 720, action, work)
    add("noon_meal", 720, 765, "Полуденная трапеза (аналогия).", origin if household else "")
    add("post_meal_rest", 765, 855, "Послеобеденный отдых (аналогия; длительность редакционная).", origin if household else "", "on_site" if household else "away")
    add("afternoon_work", 855, sunset, "Послеобеденные расчёты и домашние дела (поздняя аналогия)." if market else action, "" if market else work)
    add("evening_tasks", sunset, bedtime, "Вечерние дела при свете лучины; конкретный свет зависит от сцены." if household else "Вечерние дела дома; место не установлено.", origin if household else "")
    add("sleep_after_dusk", bedtime, 1440, "Сон в своём дворе." if household else "Ночной сон; место неизвестно.", sleep_location if household else "", "on_site" if household else "away")
    assert sum(p["duration_minutes"] for p in parts) == 1440
    return parts


def build():
    occupations = read_rows(BASE, "\t") | read_rows(ADDITIONS)
    with ROLES.open(encoding="utf-8", newline="") as stream:
        roles = {r["role_id"] for r in csv.DictReader(stream, delimiter="\t")}
    with PLACES.open(encoding="utf-8", newline="") as stream:
        places = {row["pf_id"] for row in csv.DictReader(stream)}
    with PRESENCE.open(encoding="utf-8", newline="") as stream:
        presence = list(csv.DictReader(stream))
    specs = {}
    for occupation_id, origin, work, season, day_type, field, action in SCHEDULES:
        for actual_season in (MONTHS if season == "any" else (season,)):
            specs[("occupation", occupation_id, origin, actual_season, day_type)] = (work, field, action)
            if day_type in {"church_day", "market_day"}:
                specs.setdefault(("occupation", occupation_id, origin, actual_season, "normal"),
                                 (work, "daily_schedule_normal", ""))
    for item in presence:
        for season in item["allowed_seasons"].split(";"):
            key = (item["subject_kind"], item["subject_ref"], item["scope_ref"], season, "normal")
            specs.setdefault(key, (item["scope_ref"], "daily_schedule_" + ("spring_rasputitsa" if season == "spring" else season), ""))
    for season in MONTHS:
        for kind, subject in (("social_role", "nov_role_household_mistress"),
                              ("occupation", "nov_occ_household_servant"),
                              ("household_child", "")):
            specs.setdefault((kind, subject, "pf_peasant_homestead", season, "normal"),
                             ("pf_peasant_homestead", "daily_schedule_" + ("spring_rasputitsa" if season == "spring" else season), ""))
        for guard, place in (("nov_occ_church_guard", "pf_churchyard"),
                             ("nov_occ_market_guard", "pf_market_square")):
            specs[("occupation", guard, place, season, "night_watch")] = (place, "night_behavior", "Ночная стража при назначенной смене.")
    specs[("occupation", "nov_occ_fisher", "pf_riverbank", "summer", "night_fishing")] = (
        "pf_riverbank", "night_behavior", "Ночной лов с огнём при подходящих условиях.")
    rows = []
    for (kind, subject, origin, season, day_type), (work, field, action) in sorted(specs.items()):
        occupation = occupations.get(subject) if kind == "occupation" else None
        role = subject if kind == "social_role" else (occupation["allowed_social_role_ids"].split(";")[0].strip() if occupation else "")
        assert kind == "household_child" or occupation or role in roles
        if subject == "nov_occ_ferryman" and season == "winter":
            work = "pf_winter_ice_crossing"
            action = "Следит за зимником и ледовой переправой, когда переход открыт."
        if subject == "nov_occ_ponomar":
            work = "pf_church_interior"
        if subject == "occ_netmaker":
            work = "pf_rural_yard" if season == "winter" else "pf_fishing_camp"
            origin = "pf_rural_yard"
        if subject == "occ_market_baker":
            origin = "pf_rural_yard"
        assert origin in places and work in places
        season_field = "daily_schedule_" + ("spring_rasputitsa" if season == "spring" else season)
        if occupation and subject.startswith("occ_"):
            seasonal = occupation.get(season_field, "")
            if seasonal.startswith("то же"):
                seasonal = occupation.get("daily_schedule_winter", "") + ("; " + seasonal[6:].strip() if seasonal[6:].strip() else "")
            action = seasonal or action
            field = season_field if seasonal else field
        elif occupation and not action:
            action = "Занят делом: " + (occupation.get("occupation_title_ru") or occupation.get("occupation_title", "")) + " (редакторское описание)."
            field = "occupation_title_ru" if subject.startswith("occ_") else "occupation_title"
        action = action or ("Забота о дворе, скоте и воде (поздняя аналогия)." if kind == "social_role" else "Домашние дела по возрасту (редакторское допущение).")
        if day_type == "market_day" and subject in {"nov_occ_local_trader", "nov_occ_market_stall_seller", "occ_market_baker"}:
            action = "Торг до полудня (поздняя аналогия)."
        action = re.split(r"(?i)(?:;\s*)?(?:вечером|ночью)\s*[:—]", action, maxsplit=1)[0].strip()
        household = origin in {"pf_peasant_homestead", "pf_rural_yard", "pf_outbuildings"}
        sleep_location = "pf_rural_yard" if origin == "pf_outbuildings" else origin
        blocks = routine_blocks(origin, work, season, action, household=household, sleep_location=sleep_location,
                                early_service=subject in {"nov_occ_ponomar", "nov_occ_parish_priest_service"},
                                baker=subject == "occ_market_baker", night=day_type in {"night_watch", "night_fishing"},
                                market=day_type == "market_day")
        source = ("data/novgorod-region/novgorod_occupations_v1_enriched.tsv" if subject.startswith("nov_")
                  else "occupations-activities/occupations/occupations_additions.csv")
        refs = ([f"{source}#{subject}:{field}"] if occupation else
                ([f"data/novgorod-region/novgorod_social_roles_v1_enriched.tsv#{role}"] if role else ["book:622242 ¶519"]))
        refs += [f"places-binding/places/place_families.csv#{origin}", LIGHT_REF,
                 "book:375645 ¶959", "book:375645 ¶960", "book:375645 ¶963",
                 "book:375645 ¶964", "book:375645 ¶965",
                 "occupations-activities/occupations/occupations_additions.csv#occ_netmaker:daily_schedule_winter"]
        if day_type == "market_day":
            refs.append("book:375645 ¶967")
        if work != origin:
            refs.append(f"places-binding/places/place_families.csv#{work}")
        if any(p["subject_ref"] == subject and p["scope_ref"] == origin for p in presence):
            refs.append(f"places-binding/presence/people_presence_authoring.csv#{subject}")
        if household:
            refs.append("book:622242 ¶519")
            if sleep_location != origin:
                refs.append(f"places-binding/places/place_families.csv#{sleep_location}")
        if subject in {"nov_occ_ponomar", "nov_occ_parish_priest_service"}:
            refs.append("book:641342 ¶1788")
        if subject == "nov_occ_ponomar":
            refs.append("book:641342 ¶1557")
        if subject == "occ_market_baker":
            refs.append("occupations-activities/occupations/occupations_additions.csv#occ_market_baker:daily_schedule_winter")
        if day_type == "night_fishing":
            refs.append("book:622242 ¶1435")
        if day_type == "night_watch":
            refs.append("book:185868 ¶684")
        rows.append(dict(zip(FIELDS, (
            f"sch_{subject or 'household_child'}_{origin}_{day_type}_{season}", "2", role, subject if occupation else "",
            day_type, season, "|".join(str(month) for month in MONTHS[season]), "0",
            json.dumps(blocks, ensure_ascii=False, separators=(",", ":")),
            "", ";".join(dict.fromkeys(refs)), "rule:editorial_daylight_phase_partition_v2",
            "no_source:exact_clock_times_and_individual_presence"
                + (";no_source:child_role_not_catalogued" if kind == "household_child" else ""),
            "C", "candidate", "Сезонный распорядок-кандидат; конкретный человек и доступ требуют сцены."
            + (" Ночная стража по ¶684 — аналогия военного стана." if day_type == "night_watch" else "")))))
    return rows


def render():
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(build())
    return stream.getvalue().encode("utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = render()
    if args.check:
        assert OUT.read_bytes() == content, "schedules_routines.csv needs rebuild"
        print(f"OK: {len(build())} rows match builder")
    else:
        OUT.write_bytes(content)
        print(f"wrote {len(build())} rows to {OUT}")
