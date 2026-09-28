"""Validate complete, owner-safe reconciliation of D40 point exclusions."""
import json

from common import ROOT, read_csv, split
from exclusion_return_rules import RETURN_DISPOSITIONS

BASIS = {"sourced", "analogy", "logical_necessity", "editorial"}
KINDS = {"owner_handoff", "existing_identity", "rejected_anachronism"}


def validate_rows(rows):
    fail = []
    expected = {r[0] for r in RETURN_DISPOSITIONS}
    seen = set()
    transport = {r["tr_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/transport-health-recreation/transport_travel/transport_entities.csv")}
    tools = {r["tl_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes/craft_tools_gear/tools_gear.csv")}
    items = {r["it_id"] for path in ("household.csv", "personal.csv") for r in read_csv(ROOT / f"data/world-catalogs/novgorod/game-base-v1/items-household-personal/items/{path}")}
    fauna = set()
    for path in (
        "fauna-mammals-birds/fauna/mammals.csv", "fauna-mammals-birds/fauna/birds.csv",
        "fauna-fish-invertebrates-livestock/fauna/livestock_species.csv",
    ):
        fauna |= {r["fa_id"] for r in read_csv(ROOT / f"data/world-catalogs/novgorod/game-base-v1/{path}")}
    livestock = {r["ls_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/livestock_types.csv")}
    materials = {r["mt_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes/materials_registry/materials.csv")}
    containers = {r["ct_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/containers/container_forms.csv")}
    content_profiles = {r["cp_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/containers/content_profiles.csv")}
    known = transport | tools | items | fauna | livestock | materials | containers | content_profiles
    confidence = {}
    for row in read_csv(ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv"):
        source = json.loads(row["source_record"])
        if source.get("item_id"):
            confidence[source["item_id"]] = row["historical_confidence"]
    for row in rows:
        rid, source_id = row.get("return_id", ""), row.get("source_id", "")
        if not rid or source_id in seen:
            fail.append(f"{rid or '<blank>'}: duplicate/blank disposition")
        seen.add(source_id)
        if source_id not in expected:
            fail.append(f"{rid}: unexpected source id")
        if row.get("return_kind") not in KINDS or row.get("basis") not in BASIS:
            fail.append(f"{rid}: closed vocabulary violation")
        if not row.get("target_owner") or not row.get("derivation") or not row.get("anachronism_check"):
            fail.append(f"{rid}: incomplete owner/basis derivation")
        if not row.get("derivation", "").startswith("sources/master-archive-v1/"):
            fail.append(f"{rid}: derivation lacks repository D39 archive row")
        if row.get("status") != "candidate" or row.get("confidence") not in {"A", "B", "C", "D"}:
            fail.append(f"{rid}: disposition must remain A-D/candidate")
        for ref in split(row.get("target_refs")):
            if ref.startswith(("issue:", "decision:", "owner:")):
                continue
            if ref not in known:
                fail.append(f"{rid}: unresolved target ref {ref}")
        if source_id == "HNT0028":
            required = {"tl_ski_hunting", "trv_034", "issue:#176:hunting_snowshoe_form"}
            if (confidence.get(source_id) != "D" or row.get("confidence") != "D"
                    or row.get("return_kind") != "owner_handoff" or row.get("basis") != "analogy"
                    or not required.issubset(set(split(row.get("target_refs"))))
                    or not row.get("anachronism_check", "").startswith("pass:")):
                fail.append(f"{rid}: confidence-D snowshoe must remain a conditional sourced-owner handoff")
        elif source_id not in {"boat", "cart_or_sledge"} and confidence.get(source_id) not in {"A", "B", "C"}:
            fail.append(f"{rid}: source confidence outside A-C")
        if source_id == "HNT0013" and not {"decision:F34", "issue:#175"}.issubset(set(split(row.get("target_refs")))):
            fail.append(f"{rid}: D40 F34/#175 handoff missing")
    if seen != expected:
        fail.append(f"point-return reconciliation mismatch: missing={sorted(expected-seen)} extra={sorted(seen-expected)}")
    return fail, {
        "rows": len(rows), "returned": sum(r.get("return_kind") != "rejected_anachronism" for r in rows),
        "rejected_anachronism": sum(r.get("return_kind") == "rejected_anachronism" for r in rows),
    }


def self_test(rows):
    baseline, _ = validate_rows(rows)
    assert not baseline, baseline[:3]
    first = rows[0]
    falcon = next(r for r in rows if r["source_id"] == "HNT0013")
    snowshoe = next(r for r in rows if r["source_id"] == "HNT0028")
    probes = [
        ({**first, "basis": "guess"}, "closed vocabulary"),
        ({**first, "target_refs": "trv_missing"}, "unresolved target"),
        ({**first, "derivation": "decision:D40"}, "repository D39"),
        ({**falcon, "target_refs": "fa_b_goshawk"}, "F34/#175"),
        ({**snowshoe, "return_kind": "rejected_anachronism"}, "conditional sourced-owner handoff"),
        ({**snowshoe, "confidence": "C"}, "conditional sourced-owner handoff"),
    ]
    for changed, expected in probes:
        candidate = [changed if r["source_id"] == changed["source_id"] else r for r in rows]
        failures, _ = validate_rows(candidate)
        assert any(expected in failure for failure in failures), expected
    print(f"exclusion-return negative probes PASS ({len(probes)})")
