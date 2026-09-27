#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Builds time/schedules_routines.csv.

Sources:
  1. main:data/novgorod-region/novgorod_occupations_v1_enriched.tsv,
     columns daily_schedule_normal/winter/spring_rasputitsa/summer/autumn/
     market_day/church_day/crisis (cols 15-22) and night_behavior (col 23).
     VERIFIED BY THIS SCRIPT: these columns hold the IDENTICAL free-text
     string across all 68 occupation rows (checked: 1 distinct value per
     column). This is a template placeholder, not per-occupation content --
     recorded as a gap in README.md, not silently treated as real per-role
     data.
  2. .../nov_region_audit/novgorod_status_rules_v1.json ->
     schedule_adaptation_rules (4 rules, each individually marked
     "approved" inside an overall draft-status file).
  3. temporal-v4 approved datasets (place_access_schedules 1 record,
     npc_temporal_profiles_policies 2 records) -- referenced, not
     duplicated in full.
"""
import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)
OUT_CSV = os.path.join(OUT_DIR, "schedules_routines.csv")

OCC_TSV = r"C:/Users/Slaven/Documents/Novgorod/data/novgorod-region/novgorod_occupations_v1_enriched.tsv"
STATUS_RULES = "C:/Users/Slaven/Documents/\u041e\u0434\u043d\u0438\u043c \u041f\u0420\u041e\u041c\u0422\u041e\u043c/data/rus13-base-staging/nov_region_audit/novgorod_status_rules_v1.json"

FIELDS = [
    "sch_id", "role_or_occupation_ref", "day_type", "season",
    "time_blocks", "place_access_ref", "source_refs", "confidence", "status", "note",
]

rows = []


def add(sch_id, role_ref, day_type, season, time_blocks, place_access_ref, source_refs, confidence, note=""):
    rows.append({
        "sch_id": sch_id,
        "role_or_occupation_ref": role_ref,
        "day_type": day_type,
        "season": season,
        "time_blocks": json.dumps(time_blocks, ensure_ascii=False),
        "place_access_ref": place_access_ref,
        "source_refs": source_refs,
        "confidence": confidence,
        "status": "candidate",
        "note": note,
    })


SEGMENT_WORDS = ("утро", "день", "вечер", "ночь")


def parse_blocks(text):
    """Split free text into qualitative day-segments.

    The source column mixes two styles across rows ('утро: X' with a colon,
    and 'утро раннее' with a bare adjective, plus 'ночью товар...' as an
    inflected form) -- this matches a leading segment keyword as a PREFIX
    of each ';'-separated clause, not a fixed 'word:' pattern.
    """
    parts = [p.strip() for p in text.split(";") if p.strip()]
    blocks = []
    for p in parts:
        m = re.match(r"^(утро|день|вечер|ночь)\S*\s*:?\s*(.*)$", p)
        if m and m.group(1) in SEGMENT_WORDS:
            blocks.append({"segment": m.group(1), "activity_ref": (m.group(2) or p).strip() or p})
        else:
            blocks.append({"segment": "unspecified", "activity_ref": p})
    return blocks


with open(OCC_TSV, encoding="utf-8") as f:
    tsv_rows = list(csv.DictReader(f, delimiter="\t"))

occ_ids = [r["occupation_id"] for r in tsv_rows]
day_type_cols = {
    "normal": "daily_schedule_normal",
    "winter": "daily_schedule_winter",
    "spring_rasputitsa": "daily_schedule_spring_rasputitsa",
    "summer": "daily_schedule_summer",
    "autumn": "daily_schedule_autumn",
    "market_day": "daily_schedule_market_day",
    "church_day": "daily_schedule_church_day",
    "crisis": "daily_schedule_crisis",
}

# Verify the template-uniformity claim the README/note relies on.
uniform = {}
for dt, col in day_type_cols.items():
    vals = set(r[col] for r in tsv_rows)
    uniform[dt] = (len(vals) == 1, next(iter(vals)))
    assert len(vals) == 1, f"expected column {col} to be uniform across occupations; found {len(vals)} distinct values"

night_vals = set(r["night_behavior"] for r in tsv_rows)
assert len(night_vals) == 1
night_text = next(iter(night_vals))

SEASON_OF = {
    "normal": "any", "winter": "winter", "spring_rasputitsa": "spring_rasputitsa",
    "summer": "summer", "autumn": "autumn", "market_day": "any", "church_day": "any", "crisis": "any",
}

TSV_SRC = "main:data/novgorod-region/novgorod_occupations_v1_enriched.tsv (daily_schedule_* columns, uniform template value across all 68 occupation_id rows)"

for dt, col in day_type_cols.items():
    is_uniform, text = uniform[dt]
    add(f"sch_generic_{dt}", "generic_occupation_template (applies verbatim to all 68 occupation_id in novgorod_occupations_v1_enriched.tsv)",
        dt, SEASON_OF[dt], parse_blocks(text), "",
        TSV_SRC, "C",
        note=("GAP: the source column is an unfilled per-occupation template -- identical text repeated for every "
              "occupation_id, not a distinct schedule per role/occupation as the brief's key_fields imply. Kept as "
              "the only generic baseline available; a real per-occupation differentiation (craftsman vs merchant vs "
              "clergy vs peasant) is a fill-later gap, listed in README.md."))

add("sch_generic_night_behavior", "generic_occupation_template", "any", "any",
    [{"segment": "night", "activity_ref": night_text}], "",
    TSV_SRC, "C",
    note="Same template-uniformity gap as above.")

# schedule_adaptation_rules (status_rules draft file, rules individually marked approved).
with open(STATUS_RULES, encoding="utf-8") as f:
    status_rules = json.load(f)

for i, rule in enumerate(status_rules["schedule_adaptation_rules"], start=1):
    add(f"sch_adapt_{rule['trigger']}", "any", "adaptation_rule", "any",
        [{"segment": "rule", "activity_ref": rule["rule"]}], "",
        "rus13-base-staging/nov_region_audit/novgorod_status_rules_v1.json#schedule_adaptation_rules "
        f"(trigger={rule['trigger']})",
        "B" if rule["confidence"].startswith("high") else "C",
        note=f"Правило помечено status={rule['status']} внутри файла со статусом draft (metadata.status=draft); "
             f"исходная confidence метка источника: {rule['confidence']}.")

# Place access schedule (approved, temporal-v4) -- referenced, not duplicated.
add("sch_place_monastic_refectory", "monastic_worker_reconstruction_v1", "church_day", "summer_half_year",
    [{"segment": "midday", "activity_ref": "monastic_refectory access opens at the 6th daylight-hour boundary; "
                                             "closes at end of activity_meal_quiet_rest_daylight_segment_v1"}],
    "record:place_access_schedules:monastic_refectory_v2",
    "temporal-v4/datasets/place_access_schedules.json#record:place_access_schedules:monastic_refectory_v2 (approved)",
    "B",
    note="Полная запись (payload) уже approved в temporal-v4; здесь -- ссылка для домена schedules_routines, не копия. "
         "Applicability: May 1 - Oct 1 (calendar_range), monastic household member or authorized guest only.")

add("sch_npc_monastic_worker", "monastic_worker_reconstruction_v1", "normal", "summer_half_year",
    [{"segment": "reference", "activity_ref": "see temporal-v4 npc_temporal_profiles_policies (full boundary rules, approved)"}],
    "",
    "temporal-v4/datasets/npc_temporal_profiles_policies.json#record:npc_temporal_profiles_policies:monastic_worker_v2 (approved)",
    "B",
    note="Ссылка на уже одобренный npc_schedule_profile; не дублируется.")
add("sch_npc_reaction_signal_policy", "any", "any", "any",
    [{"segment": "reference", "activity_ref": "see temporal-v4 npc_temporal_profiles_policies reaction_signal_policy_v1"}],
    "",
    "temporal-v4/datasets/npc_temporal_profiles_policies.json#record:npc_temporal_profiles_policies:reaction_signal_policy_v1 (approved)",
    "B",
    note="Ссылка на уже одобренную политику реакции на сигналы; не дублируется.")

with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    for r in rows:
        w.writerow(r)

print(f"wrote {len(rows)} rows to {OUT_CSV}")
print(f"occupation_id count referenced (template applies to all): {len(occ_ids)}")
