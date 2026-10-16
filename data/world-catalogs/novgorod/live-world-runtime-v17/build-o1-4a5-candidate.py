#!/usr/bin/env python3
"""Build the corrected, inactive O1 4a5 review candidates from pinned 4a4/4a3 data."""

import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
DATA = HERE.parent
POOL_4A4 = HERE / "ordinary-materialization-o1-4a4-candidate.json"
PLACEMENT_4A3 = HERE / "ordinary-materialization-o1-placement-authoring-4a3-candidate.json"
OWNERSHIP_4A3 = HERE / "ordinary-materialization-o1-ownership-authoring-4a3-candidate.json"
REGISTRY = DATA / "game-base-v1/places-binding/categories/category_registry.csv"
NODE_PARENTS = DATA / "spatial-v3/datasets/spatial_v3_node_parents.json"
OUT_POOL = HERE / "ordinary-materialization-o1-4a5-candidate.json"
OUT_PLACEMENT = HERE / "ordinary-materialization-o1-placement-authoring-4a5-candidate.json"
OUT_OWNERSHIP = HERE / "ordinary-materialization-o1-ownership-authoring-4a5-candidate.json"
OUT_PROJECTION = HERE / "ordinary-materialization-o1-projection-4a5-candidate.json"

G1 = "gn_nov_g1_xp017_yp026"
PF = "pf_peasant_homestead@1"
G5S = (
    "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@1",
    "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_occupation_terrace@1",
    "cg5v3__gn_nov_g4_xp017_yp026_r2_zaostrovye_settlement_center_habitation_terrace@1",
    "cg5v3__gn_nov_g4_xp017_yp026_r2_zaostrovye_settlement_center_household_zone@1",
)
CONTAINER_CATEGORIES = (
    "cat_container_form_bucket_v1",
    "cat_container_form_cask_v1",
    "cat_container_form_tub_v1",
    "cat_container_form_carrying_basket_v1",
    "cat_container_form_sack_v1",
    "cat_container_form_small_soft_bag_v1",
    "cat_container_form_birch_bark_box_v1",
    "cat_container_form_knife_sheath_v1",
)
NON_IMPORTABLE = {
    "cat_item_object_birch_bark_box_v1",
    "cat_item_object_bucket_v1",
    "cat_item_object_cask_v1",
    "cat_item_object_knife_sheath_v1",
    "cat_item_object_small_soft_bag_v1",
    "cat_item_object_washtub_v1",
}
TEMPLATED_CUE_ITEMS = {
    "it_ps_scribe_knife",
    "it_ps_bark_sheet_blank",
    "it_ps_bark_letter",
    "it_ps_wax_tablet",
    "it_ps_quill",
    "it_ps_parchment",
    "it_ps_codex",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest_json(value):
    encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_selectors(world_revision_id):
    rows = read_json(NODE_PARENTS)
    by_child = {}
    for row in rows:
        if row["world_revision_id"] != world_revision_id or row["child_id"] in by_child:
            raise ValueError("node-parent dataset has wrong revision or duplicate child")
        by_child[row["child_id"]] = row
    selectors = []
    for g5_ref in G5S:
        g5_id, g5_version = g5_ref.rsplit("@", 1)
        g5_row = by_child.get(g5_id)
        if g5_row is None or str(g5_row["child_version"]) != g5_version:
            raise ValueError(f"canonical G5 selector not pinned in node-parent data: {g5_ref}")
        g4_id = g5_row["parent_id"]
        g4_version = str(g5_row["parent_version"])
        chain = []
        cursor = g5_id
        seen = set()
        while cursor in by_child:
            if cursor in seen:
                raise ValueError(f"cycle in node-parent data at {cursor}")
            seen.add(cursor)
            row = by_child[cursor]
            chain.append(cursor)
            cursor = row["parent_id"]
        if G1 not in chain:
            raise ValueError(f"canonical G5 is outside the approved G1 scope: {g5_ref} -> {cursor}")
        if g4_id not in chain or not g4_id.startswith("g4v3__"):
            raise ValueError(f"canonical G5 parent is not a G4 node: {g5_ref}")
        selectors.append({
        "scope_kind": "canonical_place_family",
        "g1_ref": G1,
        "g4_ref": f"{g4_id}@{g4_version}",
        "canonical_g5_ref": g5_ref,
        "place_family_ref": PF,
        "source_pf_id": "peasant_homestead",
        })
    return selectors


def add_container_categories(category_records, pool_rules):
    with REGISTRY.open(encoding="utf-8", newline="") as stream:
        registry = {row["category_id"]: row for row in csv.DictReader(stream)}
    if not set(CONTAINER_CATEGORIES).issubset(registry):
        raise ValueError("required container_form categories missing from registry")
    rows = [row for row in category_records if row["category_id"] not in NON_IMPORTABLE]
    importable_by_id = {row["category_id"]: row for row in rows}
    for category_id in CONTAINER_CATEGORIES:
        source = registry[category_id]
        if source["facet"] != "container_form" or source["status"] != "draft":
            raise ValueError(f"unexpected registry category: {category_id}")
        row = copy.deepcopy(source)
        if category_id in importable_by_id:
            if importable_by_id[category_id] != row:
                raise ValueError(f"container category collision: {category_id}")
        else:
            rows.append(row)
            importable_by_id[category_id] = row
    for row in rows:
        if row["category_id"] in NON_IMPORTABLE:
            row["importable"] = False
    rows.sort(key=lambda row: row["category_id"])
    if NON_IMPORTABLE & {row["category_id"] for row in rows}:
        raise ValueError("legacy duplicate object category remains in candidate import set")
    return rows


def clean_templated_cues(item_records):
    """Remove copied writing-material cues while preserving item-specific facts."""
    found = set()
    changes = []
    for item in item_records:
        item_id = item["it_id"]
        cue = item.get("perceptual_cues", "")
        has_template = "тёмные чернила, свинец" in cue or "следы печати, истёртый воск" in cue
        if has_template:
            found.add(item_id)
            if item_id not in TEMPLATED_CUE_ITEMS:
                raise ValueError(f"unexpected templated cue outside audited set: {item_id}")
            before = cue
            if "тёмные чернила, свинец" in cue:
                if item_id in {"it_ps_bark_sheet_blank", "it_ps_bark_letter"}:
                    cue = cue.replace(", тёмные чернила, свинец", "")
                else:
                    cue = cue.replace("цвет: натуральная береста, тёмные чернила, свинец | ", "")
            cue = cue.replace(", следы печати, истёртый воск", "")
            item["perceptual_cues"] = cue
            changes.append({"it_id": item_id, "before": before, "after": cue})
    if found != TEMPLATED_CUE_ITEMS:
        raise ValueError(f"templated cue source set changed: {sorted(found)}")
    for item in item_records:
        cue = item.get("perceptual_cues", "").lower()
        if item["it_id"] in TEMPLATED_CUE_ITEMS and any(
                token in cue for token in ("тёмные чернила", "свинец", "следы печати", "истёртый воск")):
            raise ValueError(f"unsupported template cue remains: {item['it_id']}")
    return changes


def audit_cue_terms(item_records):
    keyword_items = {
        item["it_id"]: item.get("perceptual_cues", "")
        for item in item_records
        if any(token in item.get("perceptual_cues", "").lower()
               for token in ("чернил", "свинец", "печат", "воск"))
    }
    # The wax tablet's remaining wax mention is its source-backed construction, not a wear template.
    if set(keyword_items) != {"it_ps_wax_tablet"}:
        raise ValueError(f"unreviewed cue keywords remain in candidate item records: {sorted(keyword_items)}")
    if "углубление заполнено воском" not in keyword_items["it_ps_wax_tablet"]:
        raise ValueError("wax tablet lost its source-backed wax construction cue")
    if any(token in keyword_items["it_ps_wax_tablet"] for token in ("печати", "истёртый воск")):
        raise ValueError("unsupported wax tablet seal/wear cue remains")
    return keyword_items


def make_ownership_candidate():
    ownership = read_json(OWNERSHIP_4A3)
    ownership["schema"] = "rus.v17_channels.o1_ownership_authoring_candidate.v2"
    ownership["candidate_id"] = "novgorod_v17_lower_dvina_o1_ownership_4a5_candidate"
    ownership["status"] = "pending_opus_reapproval"
    ownership["approved"] = False
    ownership["import_authorized"] = False
    ownership["activation_authorized"] = False
    ownership["source_status_note"] = (
        "All 34 source ownership rules and 3 tenure defaults retain candidate source status. "
        "F16/F28 tenure rows are resource-family provenance only and do not participate in O1 item-owner resolution."
    )
    r1 = ownership["r1_same_pf_household_head_mapping"]
    r1["status"] = "candidate_pending_opus"
    r1["applies_to"] = (
        "Only an item rule with owner_kind=household and controller_kind=household_head "
        "at a materialized pf_peasant_homestead instance."
    )
    r1["owner_ref"] = (
        "actor_slot_ref selected inside the same G5 using the population composition ref, "
        "group pf_peasant_homestead.householder, and role nov_role_smerd_householder; never resolve by role alone."
    )
    r1["controller_ref"] = "same unique persisted actor_slot_ref as owner_ref"
    r1["holder_ref"] = None
    r1.pop("missing_or_ambiguous_slot", None)
    r1["eligibility_without_householder_group"] = {
        "condition": "population composition has no pf_peasant_homestead.householder group",
        "result": "o1_not_eligible",
        "typed_gap": "o1_householder_composition_absent",
        "effect": "no O1 roll, no O1 persistence; record typed trace gap and continue the people proposal normally",
    }
    r1["integrity_failure_required_householder_slot"] = {
        "condition": "householder group exists but matching persisted actor_slot_ref count is 0 or greater than 1",
        "result": "reject_first_entry_proposal_before_P16",
        "typed_gap": "o1_household_head_slot_unresolved",
        "effect": "no people/NPC/O1 aggregate commit, no persisted presence, closed scope, or resolution",
    }
    r1["holder_kind_semantics"] = (
        "holder_kind=household_member describes possible future access/holding policy only; "
        "at placement holder_ref is always null and no member access is inferred."
    )
    r1["scope_limit"] = (
        "No durable household entity/ID; no role ID as owner_ref; tenure defaults F16/F28 are resource-family data only."
    )
    spouse = ownership["spouse_access"]
    spouse["status"] = "not_approved_now"
    spouse["candidate_rule"] = None
    spouse["decision"] = "No spouse access rule or rights are approved or inferred for O1 4a5."
    spouse["gap"] = "Access requires a separate owner approval aligned with NPC relationship runtime support."
    r2 = ownership["r2_work_storage_bridge"]
    r2["status"] = "owner_bridge_ambiguous"
    r2["first_o1_scope_consequence"] = (
        "At current Vikhtuy cardinality two, work_storage remains ineligible with owner_bridge_ambiguous; "
        "no bridge or O1 item creation is approved."
    )
    ownership["source_pins"].append({
        "path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-ownership-authoring-4a3-candidate.json",
        "sha256": sha256(OWNERSHIP_4A3),
        "source_status": "candidate_authoring_source",
        "use": "source rows retained; R1/spouse/R2 semantics narrowed for 4a5 per reviewer",
    })
    ownership["approval_requests"] = [
        "Approve or reject the 34 source ownership rules without changing their source status; tenure rows are provenance only and do not govern O1 ownership.",
        "Approve R1 only for household-owned/head-controlled items in pf_peasant_homestead, resolved by unique same-G5 composition/group/role actor slot.",
        "Approve non-eligibility with a typed gap when the composition has no householder group; reject the whole first-entry proposal before P16 if the required group has zero or multiple slots.",
        "Confirm null holder_ref at placement; holder_kind=household_member is future policy only. Spouse access is not approved.",
        "Keep the work_storage bridge owner_bridge_ambiguous at Vikhtuy cardinality two; no bridge approval is requested for this scope.",
    ]
    return ownership


def validate_ownership_candidate(ownership):
    r1 = ownership["r1_same_pf_household_head_mapping"]
    if "tenure" in r1["applies_to"].lower() or "tenure" in r1["owner_ref"].lower() or "tenure" in r1["controller_ref"].lower():
        raise ValueError("R1 applicability/resolver must not depend on tenure")
    if r1["holder_ref"] is not None or "holder_kind=household_member" not in r1["holder_kind_semantics"]:
        raise ValueError("placed O1 holder must remain null; household_member is future policy only")
    absent = r1.get("eligibility_without_householder_group", {})
    if (absent.get("result") != "o1_not_eligible" or not absent.get("typed_gap")
            or "no O1 roll" not in absent.get("effect", "")):
        raise ValueError("missing householder group must be a no-roll typed gap")
    integrity = r1.get("integrity_failure_required_householder_slot", {})
    if (integrity.get("result") != "reject_first_entry_proposal_before_P16"
            or integrity.get("typed_gap") != "o1_household_head_slot_unresolved"
            or "no people/NPC/O1 aggregate commit" not in integrity.get("effect", "")):
        raise ValueError("required but unresolved householder slot must reject before P16")
    if "resource-family provenance only" not in ownership["source_status_note"]:
        raise ValueError("tenure source rows must be explicitly marked as unrelated provenance")
    if ownership["spouse_access"].get("status") != "not_approved_now":
        raise ValueError("spouse access must remain unapproved")
    bridge = ownership["r2_work_storage_bridge"]
    if bridge.get("status") != "owner_bridge_ambiguous" or bridge.get("current_vikhtuy_cardinality", {}).get("count") != 2:
        raise ValueError("work_storage bridge must remain ambiguous at Vikhtuy cardinality two")
    if ownership["approved"] or ownership["import_authorized"] or ownership["activation_authorized"]:
        raise ValueError("ownership authoring candidate must remain inactive")


def make_candidate_projection(pool):
    projection = {
        "candidate_id": "novgorod_v17_lower_dvina_o1_projection_4a5_candidate",
        "status": "candidate_only",
        "approved": False,
        "import_authorized": False,
        "activation_authorized": False,
        "runtime_input": False,
        "target": {
            "world_revision_id": pool["target"]["world_revision_id"],
            "g1_ref": pool["target"]["g1_ref"],
            "g4_refs": copy.deepcopy(pool["target"]["g4_refs"]),
            "scope_limit": pool["target"]["scope_limit"],
            "activation_validation": pool["target"]["activation_validation"],
        },
        "selectors": copy.deepcopy(pool["scope_selectors"]),
        "rules": copy.deepcopy(pool["candidate_presence_rules"]),
        "source_pin": {
            "path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-4a5-candidate.json",
            "sha256": digest_json(pool),
            "source_status": "pending_opus_reapproval",
            "use": "candidate target/G1/G4 scope selectors and presence rules only",
        },
        "projection_limits": [
            "Not a runtime profile or schema; no loader may consume this artifact.",
            "Contains no item/category catalog, placement or ownership rules, policy refs, model qualification, or activation authority.",
        ],
    }
    if len(projection["selectors"]) != 4 or len(projection["rules"]) != 75:
        raise ValueError("candidate-only O1 projection scope or rule count changed")
    if projection["approved"] or projection["import_authorized"] or projection["activation_authorized"] or projection["runtime_input"]:
        raise ValueError("candidate O1 projection must not be runtime input or authorized")
    return projection


def generate():
    pool = read_json(POOL_4A4)
    source_placement = read_json(PLACEMENT_4A3)
    pool_out = copy.deepcopy(pool)
    placement_out = read_json(HERE / "ordinary-materialization-o1-placement-authoring-4a4-candidate.json")
    # Keep pins repository-relative and explicit so this data candidate is reproducible.
    pool_out["candidate_id"] = "novgorod_v17_lower_dvina_o1_homestead_4a5_candidate"
    pool_out["schema"] = "rus.v17_channels.o1_homestead_candidate.v3"
    pool_out["status"] = "pending_opus_reapproval"
    pool_out["approved"] = False
    pool_out["import_authorized"] = False
    pool_out["activation_authorized"] = False
    selectors = make_selectors(pool["target"]["world_revision_id"])
    pool_out["scope_selectors"] = selectors
    pool_out["target"] = {
        "world_revision_id": pool["target"]["world_revision_id"],
        "g1_ref": G1,
        "g4_refs": sorted({selector["g4_ref"] for selector in selectors}),
        "regional_scope_label": "Нижняя Двина: Вихтуй и Заостровье",
        "region_id": None,
        "scope_limit": "Только четыре перечисленных canonical G5 с pf_peasant_homestead; любой homestead PF binding вне G1 запрещает импорт/активацию.",
        "activation_validation": "Reject if any applicable peasant_homestead binding resolves outside g1_ref or outside the four canonical_g5_ref selectors.",
    }
    pool_out["candidate_item_records"] = copy.deepcopy(pool["candidate_item_records"])
    cleaned_cue_changes = clean_templated_cues(pool_out["candidate_item_records"])
    if "it_ps_bark_sheet_blank" not in {row["it_id"] for row in pool_out["candidate_item_records"]}:
        raise ValueError("candidate item missing: it_ps_bark_sheet_blank")
    pool_out["candidate_category_records"] = add_container_categories(
        copy.deepcopy(pool["candidate_category_records"]), pool_out["candidate_presence_rules"])
    pool_out["excluded_category_records_4a5"] = sorted(NON_IMPORTABLE)
    pool_out["approval_requests"] = [
        "4a5: переутвердить только изменения из REVIEW-v17-channels-10; веса 53 правил сверены с 4a3 и три size-derived правила остаются open-only.",
        "Утверждение ограничено четырьмя canonical G5 в G1 низовьев Двины; импорт обязан fail-closed вне этой G1 и вне перечисленных G5.",
        "Нет состава с группой householder — O1 не eligible; наличие группы с отсутствующим/неоднозначным слотом — нарушение целостности в runtime.",
        "Кандидат, импорт и активация остаются выключены до отдельной аттестации и approved projection.",
    ]
    pool_out["candidate_counts_4a5"] = {
        "homestead_presence_rules": len(pool_out["candidate_presence_rules"]),
        "canonical_g5_selectors": len(G5S),
        "container_form_categories_added": len(CONTAINER_CATEGORIES),
        "legacy_object_categories_non_importable": len(NON_IMPORTABLE),
        "approved": False,
        "import_authorized": False,
        "activation_authorized": False,
    }
    pool_out.setdefault("source_pins_4a5", []).extend([
        {"path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-4a4-candidate.json",
         "sha256": sha256(POOL_4A4), "source_status": "candidate", "use": "corrected into new 4a5 candidate; no approval implied"},
        {"path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-placement-authoring-4a3-candidate.json",
         "sha256": sha256(PLACEMENT_4A3), "source_status": "candidate_editorial_approved_by_B", "use": "authoritative placement mode/weight source for O1C-01"},
        {"path": "data/world-catalogs/novgorod/game-base-v1/places-binding/categories/category_registry.csv",
         "sha256": sha256(REGISTRY), "source_status": "draft", "use": "existing container_form category rows"},
        {"path": "data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_node_parents.json",
         "sha256": sha256(NODE_PARENTS), "source_status": "target_world_base", "use": "canonical G5→G4→G1 selector derivation and validation"},
    ])

    placement_rules = placement_out["candidate_rules"]
    source_by_pr = {row["presence_pr_id"]: row for row in source_placement["candidate_rules"]}
    item_by_id = {row["it_id"]: row for row in pool_out["candidate_item_records"]}
    open_source_prs = set()
    open_derived = set()
    open_item_refs = set()
    if len(placement_rules) != 56:
        raise ValueError(f"expected 56 placement rules, got {len(placement_rules)}")
    for rule in placement_rules:
        source_ids = rule.get("source_presence_pr_ids", [rule["presence_pr_id"]])
        refs = rule["allowed_item_refs"]
        try:
            size_bands = {item_by_id[item]["size_band"] for item in refs}
        except KeyError as error:
            raise ValueError(f"placement item missing from catalog: {error.args[0]}") from error
        derived_open_only = bool(refs) and size_bands.issubset({"large", "bulky"})
        if derived_open_only:
            open_source_prs.update(source_ids)
            open_derived.add(rule["presence_pr_id"])
            open_item_refs.update(refs)
            rule["entry_visible_if"] = "placed_exposed"
            rule["search_only_if"] = None
            rule["entry_exposed_weight_candidate"] = 1
            rule["search_concealed_weight_candidate"] = 0
            rule["placement_basis_ref"] = [
                ref for ref in rule["placement_basis_ref"]
                if "NULL/NULL" not in ref
            ] + ["logical_necessity: every allowed item has catalog size_band large/bulky; items_and_property.txt §12"]
        else:
            source = source_by_pr.get(rule["presence_pr_id"])
            if source is None:
                raise ValueError(f"4a3 placement source missing: {rule['presence_pr_id']}")
            for key in ("entry_visible_if", "search_only_if",
                        "entry_exposed_weight_candidate", "search_concealed_weight_candidate"):
                rule[key] = copy.deepcopy(source[key])
            if (rule["entry_visible_if"], rule["search_only_if"],
                rule["entry_exposed_weight_candidate"], rule["search_concealed_weight_candidate"]) != (
                    "placed_exposed", "placed_concealed", 1, 1):
                raise ValueError(f"unexpected 4a3 approved 1:1 rule: {rule['presence_pr_id']}")
    expected_open_items = {
        "it_hh_hand_quern", "it_hh_trough", "it_hh_tub", "it_hh_washtub",
    }
    if (len(open_source_prs) != 4 or len(open_derived) != 3
            or open_item_refs != expected_open_items):
        raise ValueError(f"size-derived open-only mismatch: source={len(open_source_prs)} derived={len(open_derived)}")
    if {r["presence_pr_id"] for r in placement_rules if r["search_only_if"] is None} != open_derived:
        raise ValueError("open-only rules do not equal catalog size-derived set")
    placement_out["candidate_id"] = "novgorod_v17_lower_dvina_o1_placement_4a5_candidate"
    placement_out["status"] = "pending_opus_reapproval"
    placement_out["approved"] = False
    placement_out["import_authorized"] = False
    placement_out["activation_authorized"] = False
    placement_out["scope"] = "Только четыре canonical G5 в G1 низовьев Двины; проверки G1/G5 fail-closed обязательны при импорте и активации."
    placement_out["counts"] = {
        "candidate_placement_rules": len(placement_rules),
        "approved_4a3_modes_and_weights_copied": 53,
        "size_derived_open_only_rules": len(open_derived),
        "open_only_source_rows": len(open_source_prs),
        "source_no_source_markers": placement_out["source_gap_marker_register"]["source_row_count"],
    }
    placement_out["approval_request"] = (
        "4a5: сверить 53 правила с 4a3 (режимы и веса 1:1); три open-only derived rules выводятся только из size_band large/bulky. No import/activation."
    )
    placement_out["source_precedence"] = (
        "For these 56 no-source placement rows, modes and weights come from 4a3 by presence_pr_id; "
        "duplicate mode fields in the 4a4 presence pool are informational only. "
        "Only the three large/bulky derived rules override 4a3 to exposed-only 1/0."
    )
    placement_out["source_pins_4a5"] = [
        {"path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-4a4-candidate.json",
         "sha256": sha256(POOL_4A4), "source_status": "candidate", "use": "presence and item input for 4a5 placement"},
        {"path": "data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-placement-authoring-4a3-candidate.json",
         "sha256": sha256(PLACEMENT_4A3), "source_status": "candidate_editorial_approved_by_B", "use": "modes and weights for 53 non-open-only rules"},
        {"path": "data/world-catalogs/novgorod/game-base-v1/places-binding/categories/category_registry.csv",
         "sha256": sha256(REGISTRY), "source_status": "draft", "use": "container_form category references"},
        {"path": "data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_node_parents.json",
         "sha256": sha256(NODE_PARENTS), "source_status": "target_world_base", "use": "canonical G5→G4→G1 selector derivation and validation"},
    ]
    # Pin paths stay relative to the repository root, not host-specific fleet directories.
    for pin in pool_out["source_pins_4a5"]:
        if Path(pin["path"]).is_absolute() or "/fleet/" in pin["path"]:
            raise ValueError("host-specific source pin is forbidden")
    for rule in pool_out["candidate_presence_rules"]:
        if rule["category_ref"] not in {r["category_id"] for r in pool_out["candidate_category_records"]}:
            raise ValueError(f"unresolved candidate category: {rule['category_ref']}")
    if NON_IMPORTABLE & {row["category_id"] for row in pool_out["candidate_category_records"]}:
        raise ValueError("legacy duplicate object category remains importable")
    ownership_out = make_ownership_candidate()
    validate_ownership_candidate(ownership_out)
    ownership_out["cue_cleanup_4a5"] = {
        "changes": cleaned_cue_changes,
        "remaining_keyword_cues": audit_cue_terms(pool_out["candidate_item_records"]),
        "source_basis": "identical copied master-archive color/wear fragments lacked item-specific support; item-specific device and description facts remain",
    }
    projection_out = make_candidate_projection(pool_out)
    return pool_out, placement_out, ownership_out, projection_out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify candidate JSON outputs without writing")
    args = parser.parse_args()
    pool, placement, ownership, projection = generate()
    expected = ((OUT_POOL, pool), (OUT_PLACEMENT, placement),
                (OUT_OWNERSHIP, ownership), (OUT_PROJECTION, projection))
    if args.check:
        for path, value in expected:
            encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
            if not path.exists() or path.read_text(encoding="utf-8") != encoded:
                raise SystemExit(f"STALE: {path}")
        print(json.dumps({"pass": True, "presence_rules": len(pool["candidate_presence_rules"]),
                          "placement_rules": len(placement["candidate_rules"]),
                          "copied_1_to_1_rules": 53, "open_only_derived_rules": 3,
                          "templated_cue_items_cleaned": len(ownership["cue_cleanup_4a5"]["changes"]),
                          "ownership_candidate": True,
                          "candidate_projection_rules": len(projection["rules"]),
                          "candidate_projection_runtime_input": projection["runtime_input"],
                          "canonical_g5": len(G5S), "approved": False,
                          "import_authorized": False, "activation_authorized": False}))
        return
    for path, value in expected:
        dump(path, value)
    print(json.dumps({"written": [str(path) for path, _ in expected],
                      "status": "pending_opus_reapproval", "approved": False,
                      "import_authorized": False, "activation_authorized": False}))


if __name__ == "__main__":
    main()
