# -*- coding: utf-8 -*-
"""Validate candidate occupations and resolve archetypes against pinned TSV."""
import csv
import json
import os
import sys
import unicodedata
from pathlib import Path

from archive_professions import (archive_period, confidence_basis, derivation_ref,
                                 provenance_token, read_archive, read_authoring, row_ref)

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "occupations_additions.csv")
TSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..", "novgorod-region", "novgorod_occupations_v1_enriched.tsv")

REQUIRED = [
    "occupation_id", "occupation_title_ru", "occupation_group", "historical_term",
    "occupation_archetype_id",
    "daily_schedule_winter", "daily_schedule_spring_rasputitsa",
    "daily_schedule_summer", "daily_schedule_autumn",
    "how_to_materialize_as_background_npc", "how_to_materialize_as_scene_npc",
    "how_to_materialize_as_key_npc",
    "typical_property", "typical_tools", "typical_clothing", "typical_containers",
    "typical_local_knowledge", "typical_route_knowledge",
    "common_relationships", "common_fears", "common_goals",
    "llm_adaptation_rules", "llm_forbidden_uses",
    "status", "confidence", "source_refs",
]

VALID_CONFIDENCE = {"A", "B", "C"}
EXPECTED_OWNERS = {
    "PRO0020", "PRO0021", "PRO0069", "PRO0073", "PRO0096", "PRO0209", "PRO0210",
    "PRO0369", "PRO0398", "PRO0407", "PRO0448", "PRO0454", "PRO0455", "PRO0465",
}
EXPECTED_SEMANTIC_IDS = {
    "PRO0020": "occ_enameler", "PRO0021": "occ_glass_bead_maker",
    "PRO0069": "occ_charcoal_burner", "PRO0073": "occ_plinth_maker",
    "PRO0096": "occ_dairy_worker", "PRO0209": "occ_well_builder",
    "PRO0210": "occ_household_stove_maker", "PRO0369": "occ_literacy_teacher",
    "PRO0398": "occ_gravedigger", "PRO0407": "occ_bath_keeper",
    "PRO0448": "occ_gusli_player", "PRO0454": "occ_singer",
    "PRO0455": "occ_storyteller", "PRO0465": "occ_inn_host_household",
}
EXPECTED_VARIANT_POLICY = {
    "PRO0018", "PRO0019", "PRO0022", "PRO0078", "PRO0079", "PRO0080",
    "PRO0082", "PRO0083", "PRO0088", "PRO0100", "PRO0102", "PRO0368", "PRO0393",
}
EXPECTED_OA6_LOGICAL = {
    "PRO0096", "PRO0105", "PRO0106", "PRO0108", "PRO0114", "PRO0115",
    "PRO0085", "PRO0099", "PRO0450", "PRO0451",
}
EXPECTED_OA6_SOURCED = {"PRO0448", "PRO0107", "PRO0109", "PRO0111", "PRO0119"}
EXPECTED_REVIEWER_VARIANTS = {
    "PRO0070": "occupation:nov_occ_pitch_tar_worker",
    "PRO0115": "occupation:occ_netmaker",
    "PRO0014": "occupation:occ_jeweler_caster",
    "PRO0081": "occupation:nov_occ_miller",
    "PRO0082": "occupation:nov_occ_miller",
    "PRO0100": "occupation:nov_occ_cook_baker",
    "PRO0085": "occupation:nov_occ_cook_baker",
    "PRO0103": "occupation:nov_occ_storehouse_keeper",
    "PRO0074": "occupation:occ_mason",
    "PRO0095": "occupation:occ_fish_trader",
    "PRO0104": "profile:m2c_npc_forest_worker_v1",
    "PRO0089": "occupation:occ_brewer_meadmaker",
    "PRO0015": "occupation:occ_jeweler_caster",
    "PRO0016": "occupation:occ_jeweler_caster",
    "PRO0018": "occupation:occ_jeweler_caster",
    "PRO0019": "occupation:occ_jeweler_caster",
    "PRO0022": "occupation:occ_jeweler_caster",
    "PRO0078": "occupation:occ_jeweler_caster",
    "PRO0083": "occupation:nov_occ_carpenter",
    "PRO0079": "occupation:nov_occ_scribe",
    "PRO0368": "occupation:nov_occ_scribe",
    "PRO0393": "occupation:nov_occ_ponomar",
    "PRO0101": "occupation:nov_occ_cook_baker",
    "PRO0099": "occupation:nov_occ_cook_baker",
    "PRO0088": "occupation:occ_brewer_meadmaker",
    "PRO0092": "occupation:occ_butcher",
    "PRO0071": "profile:m2c_npc_forest_worker_v1",
    "PRO0075": "occupation:occ_mason",
    "PRO0076": "occupation:occ_icon_painter",
    "PRO0080": "occupation:occ_bone_carver",
    "PRO0116": "occupation:occ_fish_trader",
    "PRO0102": "occupation:nov_occ_market_stall_seller",
    "PRO0408": "occupation:occ_bath_keeper",
    "PRO0370": "occupation:occ_literacy_teacher",
    "PRO0097": "occupation:occ_dairy_worker",
    "PRO0098": "occupation:occ_dairy_worker",
    "PRO0449": "occupation:occ_gusli_player",
    "PRO0450": "occupation:occ_gusli_player",
    "PRO0451": "occupation:occ_gusli_player",
    "PRO0452": "occupation:occ_gusli_player",
}
EXPECTED_OWNER_POLICY = {"PRO0020", "PRO0021", "PRO0073", "PRO0210", "PRO0369", "PRO0407", "PRO0455", "PRO0465"}
EXPECTED_BASE_VARIANTS = {
    "PRO0421": "profile:m2c_npc_household_servant_v1",
    "PRO0112": "profile:m2c_npc_fisher_v1",
    "PRO0054": "occupation:occ_bone_carver",
    "PRO0113": "profile:m2c_npc_fisher_v1",
    "PRO0114": "profile:m2c_npc_fisher_v1",
    "PRO0107": "profile:m2c_npc_fisher_v1",
    "PRO0128": "occupation:occ_furrier",
    "PRO0204": "occupation:occ_mason",
    "PRO0119": "profile:m2c_npc_hunter_v1",
    "PRO0105": "profile:m2c_npc_fisher_v1",
    "PRO0117": "profile:m2c_npc_fisher_v1",
    "PRO0111": "profile:m2c_npc_fisher_v1",
    "PRO0109": "profile:m2c_npc_fisher_v1",
    "PRO0120": "profile:m2c_npc_hunter_v1",
    "PRO0106": "profile:m2c_npc_fisher_v1",
    "PRO0108": "profile:m2c_npc_fisher_v1",
}
EXPECTED_DEFERRED = {
    "PRO0110": "occupation:nov_occ_fish_weir_keeper",
    "PRO0118": "occupation:nov_occ_fish_weir_keeper",
    "PRO0070": "occupation:nov_occ_pitch_tar_worker",
    "PRO0081": "occupation:nov_occ_miller",
    "PRO0082": "occupation:nov_occ_miller",
    "PRO0100": "occupation:nov_occ_cook_baker",
    "PRO0085": "occupation:nov_occ_cook_baker",
    "PRO0101": "occupation:nov_occ_cook_baker",
    "PRO0099": "occupation:nov_occ_cook_baker",
    "PRO0103": "occupation:nov_occ_storehouse_keeper",
    "PRO0083": "occupation:nov_occ_carpenter",
    "PRO0079": "occupation:nov_occ_scribe",
    "PRO0368": "occupation:nov_occ_scribe",
    "PRO0393": "occupation:nov_occ_ponomar",
    "PRO0102": "occupation:nov_occ_market_stall_seller",
}


