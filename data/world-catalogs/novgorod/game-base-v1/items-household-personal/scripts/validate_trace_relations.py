"""Validate typed archaeological traces and their exclusion reconciliation."""
import json
import re
from collections import Counter

from common import ITEMS, ME, ROOT, read_csv, split
import rules as R
from build_trace_relations import TRANSPORT_CONTEXT

TRACE_KINDS = {"waste", "fragment", "residue", "deposit", "byproduct"}
PICKUP_MODE = {
    "waste": "collect_finite_portion", "fragment": "pickup_fragment",
    "residue": "extract_finite_portion", "deposit": "sample_layer",
    "byproduct": "collect_finite_portion",
}
EXPECTED = {"waste": 1329, "fragment": 1127, "residue": 750, "deposit": 510, "byproduct": 25}
DENY = re.compile(r"\b(картоф|кукуруз|томат|подсолнеч|табак|индейк|кролик|чай\b|кофе\b|сахар\b|огнестрел|пищал|бумаг)", re.I)
MATERIAL_ALIASES = {
    "animal_byproduct": "mt_bone", "bone": "mt_bone", "ceramic": "mt_ceramic",
    "fur": "mt_fur", "lime": "mt_lime", "mixed": "mt_wood_generic",
}
DOMAIN_TOKENS = {"food"}


def source_policy_allows(entity):
    """Historical confidence informs display; only an explicit never-policy excludes."""
    return "never" not in entity.get("generation_policy", "")


