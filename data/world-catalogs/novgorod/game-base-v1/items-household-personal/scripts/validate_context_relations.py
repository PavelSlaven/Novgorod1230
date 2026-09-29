"""Validate whole-item links returned to transport/activity owners instead of PF placement."""
from collections import Counter

from build_frequency import ARCHAEOLOGICAL_KINDS, CONTEXT_ARCHES, DENY, DROP_REASONS
from common import ITEMS, ME, REPORTS, ROOT, load_master, read_csv, split


def validate_rows(rows, dropped=None):
    fail = []
    master = load_master()
    links = {r["link_id"]: r for r in read_csv(ME / "item_location_links.csv")}
    expected = {
        link_id for link_id, row in links.items()
        if row["location_archetype"] in CONTEXT_ARCHES
        and master[row["item_id"]]["rec"].get("entity_kind") not in ARCHAEOLOGICAL_KINDS
        and not DENY.search(master[row["item_id"]]["name_ru"])
    }
    transport = {r["tr_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/transport-health-recreation/transport_travel/transport_entities.csv")}
    containers = {r["ct_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/containers/container_forms.csv")}
    contents = {r["cp_id"] for r in read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/containers/content_profiles.csv")}
    known = transport | containers | contents
    seen_ids, seen_links = set(), set()
    for row in rows:
        rid, link_id = row.get("icr_id", ""), row.get("source_link_id", "")
        if not rid or rid in seen_ids:
            fail.append(f"{rid or '<blank>'}: duplicate/blank relation id")
        seen_ids.add(rid)
        if not link_id or link_id in seen_links:
            fail.append(f"{rid}: duplicate/blank source link")
        seen_links.add(link_id)
        source = links.get(link_id)
        if not source:
            fail.append(f"{rid}: unresolved source link")
            continue
        arch = source["location_archetype"]
        if arch not in CONTEXT_ARCHES:
            fail.append(f"{rid}: archetype is not a reviewed context handoff")
            continue
        context_kind, owner, target_refs = CONTEXT_ARCHES[arch]
        item = master[source["item_id"]]
        if row.get("item_ref") != item["canonical_id"] or row.get("name_ru") != item["name_ru"]:
            fail.append(f"{rid}: item identity differs from source")
        if (row.get("location_archetype"), row.get("context_kind"), row.get("target_owner"), row.get("target_refs")) != (arch, context_kind, owner, target_refs):
            fail.append(f"{rid}: owner/context mapping differs from reviewed rule")
        if row.get("spawn_frequency") != source["spawn_frequency"]:
            fail.append(f"{rid}: frequency differs from source link")
        for ref in split(row.get("target_refs")):
            if ref.startswith("issue:"):
                continue
            if ref not in known:
                fail.append(f"{rid}: unresolved target ref {ref}")
        if row.get("basis") != "sourced" or row.get("status") != "candidate":
            fail.append(f"{rid}: relation must remain sourced/candidate")
        if row.get("confidence") not in {"A", "B", "C", "D"}:
            fail.append(f"{rid}: invalid confidence")
        if not row.get("derivation", "").startswith("sources/master-archive-v1/"):
            fail.append(f"{rid}: derivation lacks repository D39 archive row")
        if not row.get("materialization_rule") or not row.get("anachronism_check", "").startswith("pass:"):
            fail.append(f"{rid}: incomplete owner boundary or anachronism check")
    if seen_links != expected:
        fail.append(f"context-link reconciliation mismatch: missing={len(expected-seen_links)} extra={len(seen_links-expected)}")

    dropped = read_csv(REPORTS / "frequency_dropped.csv") if dropped is None else dropped
    for row in dropped:
        if row.get("reason_code") not in DROP_REASONS:
            fail.append(f"{row.get('link_id', '<blank>')}: dropped reason outside closed vocabulary")
        if not row.get("reason"):
            fail.append(f"{row.get('link_id', '<blank>')}: dropped reason detail missing")
    return fail, {
        "rows": len(rows),
        "by_context": dict(Counter(r.get("context_kind") for r in rows)),
        "by_archetype": dict(Counter(r.get("location_archetype") for r in rows)),
        "confidence": dict(Counter(r.get("confidence") for r in rows)),
        "dropped": len(dropped),
        "dropped_by_reason": dict(Counter(r.get("reason_code") for r in dropped)),
    }


def self_test(rows):
    baseline, _ = validate_rows(rows)
    assert not baseline, baseline[:3]
    first = rows[0]
    probes = [
        ({**first, "context_kind": "ambient_pf"}, "owner/context mapping"),
        ({**first, "target_refs": "trv_missing"}, "owner/context mapping"),
        ({**first, "basis": "editorial"}, "sourced/candidate"),
        ({**first, "derivation": "decision:D40"}, "repository D39"),
    ]
    for changed, expected in probes:
        candidate = [changed if r["icr_id"] == changed["icr_id"] else r for r in rows]
        failures, _ = validate_rows(candidate)
        assert any(expected in failure for failure in failures), expected
    failures, _ = validate_rows(rows, [{"link_id": "probe", "reason_code": "not_useful", "reason": "probe"}])
    assert any("closed vocabulary" in failure for failure in failures)
    print(f"context-relation negative probes PASS ({len(probes) + 1})")
