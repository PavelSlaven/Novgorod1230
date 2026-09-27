#!/usr/bin/env python
"""Build occupation-specific candidate routines; exact hours are editorial."""
import argparse
import csv
import io
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "schedules_routines.csv"
REPO = HERE.parents[6]
BASE = REPO / "data/novgorod-region/novgorod_occupations_v1_enriched.tsv"
ADDITIONS = HERE.parents[2] / "occupations-activities/occupations/occupations_additions.csv"
PLACES = HERE.parents[2] / "places-binding/places/place_families.csv"
FIELDS = ("sch_id", "revision", "role_ref", "occupation_ref", "day_type", "season",
          "months", "local_start_minute", "time_blocks", "place_access_ref",
          "source_refs", "source_rule_ref", "no_source", "confidence", "status", "note")

# Occupation, starting place, work place, season, day type, source field, action.
# These are candidates for a scene, not committed locations of individual NPCs.
SCHEDULES = (
    ("nov_occ_ferryman", "pf_ferry_landing", "pf_ferry_landing", "summer", "normal", "where_work_happens", "ожидает перевоз и помогает при переправе"),
    ("nov_occ_ferryman", "pf_ferry_landing", "pf_ferry_landing", "winter", "normal", "where_work_happens", "следит за переправой; речной перевоз может быть недоступен"),
    ("nov_occ_crossing_guard", "pf_ferry_landing", "pf_ferry_landing", "summer", "normal", "where_work_happens", "наблюдает за местом переправы"),
    ("nov_occ_ploughman", "pf_peasant_homestead", "pf_arable_field", "spring", "normal", "where_work_happens", "работает в поле при подходящей погоде"),
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
            "runtime_status": "sleeping" if state == "rest" else "available",
            "activity_ref": "routine_" + state + "_v1", "summary": summary,
            "activity_status": "active", "uses_current_activity": False,
            "can_continue_automatically": True, "decision_required": False,
            "presence_state": presence, "location_ref": location,
            "absence_reason_ru": reason}


def build():
    occupations = read_rows(BASE, "\t") | read_rows(ADDITIONS)
    with PLACES.open(encoding="utf-8", newline="") as stream:
        places = {row["pf_id"] for row in csv.DictReader(stream)}
    rows = []
    for occupation_id, origin, work, season, day_type, field, action in SCHEDULES:
        occupation = occupations[occupation_id]
        assert origin in places and work in places
        assert occupation.get(field) and occupation[field] != "no_source"
        role = occupation["allowed_social_role_ids"].split(";")[0].strip()
        work_minutes = 480 if season == "winter" else 600
        blocks = [
            phase("preparation", 120, "Готовится к делам дня.", "on_site", origin),
            phase("work", work_minutes, action, "on_site" if work == origin else "away", work,
                  "работа в другом месте" if work != origin else ""),
            phase("return", 720 - work_minutes, "Завершает дневные дела.", "nearby", origin),
            phase("rest", 600, "Отдыхает; конкретное ночное место не установлено.",
                  "away", "", "ночное место требует индивидуальной привязки"),
        ]
        source = ("data/novgorod-region/novgorod_occupations_v1_enriched.tsv" if occupation_id.startswith("nov_")
                  else "occupations-activities/occupations/occupations_additions.csv")
        rows.append(dict(zip(FIELDS, (
            f"sch_{occupation_id}_{day_type}_{season}", "1", role, occupation_id,
            day_type, season, "", "360", json.dumps(blocks, ensure_ascii=False, separators=(",", ":")),
            "", f"{source}#{occupation_id}:{field};places-binding/places/place_families.csv#{origin};"
                f"places-binding/places/place_families.csv#{work}"
                + (f";{occupation['source_refs']}" if occupation_id.startswith("occ_") else ""),
            "rule:editorial_24h_phase_partition_v1",
            "no_source:exact_clock_times_and_individual_presence"
                + (";no_source:occupation_specific_winter_timetable" if season == "winter" and occupation_id.startswith("nov_") else ""),
            "C", "candidate", "Распорядок-кандидат; часы и присутствие требуют привязки к сцене."))))
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
        print(f"OK: {len(SCHEDULES)} rows match builder")
    else:
        OUT.write_bytes(content)
        print(f"wrote {len(SCHEDULES)} rows to {OUT}")