def main():
    errors = []
    seen_ids = set()
    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    with open(TSV_PATH, encoding="utf-8") as f:
        pinned = list(csv.DictReader(f, delimiter="\t"))
    defaults_path = Path(CSV_PATH).resolve().parents[5] / "world-base-seeds" / "occupation_skill_defaults_v1.csv"
    with defaults_path.open(encoding="utf-8") as f:
        archetypes = {r["occupation_archetype_id"] for r in csv.DictReader(f)}
    for i, row in enumerate(rows, start=2):  # +1 header, +1 1-index
        oid = row.get("occupation_id", "")
        for field in REQUIRED:
            if not (row.get(field) or "").strip():
                errors.append(f"row {i} ({oid}): empty field '{field}'")
        if oid in seen_ids:
            errors.append(f"row {i}: duplicate occupation_id '{oid}'")
        seen_ids.add(oid)
        conf = row.get("confidence", "")
        if conf not in VALID_CONFIDENCE:
            errors.append(f"row {i} ({oid}): invalid confidence '{conf}'")
        if row.get("status") != "candidate":
            errors.append(f"row {i} ({oid}): status must be 'candidate' for a collector (not self-approved), got '{row.get('status')}'")
        if row.get("occupation_archetype_id") not in archetypes and not row.get("occupation_archetype_id", "").startswith("no_source:"):
            errors.append(f"row {i} ({oid}): unresolved occupation_archetype_id")
        src = row.get("source_refs", "")
        if not any(prefix in src for prefix in ("gb:sources/", "wk:", "book:")):
            errors.append(f"row {i} ({oid}): source_refs lacks a source reference")

    authoring = read_authoring()
    archive = read_archive()
    archive_ids = authoring["new_profession_ids"]
    semantic_ids = authoring["semantic_ids"]
    if semantic_ids != EXPECTED_SEMANTIC_IDS:
        errors.append("semantic occupation IDs differ from exact OA-8 mapping")
    if set(authoring.get("context_only_owner_profession_ids", [])) != EXPECTED_OWNER_POLICY:
        errors.append("context-only owner policy differs from exact OA-5/OA-7 set")
    expected_ids = set(semantic_ids.values())
    actual_ids = {row["occupation_id"] for row in rows}
    if set(archive_ids) != EXPECTED_OWNERS or len(archive_ids) != len(EXPECTED_OWNERS):
        errors.append("new profession owner set differs from exact reviewer merge result")
    if not expected_ids <= actual_ids:
        errors.append("generated occupation catalog is missing canonical archive professions")

    def normalized(value):
        value = unicodedata.normalize("NFKC", value).casefold()
        return "".join(char for char in value if char.isalnum())

    names = [row["occupation_title"] for row in pinned]
    names += [row["occupation_title_ru"] for row in rows]
    seen = set()
    for name in names:
        key = normalized(name)
        if key in seen:
            errors.append(f"normalized occupation title collision: {name}")
        seen.add(key)

    by_id = {row["occupation_id"]: row for row in rows}
    for profession_id in archive_ids:
        source = archive[profession_id]
        if source["historical_confidence"] == "B" and confidence_basis(source) != "logical_necessity":
            errors.append(f"{profession_id}: B-confidence owner basis must be logical_necessity")
        row = by_id.get(semantic_ids[profession_id])
        if row is None:
            continue
        ref = row_ref(profession_id)
        expected = {
            "basis:" + confidence_basis(source),
            "derivation:" + derivation_ref(profession_id),
            "archive_confidence:" + source["historical_confidence"],
            "archive_period:" + archive_period(source),
            "archive_region:" + source["region_scope"].replace(";", ","),
        }
        refs = set(row["source_refs"].split(";"))
        if ref not in refs or not expected <= refs:
            errors.append(f"{row['occupation_id']}: missing archive provenance tokens")
        if row["confidence"] != source["historical_confidence"]:
            errors.append(f"{row['occupation_id']}: confidence differs from archive")
        if row["period"] != archive_period(source):
            errors.append(f"{row['occupation_id']}: period differs from archive")
        if source["region_scope"] not in row["notes"]:
            errors.append(f"{row['occupation_id']}: archive region missing from notes")

    reviewer_variants = {v["profession_id"]: v for v in authoring["variants"] + authoring["deferred_variants"] if v.get("reviewer_rule")}
    actual_reviewer_targets = {pid: entry["target"] for pid, entry in reviewer_variants.items()}
    if actual_reviewer_targets != EXPECTED_REVIEWER_VARIANTS:
        errors.append("reviewer variant coverage/targets differ from exact review mapping")
    reviewer_rule_counts = {rule: sum(v.get("reviewer_rule") == rule for v in reviewer_variants.values())
                            for rule in ("duplicate", "specialization", "family")}
    if reviewer_rule_counts != {"duplicate": 12, "specialization": 20, "family": 8}:
        errors.append(f"reviewer merge classes differ from expected counts: {reviewer_rule_counts}")
    base_variants = {v["profession_id"]: v["target"] for v in authoring["variants"] if not v.get("reviewer_rule")}
    if base_variants != EXPECTED_BASE_VARIANTS:
        errors.append("pre-existing add_variant coverage or reviewer owner remaps changed unexpectedly")
    deferred = {v["profession_id"]: v["target"] for v in authoring["deferred_variants"]}
    if deferred != EXPECTED_DEFERRED or any(v.get("reason") != "pinned_target_variant_unavailable" for v in authoring["deferred_variants"]):
        errors.append("typed pinned-target deferred variant backlog differs from OA-9")
    if len(authoring["variants"]) != 43 or len({v["profession_id"] for v in authoring["variants"]}) != 43:
        errors.append("authoring must contain 43 executable variant mappings; deferred targets stay separate")
    if set(archive_ids) & ({v["profession_id"] for v in authoring["variants"]} | set(deferred)):
        errors.append("archive profession is assigned both as new owner and variant")

    # Positive family probes prove stem/family merges and archive provenance are retained once.
    for pid, target in EXPECTED_REVIEWER_VARIANTS.items():
        variant = reviewer_variants.get(pid)
        if not variant or variant["target"] != target:
            errors.append(f"semantic family mapping missing for {pid} -> {target}")
        source = archive.get(pid)
        if source is None:
            errors.append(f"reviewer mapping has unknown archive provenance: {pid}")
        elif not row_ref(pid).endswith("#" + pid) or not derivation_ref(pid).endswith("#" + pid):
            errors.append(f"reviewer mapping has malformed provenance reference: {pid}")
    family_probes = [
        ("PRO0448", "PRO0449", "occupation:occ_gusli_player"),
        ("PRO0448", "PRO0452", "occupation:occ_gusli_player"),
        ("PRO0407", "PRO0408", "occupation:occ_bath_keeper"),
        ("PRO0369", "PRO0370", "occupation:occ_literacy_teacher"),
        ("PRO0096", "PRO0097", "occupation:occ_dairy_worker"),
        ("PRO0096", "PRO0098", "occupation:occ_dairy_worker"),
        ("PRO0081", "PRO0082", "occupation:nov_occ_miller"),
        ("PRO0100", "PRO0085", "occupation:nov_occ_cook_baker"),
    ]
    for owner, member, target in family_probes:
        mapped = "occupation:" + semantic_ids[owner] if owner in semantic_ids else actual_reviewer_targets.get(owner)
        if mapped != target or actual_reviewer_targets.get(member) != target:
            errors.append(f"positive semantic/provenance family probe failed: {owner}/{member}")
    negative_probes = [
        ("PRO0454", "PRO0448"),  # singer remains separate from instrumentalists
        ("PRO0073", "PRO0074"),  # brickmaker remains separate from stonecutting/masonry
        ("PRO0209", "PRO0074"),  # well digging remains separate from masonry
        ("PRO0210", "PRO0074"),  # household stove making remains separate from masonry
    ]
    for left, right in negative_probes:
        left_target = "occupation:" + semantic_ids[left] if left in semantic_ids else actual_reviewer_targets.get(left)
        right_target = "occupation:" + semantic_ids[right] if right in semantic_ids else actual_reviewer_targets.get(right)
        if left_target == right_target:
            errors.append(f"negative semantic dedup probe merged distinct families: {left}/{right}")

    all_variants = authoring["variants"] + authoring["deferred_variants"]
    all_assigned = set(archive_ids) | {v["profession_id"] for v in all_variants}
    if len(all_assigned) != len(archive_ids) + len(all_variants):
        errors.append("archive provenance assigned more than once")
    if {pid for pid in all_assigned if confidence_basis(archive[pid]) == "sourced"} != EXPECTED_OA6_SOURCED:
        errors.append("OA-6 sourced basis must remain limited to its five approved archive rows")
    if {pid for pid in all_assigned if confidence_basis(archive[pid]) == "logical_necessity"
        and archive[pid]["historical_confidence"] == "A"} != EXPECTED_OA6_LOGICAL:
        errors.append("OA-6 A-confidence logical-necessity overrides differ from exact reviewer set")
    for pid in EXPECTED_OA6_LOGICAL:
        if confidence_basis(archive[pid]) != "logical_necessity":
            errors.append(f"{pid}: OA-6 requires logical_necessity despite archive A confidence")
    for pid in EXPECTED_OA6_SOURCED:
        if confidence_basis(archive[pid]) != "sourced":
            errors.append(f"{pid}: OA-6 requires sourced basis")

    for variant in authoring["variants"]:
        source = archive[variant["profession_id"]]
        basis = confidence_basis(source)
        if source["historical_confidence"] == "B" and basis != "logical_necessity":
            errors.append(f"{variant['profession_id']}: B-confidence variant basis must be logical_necessity")
        token = provenance_token(source)
        target_type, target_id = variant["target"].split(":", 1)
        if target_type == "occupation":
            target = by_id.get(target_id)
            if target is not None and token not in target["source_refs"].split(";"):
                errors.append(f"{variant['profession_id']}: variant provenance absent from {variant['target']}")
            if target is None and target_id not in {r["occupation_id"] for r in pinned}:
                errors.append(f"{variant['profession_id']}: owner occupation does not exist: {target_id}")
        elif target_type == "profile":
            profiles_path = Path(CSV_PATH).resolve().parents[1] / "npc_runtime_profiles" / "npc_runtime_profiles.json"
            profiles = json.loads(profiles_path.read_text(encoding="utf-8"))["profiles"]
            profile = next((p for p in profiles if p["profile_id"] == target_id), None)
            if profile is None or token not in profile["source_refs"]:
                errors.append(f"{variant['profession_id']}: variant provenance absent from {variant['target']}")
        else:
            errors.append(f"{variant['profession_id']}: unsupported variant target '{target_type}'")
    single_owner = [v["target"] for v in authoring["variants"] if v["profession_id"] == "PRO0204"]
    if single_owner != ["occupation:occ_mason"]:
        errors.append(f"PRO0204 must have exactly one reviewer-specified owner, occ_mason; got {single_owner}")
    for pid in ("PRO0110", "PRO0118"):
        if actual_reviewer_targets.get(pid) is not None:
            errors.append(f"{pid}: pre-existing fishing variant must remain a separate owner remap")
        if deferred.get(pid) != "occupation:nov_occ_fish_weir_keeper":
            errors.append(f"{pid}: expected fish-weir keeper mapping in typed deferred backlog")

    for variant in authoring["deferred_variants"]:
        source = archive[variant["profession_id"]]
        if source["historical_confidence"] == "B" and confidence_basis(source) != "logical_necessity":
            errors.append(f"{variant['profession_id']}: B-confidence deferred variant basis must be logical_necessity")

    for pid in EXPECTED_OWNER_POLICY & set(archive_ids):
        row = by_id.get(semantic_ids[pid])
        if not row or "context_only_not_mass_default" not in row["llm_adaptation_rules"]:
            errors.append(f"{pid}: high-risk owner lacks context-only adaptation guard")

    well_digger = by_id.get(semantic_ids["PRO0209"])
    if not well_digger:
        errors.append("PRO0209 regression probe: archive owner row missing")
    else:
        seasons = ("daily_schedule_winter", "daily_schedule_spring_rasputitsa",
                   "daily_schedule_summer", "daily_schedule_autumn")
        if any(well_digger[field] != "no_source:occupation_specific_seasonal_schedule" for field in seasons):
            errors.append("PRO0209 regression probe: generic seasonal pattern leaked into candidate row")
        if well_digger["daily_schedule_normal"] != "no_source:archive_normal_schedule_not_established":
            errors.append("PRO0209 regression probe: archive summer was promoted to normal runtime schedule")

    archive_rows = [by_id.get(semantic_ids[pid]) for pid in archive_ids]
    archive_rows = [row for row in archive_rows if row]
    for row in archive_rows:
        for field in ("allowed_social_role_ids", "typical_g3_place_types", "typical_g4_location_types",
                      "typical_status_range", "seasonality", "night_behavior", "mobility_pattern",
                      "daily_schedule_market_day", "daily_schedule_church_day", "daily_schedule_crisis"):
            if row.get(field) != "no_source" and not row.get(field, "").startswith("no_source:"):
                errors.append(f"{row['occupation_id']}: analog data unexpectedly copied into {field}")
        if row.get("runtime_basis_analog_ref") != "no_source:no_domain_occupation_analog":
            errors.append(f"{row['occupation_id']}: archive row inherits runtime analog")
        if "rule:runtime_basis_analog_ref#" in row.get("source_refs", ""):
            errors.append(f"{row['occupation_id']}: archive row cites domain runtime analog")
        if row.get("region_id") != "region_novgorod_land":
            errors.append(f"{row['occupation_id']}: archive region is not bound to region_novgorod_land")
        for field in ("daily_schedule_winter", "daily_schedule_spring_rasputitsa",
                      "daily_schedule_summer", "daily_schedule_autumn",
                      "how_to_materialize_as_background_npc", "how_to_materialize_as_scene_npc",
                      "how_to_materialize_as_key_npc", "common_relationships"):
            if not row[field].startswith("no_source:"):
                errors.append(f"{row['occupation_id']}: template text leaked into {field}")

    profiles_path = Path(CSV_PATH).resolve().parents[1] / "npc_runtime_profiles" / "npc_runtime_profiles.json"
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))["profiles"]
    profiles_by_id = {p["profile_id"]: p for p in profiles}
    skills_path = Path(CSV_PATH).resolve().parents[1] / "skills_competences" / "skills_competences.json"
    competences = json.loads(skills_path.read_text(encoding="utf-8"))["competences"]
    competences_by_occupation = {c["occupation_ref"]: c for c in competences}
    for pid in archive_ids:
        oid = semantic_ids[pid]
        profile = profiles_by_id.get("profile_" + oid)
        if not profile or profile["role_ref"] is not None or profile["allowed_role_refs"] or profile["regional_option_sets"]:
            errors.append(f"{pid}: NPC profile infers role/place from domain analog")
        elif any(not str(profile["routine"].get(season, "")).startswith("no_source:")
                 for season in ("winter", "spring", "summer", "autumn")):
            errors.append(f"{pid}: NPC profile inherits an occupation seasonal template")
        competence = competences_by_occupation.get(oid)
        if not competence or any(competence[k] for k in ("parent_skill_ids", "secondary_skill_ids", "gate_skill_ids", "forbidden_skill_ids")):
            errors.append(f"{pid}: competence copies domain archetype skills without occupation evidence")
    well_digger_profile = profiles_by_id.get("profile_" + semantic_ids["PRO0209"])
    if not well_digger_profile or any(
        not str(well_digger_profile["routine"].get(season, "")).startswith("no_source:")
        for season in ("winter", "spring", "summer", "autumn")
    ):
        errors.append("PRO0209 regression probe: NPC profile routine still contains a seasonal schedule")

    music_ids = [semantic_ids[pid] for pid in ("PRO0448", "PRO0454", "PRO0455")]
    if any("related_role:nov_role_skomorokh" not in by_id[oid]["source_refs"].split(";")
           for oid in music_ids):
        errors.append("OA-10 music occupations lack a typed relation to nov_role_skomorokh")
    if len(music_ids) != len(set(music_ids)):
        errors.append("OA-10 music role relation merged distinct occupation owners")
    policy_ids = set(authoring.get("context_only_variant_profession_ids", []))
    if policy_ids != EXPECTED_VARIANT_POLICY:
        errors.append("context-only variant policy IDs differ from exact OA-5 provenance set")
    for pid in policy_ids:
        variant = next((v for v in authoring["variants"] if v["profession_id"] == pid), None)
        deferred_variant = next((v for v in authoring["deferred_variants"] if v["profession_id"] == pid), None)
        if variant or deferred_variant:
            source = archive[pid]
            if "|policy=context_only_not_mass_default" not in provenance_token(source):
                errors.append(f"{pid}: context-only policy absent from variant provenance token")
    for pid in ("PRO0448", "PRO0454", "PRO0455"):
        if by_id[semantic_ids[pid]]["occupation_archetype_id"] != "no_source:occupation_archetype":
            errors.append(f"{pid}: music archetype gap was filled outside the closed vocabulary")
    expected_archetypes = {
        "PRO0069": "forest_hunting", "PRO0369": "religious_literate",
        "PRO0398": "religious_literate", "PRO0407": "hospitality_service",
        "PRO0465": "hospitality_service",
    }
    for pid, archetype in expected_archetypes.items():
        if by_id[semantic_ids[pid]]["occupation_archetype_id"] != archetype:
            errors.append(f"{pid}: reviewer archetype must be {archetype}")
    stove = by_id.get(semantic_ids["PRO0210"])
    if not stove or stove["occupation_id"] == "occ_mason" or "context_only_not_mass_default" not in stove["llm_adaptation_rules"]:
        errors.append("PRO0210 must remain separate semantic owner with context-only policy")

    print(f"checked {len(rows)} rows")
    if errors:
        print(f"FAIL: {len(errors)} problems")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("OK: 14 semantic owners, 43 active variants, 15 typed deferred variants; OA-1..10 probes")


if __name__ == "__main__":
    main()
