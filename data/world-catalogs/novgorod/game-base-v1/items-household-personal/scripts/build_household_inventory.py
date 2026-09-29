"""Build the class-C household/workshop inventory relation deterministically."""
from collections import Counter, defaultdict
import json
import re

from common import ITEMS, REPORTS, ROOT, read_csv, write_csv
from household_inventory_rules import (
    BROAD_HOUSEHOLD_EXTRAS, COMMON_ADORNMENTS, COMPOSITION_SOURCE, FIRST_OPEN, FOOD_SOURCE,
    HERD_PROFILE_BY_HOUSEHOLD, HOUSEHOLD_CORE, HOUSEHOLD_PROFILE_EXTRAS, HOUSEHOLDS, PLACE_ROWS, PLACE_SETS,
    REJECTED_ANACHRONISMS, RICH_EXTRAS, RICH_TRADE_EXTRAS,
    WORKSHOP_SHARED,
)

GAME = ROOT / "data/world-catalogs/novgorod/game-base-v1"
WORKSHOPS = GAME / "crafts-tools-processes/workshops/workshops.csv"
OUT = ITEMS / "household_inventory_profiles.csv"
REJECTED = REPORTS / "household_inventory_rejected.csv"
COVERAGE = REPORTS / "household_inventory_coverage.json"
ITEM_COVERAGE_CSV = REPORTS / "item_catalog_coverage.csv"
ITEM_COVERAGE_JSON = REPORTS / "item_catalog_coverage.json"

FIELDS = [
    "hip_id", "profile_id", "profile_kind", "profile_ref", "pf_id",
    "household_type", "household_class", "composition_ref", "occupation_ref",
    "need_category", "ref_kind", "object_ref", "requirement",
    "quantity_norm", "composition_factor", "wealth_multiplier", "quantity_mode",
    "quantity_rule", "materialization_scope", "first_open_rule_ref",
    "item_place_frequency_ref", "ownership_rule_ref", "basis", "derivation",
    "source_refs", "owner_gap_ref", "confidence", "status",
]

HEADCOUNT_FACTORS = {
    "per_baptized_wearer", "per_bather", "per_child", "per_eater", "per_eligible_wearer",
    "per_infant", "per_served_eater", "per_sleeper", "per_two_sleepers",
}
D_CONFIDENCE_REFS = {
    "n1230:material_item:fod0027", "n1230:material_item:frn0048", "n1230:material_item:trd0002",
}


def slug(value):
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def quantity_rule(mode, norm, factor, wealth, requirement):
    if mode == "formula":
        minimum = "0" if requirement in {"conditional", "contextual", "wealth_extra"} else "1"
        return f"max({minimum}, ceil({norm} * actual:{factor} * {wealth}))"
    if mode == "seasonal_stock":
        return f"max(1, ceil({norm} * actual:{factor} * {wealth} * season_need))"
    if mode == "conditional_presence":
        return f"0 unless context condition holds; then max(1, ceil({norm or '1'} * actual:{factor}))"
    if mode == "delegated_profile":
        return "delegate quantity to referenced owner profile; do not duplicate its rows"
    raise ValueError(f"unknown quantity mode: {mode}")


def make_row(profile, spec, serial):
    (need, ref_kind, object_ref, requirement, norm, factor, mode, scope,
     basis, derivation, source_refs) = spec
    object_ref = object_ref.format(
        household_type=profile.get("household_type", ""),
        herd_profile=profile.get("herd_profile", ""),
    )
    wealth = profile["wealth_factor"] if scope == "stored" and mode in {"formula", "seasonal_stock"} else "1.00"
    if factor in HEADCOUNT_FACTORS or object_ref == "it_ps_pectoral_cross":
        wealth = "1.00"
    elif requirement == "required" and factor.startswith("per_"):
        wealth = f"{max(1.0, float(wealth)):.2f}"
    if wealth != "1.00":
        derivation = f"{derivation}; wealth multiplier {wealth} is class-C editorial calibration"
    profile_id = profile["profile_id"]
    pf_id = profile.get("pf_id", "")
    item_ref = ""
    ownership_ref = ""
    if ref_kind == "item" and pf_id:
        item_ref = f"items/item_place_frequency.csv#item_or_category_ref={object_ref};pf_id={pf_id}"
        ownership_ref = f"items/ownership_rules.csv#pf_id={pf_id};item_group=from:{object_ref}"
    return {
        "hip_id": f"hip_{slug(profile_id)}__{slug(need)}__{slug(object_ref)}__{serial:03d}",
        "profile_id": profile_id,
        "profile_kind": profile["profile_kind"],
        "profile_ref": profile["profile_ref"],
        "pf_id": pf_id,
        "household_type": profile.get("household_type", ""),
        "household_class": profile.get("household_class", ""),
        "composition_ref": profile.get("composition_ref", ""),
        "occupation_ref": profile.get("occupation_ref", ""),
        "need_category": need,
        "ref_kind": ref_kind,
        "object_ref": object_ref,
        "requirement": requirement,
        "quantity_norm": norm,
        "composition_factor": factor,
        "wealth_multiplier": wealth,
        "quantity_mode": mode,
        "quantity_rule": quantity_rule(mode, norm, factor, wealth, requirement),
        "materialization_scope": scope,
        "first_open_rule_ref": FIRST_OPEN if scope == "stored" else "",
        "item_place_frequency_ref": item_ref,
        "ownership_rule_ref": ownership_ref,
        "basis": basis,
        "derivation": derivation,
        "source_refs": source_refs,
        "owner_gap_ref": profile.get("owner_gap_ref", ""),
        "confidence": "D" if object_ref in D_CONFIDENCE_REFS else "C",
        "status": "candidate",
    }