def source_state():
    entities = {r["item_id"]: r for r in read_csv(ME / "material_entities.csv")}
    links = {r["link_id"]: r for r in read_csv(ME / "item_location_links.csv")}
    canonical = {}
    for row in read_csv(ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv"):
        source = json.loads(row["source_record"])
        if source.get("item_id"):
            canonical[source["item_id"]] = row["id"]
    return entities, links, canonical


def validate_rows(rows):
    fail = []
    entities, links, canonical = source_state()
    expected_links = {
        link_id for link_id, link in links.items()
        if link["item_id"] in entities and entities[link["item_id"]]["entity_kind"] in TRACE_KINDS
    }
    materials = {r["mt_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes/materials_registry/materials.csv")}
    crosswalk = {r["foreign_code"]: split(r["mt_ids"]) for r in read_csv(
        ROOT / "data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes/materials_registry/material_crosswalk.csv"
    )}
    recipe_ids = {r["recipe_id"] for r in read_csv(
        ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/food_system/recipes.csv"
    )}
    seen_ids, seen_links = set(), set()
    for row in rows:
        rid, link_id = row.get("trace_id", ""), row.get("source_link_id", "")
        if not rid or rid in seen_ids:
            fail.append(f"{rid or '<blank>'}: duplicate or blank trace_id")
        if not link_id or link_id in seen_links:
            fail.append(f"{rid}: duplicate or blank source_link_id")
        seen_ids.add(rid); seen_links.add(link_id)
        if link_id not in links:
            fail.append(f"{rid}: source link unresolved")
            continue
        link = links[link_id]
        entity = entities[link["item_id"]]
        if row.get("source_item_id") != link["item_id"] or row.get("master_item_ref") != canonical.get(link["item_id"]):
            fail.append(f"{rid}: source item/canonical FK mismatch")
        if row.get("trace_kind") != entity["entity_kind"] or row.get("trace_kind") not in TRACE_KINDS:
            fail.append(f"{rid}: trace kind mismatch or outside closed vocabulary")
        if row.get("source_location_archetype") != link["location_archetype"]:
            fail.append(f"{rid}: archetype mismatch")
        expected_pfs = R.ARCH_PF.get(link["location_archetype"], [])
        if split(row.get("pf_refs")) != expected_pfs:
            fail.append(f"{rid}: PF mapping mismatch")
        expected_resolution = "mapped_pf" if expected_pfs else "transport_context" if link["location_archetype"] in TRANSPORT_CONTEXT else "owner_handoff"
        if row.get("place_resolution") != expected_resolution:
            fail.append(f"{rid}: place resolution mismatch")
        if expected_pfs and row.get("place_owner_ref"):
            fail.append(f"{rid}: mapped trace must not claim a place-owner gap")
        if expected_resolution == "transport_context" and row.get("place_owner_ref") != TRANSPORT_CONTEXT[link["location_archetype"]]:
            fail.append(f"{rid}: vehicle trace must hand off to transport/container owner")
        if expected_resolution == "owner_handoff" and "issue:#176" not in row.get("place_owner_ref", ""):
            fail.append(f"{rid}: unresolved place must hand off to #176")
        if row.get("frequency_class") != link["spawn_frequency"] or row.get("frequency_class") not in R.FREQ_WEIGHT:
            fail.append(f"{rid}: frequency mismatch")
        if row.get("pickup_mode") != PICKUP_MODE.get(entity["entity_kind"]):
            fail.append(f"{rid}: pickup mode mismatch")
        if row.get("quantity_boundary") != "finite_source_instance;never_spawn_intact_parent;no_refresh":
            fail.append(f"{rid}: finite trace boundary missing")
        process_refs = split(row.get("process_refs"))
        for process_ref in process_refs:
            prefix = "sources/master-archive-v1/data/normalized_source_tables/food_system/recipes.csv#"
            if not process_ref.startswith(prefix) or process_ref[len(prefix):] not in recipe_ids:
                fail.append(f"{rid}: process ref unresolved")
        if entity["entity_kind"] == "byproduct" and not process_refs:
            fail.append(f"{rid}: byproduct lacks source process")
        if row.get("basis") != "logical_necessity" or not row.get("derivation") or not row.get("source_refs"):
            fail.append(f"{rid}: D39 basis/derivation incomplete")
        if not row.get("derivation", "").startswith("sources/master-archive-v1/"):
            fail.append(f"{rid}: derivation lacks repository D39 archive row")
        if row.get("confidence") != "C" or row.get("status") != "candidate":
            fail.append(f"{rid}: trace relation must remain C/candidate")
        if not (int(entity["period_from"]) <= 1230 <= int(entity["period_to"])):
            fail.append(f"{rid}: source period excludes 1230")
        if not source_policy_allows(entity):
            fail.append(f"{rid}: source policy rejects generation")
        if DENY.search(" ".join((entity["name_ru"], entity["description_ru"], entity["materials"]))):
            fail.append(f"{rid}: source hits anachronism denylist")
        token = entity["primary_material"]
        resolved = crosswalk.get(token) or [MATERIAL_ALIASES.get(token, "")]
        if token not in DOMAIN_TOKENS and (not resolved or any(mt not in materials for mt in resolved)):
            fail.append(f"{rid}: material token {token!r} unresolved")
        if row.get("anachronism_check") != "pass:period_1230;confidence_not_exclusion;material_or_domain_vocab;denylist_clear":
            fail.append(f"{rid}: anachronism check marker mismatch")
    if seen_links != expected_links:
        fail.append(f"trace reconciliation mismatch: missing={len(expected_links-seen_links)} extra={len(seen_links-expected_links)}")
    counts = Counter(r.get("trace_kind") for r in rows)
    if dict(counts) != EXPECTED:
        fail.append(f"trace-kind counts mismatch: {dict(counts)}")
    metrics = {
        "rows": len(rows), "source_items": len({r.get("source_item_id") for r in rows}),
        "by_trace_kind": dict(sorted(counts.items())),
        "by_place_resolution": dict(sorted(Counter(r.get("place_resolution") for r in rows).items())),
    }
    return fail, metrics


def self_test(rows):
    baseline, _ = validate_rows(rows)
    assert not baseline, baseline[:3]
    first = rows[0]
    probes = [
        ({**first, "trace_kind": "intact_item"}, "trace kind"),
        ({**first, "pickup_mode": "spawn_whole_item"}, "pickup mode"),
        ({**first, "quantity_boundary": "renewable_loot"}, "finite trace boundary"),
        ({**first, "source_link_id": "ILO999999"}, "source link unresolved"),
        ({**first, "basis": "sourced"}, "D39 basis"),
        ({**first, "status": "approved"}, "C/candidate"),
    ]
    for changed, expected in probes:
        failures, _ = validate_rows([changed] + rows[1:])
        assert any(expected in failure for failure in failures), expected
    assert source_policy_allows({"historical_confidence": "D", "generation_policy": "conditional"})
    assert not source_policy_allows({"historical_confidence": "A", "generation_policy": "never_generate"})
    print(f"trace relation negative probes PASS ({len(probes) + 2})")
