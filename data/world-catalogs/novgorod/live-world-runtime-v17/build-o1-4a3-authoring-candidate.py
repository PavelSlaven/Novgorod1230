#!/usr/bin/env python3
"""Build/check placement and ownership authoring candidates for O1 step 4a3."""

import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
INPUT = HERE / "ordinary-materialization-o1-start-data-candidate.json"
PLACEMENT_OUT = HERE / "ordinary-materialization-o1-placement-authoring-4a3-candidate.json"
OWNERSHIP_OUT = HERE / "ordinary-materialization-o1-ownership-authoring-4a3-candidate.json"
REPORT_OUT = Path("/srv/novgorod-work/fleet/tasks/v17-channels/out/v17-channels-o1-data-4a3.md")
BASE = ROOT / "data/world-catalogs/novgorod/game-base-v1"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path, status, use):
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": sha(path),
            "source_status": status, "use": use}


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def build():
    source = json.loads(INPUT.read_text(encoding="utf-8"))
    missing = [row for row in source["candidate_presence_rules"]
               if row["placement_basis_ref"].startswith("no_source:")]
    missing.sort(key=lambda row: (row["scope_ref"], row["category_ref"], row["pr_id"]))
    assert len(missing) == 77
    assert len({(row["scope_ref"], row["category_ref"]) for row in missing}) == 77
    assert sum(row["scope_ref"] == "pf_peasant_homestead@1" for row in missing) == 61
    assert sum(row["scope_ref"] == "pf_outbuildings@1" for row in missing) == 16

    item_map = {row["it_id"]: row for row in source["candidate_item_records"]}
    placement_rules = []
    for row in missing:
        item_refs = [row["item_ref"]] + [v["item_ref"] for v in row["variants"]]
        placement_rules.append({
            "rule_id": f"placement_{row['pr_id']}",
            "scope_ref": row["scope_ref"],
            "category_ref": row["category_ref"],
            "presence_pr_id": row["pr_id"],
            "allowed_item_refs": item_refs,
            "variant_source_rows": [v["source_row_id"] for v in row["variants"]],
            "entry_visible_if": row["entry_visible_if"],
            "search_only_if": row["search_only_if"],
            "entry_exposed_weight_candidate": 1,
            "search_concealed_weight_candidate": 1,
            "weight_status": "candidate_editorial_calibration_pending_opus",
            "placement_basis_ref": [
                "data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md §8.1 (NULL/NULL => editorial 1/1 default)",
                "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt §1, §12 (placement/disclosure semantics; no item probability)",
            ],
            "item_nature_evidence": [
                {key: item_map[ref].get(key, "") for key in
                 ("it_id", "category_id", "subcategory", "material", "technique", "size_band", "functions", "item_group")}
                for ref in item_refs
            ],
            "nature_evidence_limit": "Catalog properties can organize allowed items; they do not establish placement likelihood or weights.",
            "candidate_status": "candidate",
            "editorial_note": "Neutral explicit 1:1 candidate matching §8.1 default; not historical evidence. Opus may approve, replace, or reject. Existing ppm/count/frequency values are unchanged.",
            "source_refs": [row["source_pool"], row["source_row_id"], row["source_refs"]],
        })

    placement_pins = [
        pin(INPUT, "candidate", "exact 77 no-source O1 presence rules and permitted item/variant scope"),
        pin(BASE / "items-household-personal/items/household.csv", "candidate", "nature descriptors for household items"),
        pin(BASE / "items-household-personal/items/personal.csv", "candidate", "nature descriptors for personal items"),
        pin(ROOT / "data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md", "active_norm", "§8.1 placement weight default"),
        pin(ROOT / "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt", "active_norm", "§1 and §12 ownership/placement/disclosure boundaries"),
    ]
    placement = {
        "schema": "rus.v17_channels.o1_placement_authoring_candidate.v1",
        "candidate_id": "novgorod_v17_vikhtuy_o1_placement_4a3_candidate",
        "status": "pending_independent_data_approval",
        "approved": False,
        "import_authorized": False,
        "activation_authorized": False,
        "scope": "Only the 77 O1 no-source placement rows already in the two start PF pools; no other items or generated places.",
        "authoring_policy": "One category rule per exact scope/category. allowed_item_refs is limited to the matching 4a2 presence row item_ref plus its PF frequency-backed variants; category used_by never expands the pool.",
        "weight_policy": "Explicit candidate 1:1 is the editorial default required when both weights are NULL by world_base_materialization_table_requirements.md §8.1. It is not an empirical claim. Keep disclosure modes unchanged.",
        "counts": {"rules": len(placement_rules), "pf_peasant_homestead": 61, "pf_outbuildings": 16,
                   "variant_bearing_rules": sum(bool(r["variant_source_rows"]) for r in placement_rules),
                   "mapped_presence_pr_ids": [r["presence_pr_id"] for r in placement_rules]},
        "candidate_rules": placement_rules,
        "source_pins": placement_pins,
        "approval_request": "Approve/reject the neutral weights and exact item/variant sets; no probability/count/frequency recalibration requested.",
    }

    ownership_rows = sorted(source["candidate_ownership_rules"], key=lambda row: row["own_id"])
    tenure_rows = sorted(source["candidate_tenure_defaults"], key=lambda row: (row["place_family_ref"], row["family_id"]))
    ownership = {
        "schema": "rus.v17_channels.o1_ownership_authoring_candidate.v1",
        "candidate_id": "novgorod_v17_vikhtuy_o1_ownership_4a3_candidate",
        "status": "pending_independent_data_approval",
        "approved": False,
        "import_authorized": False,
        "activation_authorized": False,
        "source_rule_rows": ownership_rows,
        "source_tenure_rows": tenure_rows,
        "source_status_note": "All 34 ownership rules and 3 tenure defaults are candidate source data; no status is promoted.",
        "r1_same_pf_household_head_mapping": {
            "status": "candidate_pending_opus",
            "applies_to": "tenure=household together with item owner_kind=household and controller_kind=household_head, at a materialized pf_peasant_homestead instance",
            "owner_ref": "actor_slot_ref dynamically resolved for the unique nov_role_smerd_householder slot in that same PF instance",
            "controller_ref": "same actor_slot_ref as owner_ref",
            "holder_ref": None,
            "missing_or_ambiguous_slot": {"typed_gap": "o1_household_head_slot_unresolved", "effect": "do not create the item"},
            "runtime_seam_evidence": [
                "packages/materialization/src/generated-npc-bindings.js#buildNpcInput sets owner_ref/controller_ref to generated actorSlot",
                "packages/materialization/src/approved-procedural-npc.js sets refs to binding.actor_slot_ref",
            ],
            "scope_limit": "No durable household entity/ID; no use of role ID as owner_ref; a PF tenure default alone is not an owner.",
        },
        "spouse_access": {
            "status": "candidate_requires_opus_and_runtime_support",
            "candidate_rule": "Access may be granted to the spouse slot only through the approved, exact householder↔mistress spouse relation; relation does not change ownership/controller.",
            "source_status": "NPC composition/relationship rows are approved low confidence inside an approve_with_limits wave; embedded csv_status remains candidate.",
            "runtime_limit": "Approved procedural NPC output currently emits relationships: []; this relation is not yet confirmed at runtime, and items_and_property keeps access/property separate.",
            "gap": "Confirm explicit access/permission semantics and relationship availability before 4b; do not infer general access from kinship alone.",
        },
        "r2_work_storage_bridge": {
            "status": "candidate_with_current_typed_gap",
            "candidate_rule": "Map work_storage G5 to the head of a peasant_homestead only within the same G4 when exactly one primary pf_peasant_homestead G5 is bound there.",
            "zero_or_multiple_homesteads": {"typed_gap": "owner_bridge_ambiguous", "effect": "no owner/controller assignment and no O1 item creation for work_storage"},
            "general_context_basis": [
                {"source": "game-base-v1/places-binding/places/place_families.csv#pf_peasant_homestead", "status": "candidate", "supports": "rural domestic plot connects dwelling/work/animal space; related outbuildings"},
                {"source": "game-base-v1/places-binding/places/place_families.csv#pf_outbuildings", "status": "candidate", "supports": "working outbuildings around household or town yard"},
                {"source": "game-base-v1/buildings-interiors-containers/interiors/scenes.csv#SCN008", "status": "candidate", "supports": "rural peasant-yard scene applies homestead/outbuildings and describes functionally connected domestic/storage/livestock zones"},
            ],
            "limits": "This supports a general yard relation, not ownership of this exact outbuilding instance. No new historical research; no specific senik/ovin claim.",
            "current_vikhtuy_cardinality": {
                "g4_ref": source["target"]["g4_ref"],
                "bound_primary_homestead_g5_refs": [
                    "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@1",
                    "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_occupation_terrace@1",
                ],
                "count": 2,
                "status": "approved_low_confidence_bindings_from_approve_with_limits_wave",
                "result": "owner_bridge_ambiguous; current work_storage is not bridgeable by this rule",
            },
            "first_o1_scope_consequence": "If Opus approves this guarded rule, O1 can start only on household_cluster/pf_peasant_homestead; work_storage/pf_outbuildings remains blocked at this G4.",
        },
        "source_pins": [
            pin(INPUT, "candidate", "34 ownership rows, 3 tenure rows, exact-start NPC context and scope refs"),
            pin(BASE / "items-household-personal/items/ownership_rules.csv", "candidate", "PF × context × item-group owner/controller/access candidates"),
            pin(BASE / "resource-catalog/tenure_defaults.csv", "candidate", "PF × resource-family tenure candidates"),
            pin(BASE / "places-binding/places/place_families.csv", "candidate", "general PF relationship descriptions"),
            pin(BASE / "buildings-interiors-containers/interiors/scenes.csv", "candidate", "SCN008 general rural yard context"),
            pin(ROOT / "data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_node_parents.json", "approved_low_confidence", "G4 parent set for exact Vikhtuy cardinality"),
            pin(ROOT / "data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/spatial_node_place_family_bindings.json", "approved_low_confidence", "PF bindings for exact G4 child cardinality"),
            pin(ROOT / "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt", "active_norm", "owner/holder/controller/access semantics"),
        ],
        "approval_requests": [
            "Approve or reject the 34 source ownership rules and three tenure defaults without changing their candidate source status.",
            "Approve R1's dynamic same-PF householder actor-slot mapping, null holder for placed items, and typed fail-closed slot gap.",
            "Decide whether and how the spouse relation grants access; relation, property, permission, and runtime materialization must be aligned.",
            "Approve R2 only as an exact-one-G4 conditional; current Vikhtuy cardinality is two homesteads, so work_storage stays a typed gap.",
        ],
    }

    report = render_report(source, placement, ownership)
    return {PLACEMENT_OUT: json_bytes(placement), OWNERSHIP_OUT: json_bytes(ownership), REPORT_OUT: report.encode()}