def household_profiles():
    profiles = []
    for hh_type, hh_class, pf_id, composition_ref, wealth, scenes in HOUSEHOLDS:
        profiles.append({
            "profile_id": hh_type,
            "profile_kind": "household",
            "profile_ref": f"{FOOD_SOURCE}#household_type={hh_type}",
            "pf_id": pf_id,
            "household_type": hh_type,
            "household_class": hh_class,
            "composition_ref": f"{COMPOSITION_SOURCE}#{composition_ref}",
            "occupation_ref": "",
            "wealth_factor": wealth,
            "herd_profile": HERD_PROFILE_BY_HOUSEHOLD[hh_type],
            "scene_refs": scenes,
        })
    return profiles


def workshop_profiles():
    profiles = []
    specs = {}
    for row in read_csv(WORKSHOPS):
        profiles.append({
            "profile_id": row["ws_id"], "profile_kind": "workshop",
            "profile_ref": f"crafts-tools-processes/workshops/workshops.csv#{row['ws_id']}",
            "pf_id": row["pf_id"], "household_type": "", "household_class": "",
            "composition_ref": "", "occupation_ref": row["occupations"],
            "wealth_factor": "1.00", "scene_refs": row["matcult_scene_ref"],
        })
        own = []
        for tool in row["tools"].split(";"):
            if tool:
                own.append(("occupation_tools", "tool", tool, "required", "1", "per_active_station",
                            "formula", "scene", "sourced",
                            "инструмент прямо входит в существующий профиль мастерской",
                            f"workshop:{row['ws_id']};{row['source_refs']}"))
        for stock in row["stocks"].split(";"):
            if stock:
                own.append(("occupation_tools", "workshop_stock", stock, "required", "",
                            "actual_work_batches", "delegated_profile", "delegated", "sourced",
                            "сырьё прямо входит в существующий профиль мастерской; количество задаёт партия процесса",
                            f"workshop:{row['ws_id']};{row['source_refs']}"))
        specs[row["ws_id"]] = own
    return profiles, specs


def place_profiles():
    return [{
        "profile_id": profile_id, "profile_kind": "place_set", "profile_ref": profile_ref,
        "pf_id": pf_id, "household_type": "", "household_class": "",
        "composition_ref": "", "occupation_ref": occupation_ref,
        "wealth_factor": wealth, "owner_gap_ref": owner_gap_ref, "scene_refs": source_refs,
    } for profile_id, pf_id, profile_ref, occupation_ref, wealth, owner_gap_ref, source_refs in PLACE_SETS]


