#!/usr/bin/env python
"""Validate candidate author schedules and their deterministic build."""
import csv
import json
import re
from functools import lru_cache
from pathlib import Path

from build_schedules import ADDITIONS, BASE, FIELDS, OUT, PLACES, REPO, read_rows, render

GAME_BASE = REPO / "data/world-catalogs/novgorod/game-base-v1"
NOVGOROD = REPO / "data/world-catalogs/novgorod"


@lru_cache(maxsize=None)
def anchor_values(path, column):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return {row[column] for row in csv.DictReader(stream, delimiter="\t" if path.suffix == ".tsv" else ",")}


def resolve_source_ref(ref, previous=None):
    """Resolve file references; book and no_source markers have no file part."""
    if ref.startswith("book:"):
        assert re.match(r"^book:\d+\b", ref), ref
        return None
    if ref.startswith("no_source:"):
        return None
    if ref.startswith("#"):
        assert previous is not None, ref
        path, anchor = previous, ref[1:]
    else:
        assert "#" in ref, ref
        file_ref, anchor = ref.split("#", 1)
        if file_ref.startswith("data/"):
            path = REPO / file_ref
        elif file_ref.startswith(("occupations-activities/", "places-binding/")):
            path = GAME_BASE / file_ref
        elif file_ref.startswith("gb:"):
            path = NOVGOROD / file_ref[3:]
        elif file_ref.startswith("wk:"):
            path = NOVGOROD / "world-knowledge/production-v1" / file_ref[3:]
        else:
            raise AssertionError(f"unknown source path: {ref}")
    path = path.resolve()
    assert path.is_relative_to(REPO) and path.is_file(), ref
    anchor_id, _, field = anchor.partition(":")
    anchor_id = anchor_id.split("(", 1)[0]
    if path == BASE or path == ADDITIONS:
        assert anchor_id in anchor_values(path, "occupation_id"), ref
        if field:
            with path.open(encoding="utf-8", newline="") as stream:
                assert field in csv.DictReader(stream, delimiter="\t" if path == BASE else ",").fieldnames, ref
    elif path == PLACES:
        assert anchor_id in anchor_values(path, "pf_id"), ref
    elif path.name == "professions.csv":
        assert anchor_id in anchor_values(path, "profession_id"), ref
    else:
        assert anchor, ref
    return path

with OUT.open(encoding="utf-8", newline="") as stream:
    reader = csv.DictReader(stream)
    assert reader.fieldnames == list(FIELDS), "schedule header changed"
    rows = list(reader)
assert rows and OUT.read_bytes() == render(), "schedule CSV differs from builder"
occupations = read_rows(BASE, "\t") | read_rows(ADDITIONS)
with PLACES.open(encoding="utf-8", newline="") as stream:
    places = {row["pf_id"] for row in csv.DictReader(stream)}
seen = set()
for row in rows:
    key = row["sch_id"]
    assert key not in seen, key
    seen.add(key)
    assert row["revision"].isdigit() and int(row["revision"]) > 0, key
    occupation = occupations[row["occupation_ref"]]
    assert row["role_ref"] in {v.strip() for v in occupation["allowed_social_role_ids"].split(";")}, key
    assert row["day_type"] in {"normal", "market_day", "church_day"}, key
    assert row["season"] in {"any", "winter", "spring", "summer", "autumn"}, key
    assert row["months"] == "" or all(1 <= int(v) <= 12 for v in row["months"].split("|")), key
    assert 0 <= int(row["local_start_minute"]) < 1440, key
    assert row["place_access_ref"] == "" or row["place_access_ref"].startswith("record:"), key
    assert row["source_refs"] and row["source_rule_ref"].startswith("rule:"), key
    previous = None
    for ref in row["source_refs"].split(";"):
        ref = ref.strip()
        assert ref, key
        previous = resolve_source_ref(ref, previous) or previous
    assert row["no_source"].startswith("no_source:"), key
    assert row["confidence"] in {"A", "B", "C"} and row["status"] == "candidate", key
    blocks = json.loads(row["time_blocks"])
    assert isinstance(blocks, list) and blocks, key
    assert sum(block["duration_minutes"] for block in blocks) == 1440, key
    assert len({block["state_id"] for block in blocks}) == len(blocks), key
    for block in blocks:
        assert set(block) == {"state_id", "duration_minutes", "runtime_status", "activity_ref",
                              "summary", "activity_status", "uses_current_activity",
                              "can_continue_automatically", "decision_required", "presence_state",
                              "location_ref", "absence_reason_ru"}, key
        assert isinstance(block["duration_minutes"], int) and block["duration_minutes"] > 0, key
        assert block["runtime_status"] in {"available", "sleeping"}, key
        assert block["activity_status"] in {"active", "paused"}, key
        assert block["presence_state"] in {"on_site", "nearby", "away"}, key
        assert block["location_ref"] == "" or block["location_ref"] in places, key
        assert block["presence_state"] != "away" or block["absence_reason_ru"], key
        assert block["presence_state"] == "away" or not block["absence_reason_ru"], key
        for field in ("uses_current_activity", "can_continue_automatically", "decision_required"):
            assert isinstance(block[field], bool), key
print(f"OK: {len(rows)} schedules, {len({r['occupation_ref'] for r in rows})} occupations, 1440 minutes each")