def render_report(source, placement, ownership):
    return f'''# O1 data authoring candidate — step 4a3

Status: **candidate, pending Opus**. No import or activation is authorized. This package adds authoring candidates only; existing 4a2 source rows and their statuses are unchanged.

## Approval table

| What to decide | Rows / scope | Source / status | Decision requested |
|---|---:|---|---|
| O1 presence rules | 117 total: 35 outbuildings + 82 homestead | `ordinary-materialization-o1-start-data-candidate.json`; game-base presence/frequency rows, candidate | Approve/reject scoped item/category, probability, count, frequency, variants; ppm/count/frequency are editorial calibration, not recalibrated here |
| Item records and categories | {len(source['candidate_item_records'])} items / {len(source['candidate_category_records'])} categories | candidate JSON; `household.csv`, `personal.csv`, `item_categories.csv`, candidate | Approve exact pool membership and item/category records |
| Ownership rules | 34 rows | `ownership_rules.csv`, candidate | Approve/reject per PF, find context, item group, access policy |
| Tenure defaults | 3 rows | `resource-catalog/tenure_defaults.csv`, candidate | Approve/reject PF × resource-family defaults |
| R1 same-PF head mapping | One conditional mapping | generated NPC bindings + exact start composition/relationship rows; runtime seam exists, data mapping candidate | Resolve owner/controller to the unique householder `actor_slot_ref`; holder null; missing/ambiguous slot blocks creation |
| Spouse access | One candidate rule | NPC relation rows approved low-confidence; item permission and runtime relation support unresolved | Decide explicit access semantics and require runtime relation support |
| R2 work_storage bridge | One conditional mapping | `place_families.csv` + SCN008 context candidate; exact G4/PF bindings approved low-confidence; current guard fails | Approve exact-one homestead per G4 condition; current Vikhtuy has two, so work_storage remains `owner_bridge_ambiguous` |
| Placement rules | 77: 61 homestead + 16 outbuildings | new placement candidate JSON; §8.1 editorial 1:1 default, pending Opus | Approve/reject neutral 1:1 weights and exact permitted variants |

## Placement authorship

`world_base_materialization_table_requirements.md §8.1` explicitly supplies 1/1 when both weights are NULL and labels it editorial. `items_and_property.txt §1, §12` defines placement and disclosure semantics but supplies no item-specific probabilities. Therefore all 77 rows propose candidate exposed/concealed weights 1/1; this is not historical evidence. Existing modes, `probability_ppm`, count, and frequency are unchanged. `allowed_item_refs` never expands beyond each PF presence row's base item and its separately frequency-backed variants.

The variant-bearing rows are 8 homestead categories with same-PF frequency rows and the outbuildings door-lock/padlock pair. Category `used_by` alone is not treated as PF applicability.

## Ownership and bridge findings

The existing owner seam uses dynamically materialized actor slots. R1 proposes the householder slot in the same homestead PF instance for both `owner_ref` and `controller_ref`, with `holder_ref=null`. No household entity/ID is added. Missing or ambiguous slot means no O1 item. Spouse access remains a candidate decision: approved relation rows are low confidence, NPC output currently does not emit relations, and access is separately governed from ownership.

Existing compiled descriptions and SCN008 support a general relation between a rural homestead and working outbuildings; they do not prove exact-instance ownership. The guarded R2 bridge requires exactly one homestead primary G5 in the same G4. Vikhtuy currently has two (`household_cluster` and `occupation_terrace`), so its `work_storage` G5 fails closed with `owner_bridge_ambiguous`. Earliest viable O1 scope is the homestead G5 only, subject to Opus approval of R1 and the pool.

## Not done

No production code, game-base CSV, import, activation, probability recalibration, database readback, PG test, or D41 model series was run. 4b still requires a reviewer plan and Contract Auditor; D41 uses the existing frozen O1 cases after data/profile approval.
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify generated files match source inputs")
    args = parser.parse_args()
    outputs = build()
    if args.check:
        bad = [str(path) for path, expected in outputs.items()
               if not path.exists() or path.read_bytes() != expected]
        if bad:
            raise SystemExit("stale 4a3 generated outputs: " + ", ".join(bad))
        print("4a3 authoring candidate --check PASS (3 outputs)")
        return
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    print("wrote 4a3 placement, ownership, and report candidates")


if __name__ == "__main__":
    main()