def main():
    rows = []
    profiles = household_profiles()
    for profile in profiles:
        serial = 0
        for spec in HOUSEHOLD_CORE:
            serial += 1
            rows.append(make_row(profile, spec, serial))
        for spec in BROAD_HOUSEHOLD_EXTRAS:
            serial += 1
            rows.append(make_row(profile, spec, serial))
        for spec in HOUSEHOLD_PROFILE_EXTRAS.get(profile["household_type"], []):
            serial += 1
            rows.append(make_row(profile, spec, serial))
        if profile["household_type"] != "hh_monastery":
            for spec in COMMON_ADORNMENTS:
                serial += 1
                rows.append(make_row(profile, spec, serial))
        if profile["household_type"] in {"hh_merchant_urban", "hh_boyar_urban"}:
            for spec in RICH_EXTRAS:
                serial += 1
                rows.append(make_row(profile, spec, serial))
        if profile["household_type"] == "hh_merchant_urban":
            for spec in RICH_TRADE_EXTRAS:
                serial += 1
                rows.append(make_row(profile, spec, serial))
        if profile["household_type"] == "hh_monastery":
            monastery = [
                ("import_luxury", "garment", "gm_cl005", "wealth_extra", "1", "per_liturgical_context", "conditional_presence", "stored", "sourced", "шёлк допустим в церковном облачении богатого храма, не как обычная одежда кельи", "clothing-appearance/garments/garments.csv#gm_cl005"),
                ("import_luxury", "food_item", "fd_wine_imported", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "sourced", "при первом открытии вино возможно только для литургического или гостевого контекста; household food profile его не содержит", "food-drink/food/ingredients.csv#fd_wine_imported"),
                ("ritual_church", "matcult_item", "REL0004", "conditional", "1", "per_literate_cell_or_church", "conditional_presence", "scene", "sourced", "церковная книга не выдаётся каждой келье; нужен конкретный книжный контекст", "matcult:REL0004;matcult_scene:SCN051"),
            ]
            for spec in monastery:
                serial += 1
                rows.append(make_row(profile, spec, serial))

    place_sets = place_profiles()
    profiles.extend(place_sets)
    for profile in place_sets:
        for serial, spec in enumerate(PLACE_ROWS[profile["profile_id"]], 1):
            rows.append(make_row(profile, spec, serial))

    workshops, workshop_specs = workshop_profiles()
    profiles.extend(workshops)
    for profile in workshops:
        serial = 0
        for spec in WORKSHOP_SHARED + workshop_specs[profile["profile_id"]]:
            serial += 1
            rows.append(make_row(profile, spec, serial))

    ambient_pairs = {(r["item_or_category_ref"], r["pf_id"])
                     for r in read_csv(ITEMS / "item_place_frequency.csv") if r["ref_kind"] == "it"}
    for row in rows:
        if row["ref_kind"] == "item" and row["pf_id"] and (row["object_ref"], row["pf_id"]) not in ambient_pairs:
            # Mandatory class-C content is a different decision from ambient arrival frequency.
            row["item_place_frequency_ref"] = ""

    rows.sort(key=lambda r: r["hip_id"])
    count = write_csv(OUT, rows, FIELDS)
    write_csv(REJECTED,
              [{"term": t, "verdict": v, "reason": reason, "safe_replacement": replacement}
               for t, v, reason, replacement in REJECTED_ANACHRONISMS],
              ["term", "verdict", "reason", "safe_replacement"])

    by_profile = Counter(r["profile_id"] for r in rows)
    needs = defaultdict(set)
    for row in rows:
        needs[row["profile_id"]].add(row["need_category"])
    report = {
        "status": "candidate",
        "rows": count,
        "profiles": len(by_profile),
        "household_profiles": sum(p["profile_kind"] == "household" for p in profiles),
        "workshop_profiles": sum(p["profile_kind"] == "workshop" for p in profiles),
        "place_set_profiles": sum(p["profile_kind"] == "place_set" for p in profiles),
        "item_rows_with_ambient_frequency_link": sum(r["ref_kind"] == "item" and bool(r["item_place_frequency_ref"]) for r in rows),
        "item_rows_without_ambient_frequency_link": sum(r["ref_kind"] == "item" and bool(r["pf_id"]) and not r["item_place_frequency_ref"] for r in rows),
        "rows_by_profile": dict(sorted(by_profile.items())),
        "need_categories_by_profile": {p: sorted(v) for p, v in sorted(needs.items())},
        "place_owner_gaps": {p["profile_id"]: p["owner_gap_ref"] for p in place_sets if p["owner_gap_ref"]},
        "quantity_boundary": "For unspecified household size, rows retain actual composition factors and are not resolved to an invented average.",
    }
    REPORTS.mkdir(exist_ok=True)
    COVERAGE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inventory_profiles = defaultdict(set)
    for row in rows:
        if row["ref_kind"] == "item":
            inventory_profiles[row["object_ref"]].add(row["profile_id"])
    ambient_counts = Counter(r["item_or_category_ref"] for r in read_csv(ITEMS / "item_place_frequency.csv")
                             if r["ref_kind"] == "it")
    item_coverage = []
    for source_catalog in ("household.csv", "personal.csv"):
        for item in read_csv(ITEMS / source_catalog):
            iid = item["it_id"]
            profiles_for_item = sorted(inventory_profiles[iid])
            ambient_count = ambient_counts[iid]
            if profiles_for_item:
                kind, reason = "inventory", ""
            elif ambient_count:
                kind, reason = "ambient_frequency", ""
            else:
                raise ValueError(f"{iid}: no inventory/ambient coverage and no authored closed reason")
            item_coverage.append({
                "item_id": iid, "source_catalog": source_catalog,
                "inventory_profiles": ";".join(profiles_for_item),
                "ambient_frequency_rows": str(ambient_count), "coverage_kind": kind,
                "reason_code": reason,
            })
    item_coverage.sort(key=lambda r: r["item_id"])
    write_csv(ITEM_COVERAGE_CSV, item_coverage,
              ["item_id", "source_catalog", "inventory_profiles", "ambient_frequency_rows",
               "coverage_kind", "reason_code"])
    coverage_summary = {
        "status": "candidate", "items": len(item_coverage),
        "household_items": sum(r["source_catalog"] == "household.csv" for r in item_coverage),
        "personal_items": sum(r["source_catalog"] == "personal.csv" for r in item_coverage),
        "coverage_kind": dict(sorted(Counter(r["coverage_kind"] for r in item_coverage).items())),
        "closed_reason": dict(sorted(Counter(r["reason_code"] for r in item_coverage if r["reason_code"]).items())),
        "rule": "Every catalog item is present in a class-C inventory, ambient item-place frequency, or one closed reason.",
    }
    ITEM_COVERAGE_JSON.write_text(json.dumps(coverage_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"household_inventory_profiles={count} profiles={len(by_profile)} rejected={len(REJECTED_ANACHRONISMS)}")


if __name__ == "__main__":
    main()
