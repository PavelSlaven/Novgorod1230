#!/usr/bin/env python3
"""Build/check the non-runtime O1 candidate package from game-base candidate rows."""

import argparse
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().with_name("ordinary-materialization-o1-start-data-candidate.json")
BASE = ROOT / "data/world-catalogs/novgorod/game-base-v1"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def pin(path, status, use):
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source_status": status,
        "use": use,
    }


def build():
    presence_path = BASE / "places-binding/presence/presence_rules.csv"
    frequency_path = BASE / "items-household-personal/items/item_place_frequency.csv"
    ownership_path = BASE / "items-household-personal/items/ownership_rules.csv"
    tenure_path = BASE / "resource-catalog/tenure_defaults.csv"
    npc_wave = ROOT / "data/world-catalogs/novgorod/m2c-npc-wave/v1"
    npc_composition_path = npc_wave / "datasets/place_population_composition_rules.json"
    npc_relationship_path = npc_wave / "datasets/npc_relationship_materialization_rules.json"
    npc_binding_path = npc_wave / "datasets/spatial_node_place_family_bindings.json"
    npc_composition_all = json.loads(npc_composition_path.read_text(encoding="utf-8"))
    npc_relationship_all = json.loads(npc_relationship_path.read_text(encoding="utf-8"))
    npc_binding_all = json.loads(npc_binding_path.read_text(encoding="utf-8"))
    approved_npc_composition = [
        row for row in npc_composition_all
        if row["place_family_id"] in {"pf_outbuildings", "pf_peasant_homestead"}
    ]
    relevant_roles = {"nov_role_smerd_householder", "nov_role_household_mistress", "nov_occ_household_servant"}
    approved_npc_relationships = [
        row for row in npc_relationship_all
        if row.get("subject_role_ref") in relevant_roles and row.get("object_role_ref") in relevant_roles
    ]
    approved_start_bindings = [
        row for row in npc_binding_all
        if row["node_id"] in {
            "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage",
            "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster",
        }
    ]

    presence_all = read_csv(presence_path)
    frequency_all = read_csv(frequency_path)
    ownership_all = read_csv(ownership_path)
    tenure_all = read_csv(tenure_path)

    scopes = [
        {
            "place_family_ref": "pf_outbuildings@1",
            "g4_ref": "g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality@1",
            "canonical_g5_ref": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@1",
            "source_pf_id": "outbuildings",
        },
        {
            "place_family_ref": "pf_peasant_homestead@1",
            "g4_ref": "g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality@1",
            "canonical_g5_ref": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@1",
            "source_pf_id": "peasant_homestead",
        },
    ]
    rules = []
    source_frequency_ids = set()
    owner_rule_ids = set()
    category_ids = set()
    item_ids = set()
    for scope in scopes:
        pf = "pf_" + scope["source_pf_id"]
        rows = [
            row for row in presence_all
            if row["scope_kind"] == "place_family"
            and row["scope_ref"] == pf
            and row["subject_kind"] == "category"
            and row["subject_ref"].startswith("cat_item_object_")
        ]
        rows.sort(key=lambda row: row["pr_id"])
        for row in rows:
            variants = json.loads(row["variants"] or "[]")
            category_ids.add(row["subject_ref"])
            item_ids.add(row["item_ref"])
            for variant in variants:
                item_ids.add(variant["item_ref"])
                source_frequency_ids.add(variant["source_row_id"])
            if row["source_row_id"]:
                source_frequency_ids.add(row["source_row_id"])
            rules.append({
                "scope_ref": scope["place_family_ref"],
                "pr_id": row["pr_id"],
                "source_status": row["status"],
                "subject_kind": row["subject_kind"],
                "category_ref": row["subject_ref"],
                "item_ref": row["item_ref"],
                "variants": variants,
                "frequency_class": row["frequency_class"],
                "probability_ppm_candidate": row["probability_ppm"],
                "count_limit_candidate": row["count_limit"],
                "count_limit_basis": row["count_limit_basis"],
                "allowed_seasons": row["allowed_seasons"],
                "refresh_class": row["refresh_class"],
                "entry_visible_if": row["entry_visible_if"],
                "search_only_if": row["search_only_if"],
                "entry_exposed_weight_candidate": row["entry_exposed_weight"],
                "search_concealed_weight_candidate": row["search_concealed_weight"],
                "placement_basis_ref": row["placement_basis_ref"],
                "placement_owner_ref": row["placement_owner_ref"],
                "source_pool": row["source_pool"],
                "source_row_id": row["source_row_id"],
                "source_refs": row["source_refs"],
                "confidence": row["confidence"],
                "pool_confidence": row["pool_confidence"],
            })

    pool_pf_ids = {scope["source_pf_id"] for scope in scopes}
    frequency_rows = [
        row for row in frequency_all
        if row["pf_id"] in pool_pf_ids and row["item_group"].startswith(("HH_", "PS_"))
    ]
    pool_row_ids = {row["ipf_id"] for row in frequency_rows}
    frequency_rows.extend(
        row for row in frequency_all
        if row["ipf_id"] in source_frequency_ids and row["ipf_id"] not in pool_row_ids
    )
    for row in frequency_rows:
        if row["ref_kind"] == "it":
            item_ids.add(row["item_or_category_ref"])
        elif row["item_or_category_ref"].startswith("cat_"):
            category_ids.add(row["item_or_category_ref"])
        if row["category_id"]:
            category_ids.add(row["category_id"])
    for row in frequency_rows:
        if row["owner_rule_ref"]:
            owner_rule_ids.add(row["owner_rule_ref"])
    frequency_rows.sort(key=lambda row: row["ipf_id"])
    item_catalog_paths = [
        BASE / "items-household-personal/items/household.csv",
        BASE / "items-household-personal/items/personal.csv",
    ]
    catalog_rows = [row for path in item_catalog_paths for row in read_csv(path) if row["it_id"] in item_ids]
    for row in catalog_rows:
        category_ids.add(row["category_id"])
    category_rows = [
        row for row in read_csv(BASE / "items-household-personal/items/item_categories.csv")
        if row["category_id"] in category_ids
    ]
    ownership_rows = [row for row in ownership_all if row["own_id"] in owner_rule_ids]
    ownership_rows.sort(key=lambda row: row["own_id"])
    tenure_rows = [
        row for row in tenure_all
        if row["place_family_ref"] in {"pf_outbuildings", "pf_peasant_homestead"}
    ]
    tenure_rows.sort(key=lambda row: (row["place_family_ref"], row["family_id"]))

    source_files = [
        (presence_path, "candidate", "PF-scoped category/item rules; no approval implied"),
        (frequency_path, "candidate", "item-place frequency, count, and placement provenance"),
        (BASE / "items-household-personal/items/household.csv", "candidate", "referenced household item records"),
        (BASE / "items-household-personal/items/personal.csv", "candidate", "referenced personal item records"),
        (BASE / "items-household-personal/items/item_categories.csv", "candidate", "referenced category records"),
        (ownership_path, "candidate", "referenced PF × find-context × item-group ownership rules"),
        (tenure_path, "candidate", "PF × resource-family tenure defaults"),
        (ROOT / "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt", "active_norm", "property ownership, holder/controller, placement, visibility/access, and O1 boundary"),
        (ROOT / "data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md", "active_norm", "saved presence-roll semantics (§3A.1)"),
        (BASE / "households-psychology-speech/households_kinship/README.md", "candidate", "household/kinship scope and relation limits"),
        (npc_wave / "approval.json", "approve_with_limits", "approved NPC wave pin and scope limits"),
        (npc_composition_path, "approved_rows_low_confidence", "approved NPC composition rows for the exact start PFs"),
        (npc_relationship_path, "approved_rows_low_confidence", "approved householder/mistress/servant relationship rules"),
        (npc_binding_path, "approved_rows_low_confidence", "approved exact Vikhtuy starting G5 to PF bindings"),
        (ROOT / "data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/novgorod_vikhtuy_household_cluster_v1.start.json", "candidate", "start NPC-composition/placement policy; not an approved household-head binding"),
        (ROOT / "data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/data-approval.json", "APPROVE_DATA_ONLY_scoped", "mechanical repin scope; excludes role/occupation/player assertions"),
        (BASE / "places-binding/presence/README.md", "candidate", "presence approval and calibration status"),
        (BASE / "places-binding/presence/frequency_rule.json", "candidate", "editorial probability calibration"),
        (BASE / "items-household-personal/README.md", "candidate", "catalog status and authoring limitations"),
        (BASE / "resource-catalog/README.md", "candidate", "resource/tenure catalog status"),
    ]
    return {
        "schema": "rus.v17_channels.o1_start_data_candidate.v1",
        "candidate_id": "novgorod_v17_vikhtuy_start_o1_candidate",
        "status": "pending_independent_data_approval",
        "approved": False,
        "import_authorized": False,
        "activation_authorized": False,
        "target": {
            "world_revision_id": "novgorod_spatial_v3_target_contract_approval_001",
            "g4_ref": "g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality@1",
            "scope_limit": "Only the two canonical starting G5/PF pairs below; no later generated or visited places.",
        },
        "scope_selectors": scopes,
        "approval_requests": [
            "Approve or reject each PF-scoped category/item row and every listed variant; all source rows currently remain candidate.",
            "Approve or replace candidate probability_ppm, count_limit and frequency class; presence/frequency calibration is editorial and not approved.",
            "Approve placement weights only where placement_basis_ref cites source placement_modes; decide whether rows with no_source are excluded pending owner data or receive a separately sourced placement rule.",
            "Approve binding household owner/controller to the approved start-role actors (householder and, where applicable, the household servant dependent-patron link); exact committed household-instance identity and cross-G5 ownership bridge still need an explicit mapping.",
            "Approve any tenure-default use; the resource-catalog is candidate and PF × family tenure does not identify a concrete owner.",
        ],
        "presence_roll_contract": {
            "source_status": "active_norm",
            "source": "data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md §3A.1",
            "seed_fields": ["party_id", "scope_instance_ref", "subject_kind", "subject_ref", "rng_algorithm_id=mulberry32_v1"],
            "seasonal_seed_addition": "season-period number only for seasonal rules",
            "saved_resolution_key": ["party_id", "scope_instance_ref", "subject_kind", "subject_ref"],
            "saved_cause": "rule_id@rule_version; rule identity/version are not seed inputs",
            "storage": "existing ordinary-materialization aggregate presence_resolutions / closed_observation_scopes; persist first-arrival resolution and never reroll an already-resolved key",
            "profile_values": "This package defines no new roll, random value, probability, count, version, or storage schema. Candidate probability/count values below require approval before any import.",
        },
        "placement_contract": {
            "source_status": "active_norm",
            "source": "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt",
            "candidate_data_fields": ["entry_visible_if", "search_only_if", "entry_exposed_weight_candidate", "search_concealed_weight_candidate", "placement_basis_ref", "placement_owner_ref"],
            "meaning": "Expose/search modes and source-backed weights describe where an already-created item is placed/disclosed; they do not establish presence probability or item ownership.",
            "approval_rule": "Only rows with source-backed placement_basis_ref have candidate weights to review. Rows with no_source:placement_modes_absent remain a blocking candidate gap until sourced or explicitly excluded.",
        },
        "candidate_presence_rules": rules,
        "candidate_frequency_source_rows": frequency_rows,
        "candidate_item_records": catalog_rows,
        "candidate_category_records": category_rows,
        "candidate_ownership_rules": ownership_rows,
        "candidate_tenure_defaults": tenure_rows,
        "approved_start_npc_context": {
            "wave_decision": "approve_with_limits",
            "row_status": "approved",
            "confidence": "low",
            "place_family_bindings": approved_start_bindings,
            "composition_rows": approved_npc_composition,
            "relationship_rows": approved_npc_relationships,
            "binding_limits": [
                "pf_peasant_homestead has approved one householder role and one household_mistress role; the approved profile links those named actors as spouses.",
                "pf_outbuildings has an approved household_servant role; the approved dependent_patron rule allows a relation only between the named servant and named employer in a materialized household.",
                "These role/profile approvals do not create concrete NPC IDs or a household-instance ID in this data package.",
                "No approved field maps the household owner from household_cluster G5 to work_storage G5; Opus must approve the owner/controller bridge for the exact Vikhtuy start pair.",
            ],
        },
        "unresolved_ownership_chain": {
            "status": "blocking_candidate_gap",
            "known_candidate_rule": "Some item-group rules specify owner_kind=household, holder_kind=household_member, controller_kind=household_head. The approved start composition supplies role refs but no household-instance or NPC IDs.",
            "required": ["approval of mapping household owner/controller to the approved householder role actor", "approval of the bridge from household_cluster G5 head/household to work_storage G5 servant and items", "items-property owner approval for owner/holder/controller/placement/access", "approval of selected item groups and PFs"],
            "not_inferred": ["player basis household=familiar is not a household/NPC binding", "PF tenure=household is not a named owner", "co-location alone is not a kinship or ownership relation"],
        },
        "candidate_counts": {
            "pf_outbuildings": sum(1 for row in rules if row["scope_ref"] == "pf_outbuildings@1"),
            "pf_peasant_homestead": sum(1 for row in rules if row["scope_ref"] == "pf_peasant_homestead@1"),
            "candidate_household_personal_frequency_rows": {
                "outbuildings": sum(1 for row in frequency_rows if row["pf_id"] == "outbuildings"),
                "peasant_homestead": sum(1 for row in frequency_rows if row["pf_id"] == "peasant_homestead"),
            },
            "all_statuses_remain_candidate": True,
        },
        "source_pins": [pin(path, status, use) for path, status, use in source_files],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare source-derived candidate with saved JSON")
    args = parser.parse_args()
    expected = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        actual = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if actual != expected:
            raise SystemExit(f"STALE: {OUT.relative_to(ROOT)} differs from source-derived candidate")
        print(f"PASS: {OUT.relative_to(ROOT)} matches source rows")
    else:
        OUT.write_text(expected, encoding="utf-8")
        print(f"WROTE: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
