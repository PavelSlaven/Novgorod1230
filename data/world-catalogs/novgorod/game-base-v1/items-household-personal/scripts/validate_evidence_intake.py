"""Validate the pinned evidence snapshot and its complete row-level disposition ledger."""
from collections import Counter
import csv
import hashlib
import json
import re

from common import ITEMS, REPORTS, ROOT, read_csv, split
from build_evidence_intake import canonical_row_hash, classify

SNAPSHOT = ITEMS.parent / "sources/evidence-household-v2"
FILES = {"x-household.csv", "x-household.web.csv", "x-food.csv", "x-clothing.csv", "x-crafts.csv"}
V2_FIELDS = {"period", "dated", "region_scope", "number_unverified", "period_before"}
BASIS = {"sourced", "analogy", "logical_necessity", "editorial"}
DISPOSITIONS = {"owner_review_handoff", "new_item_candidate", "rejected"}
REJECT_REASONS = {"anachronism_or_late_form", "outside_target_period", "outside_item_relation_scope"}


def validate_report(report):
    fail = []
    evidence_refs = set()
    snapshot_rows = {}
    files = report.get("files", {})
    if set(files) != FILES:
        fail.append("evidence file set mismatch")
    rows_total = 0
    for name, metrics in files.items():
        path = SNAPSHOT / name
        if not path.is_file():
            fail.append(f"{name}: snapshot file unavailable")
            continue
        rows = list(csv.DictReader(path.open(encoding="utf-8", newline="")))
        if rows and not V2_FIELDS.issubset(rows[0]):
            fail.append(f"{name}: v2 columns missing")
        snapshot_rows[name] = rows
        for source_row in rows:
            if source_row.get("book_id") and source_row.get("para_no"):
                evidence_refs.add(f"book:{source_row['book_id']} §{source_row['para_no']}")
        if metrics.get("rows") != len(rows) or metrics.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
            fail.append(f"{name}: row count or sha256 differs from pinned snapshot")
        rows_total += len(rows)
    if report.get("snapshot_path") != "sources/evidence-household-v2":
        fail.append("snapshot path must be repository-relative")

    ledger_path = REPORTS / "household_evidence_ledger.csv"
    ledger = read_csv(ledger_path) if ledger_path.exists() else []
    ledger_meta = report.get("ledger", {})
    if ledger_meta.get("path") != "reports/household_evidence_ledger.csv":
        fail.append("ledger path must be repository-relative")
    if ledger_meta.get("rows") != len(ledger) or (ledger_path.exists() and ledger_meta.get("sha256") != hashlib.sha256(ledger_path.read_bytes()).hexdigest()):
        fail.append("ledger row count or hash mismatch")
    if rows_total != report.get("input_rows_total") or len(ledger) != rows_total:
        fail.append("ledger does not cover all evidence rows")
    keys = Counter((r.get("source_file"), r.get("source_row")) for r in ledger)
    if any(n != 1 for n in keys.values()):
        fail.append("ledger source row keys are not unique")
    disposition_counts = Counter()
    reject_counts = Counter()
    catalog = json.loads((ROOT / "data/world-catalogs/novgorod/game-base-v1/catalog.json").read_text(encoding="utf-8"))
    domain_ids = {r["id"] for r in catalog["domains"]}
    item_ids = {r["it_id"] for name in ("household.csv", "personal.csv") for r in read_csv(ITEMS / name)}
    for entry in ledger:
        name = entry.get("source_file", "")
        try:
            index = int(entry.get("source_row", "")) - 2
            source = snapshot_rows[name][index]
        except (KeyError, ValueError, IndexError):
            fail.append(f"ledger row has unresolved source coordinate: {name}:{entry.get('source_row')}")
            continue
        if entry.get("row_sha256") != canonical_row_hash(source):
            fail.append(f"{name}:{entry['source_row']}: source row hash mismatch")
        expected = classify(source)
        actual = (entry.get("disposition"), entry.get("target_id"), entry.get("reject_reason"),
                  entry.get("basis"), entry.get("derivation"))
        if actual != expected:
            fail.append(f"{name}:{entry['source_row']}: disposition differs from v2 classifier")
        disposition = entry.get("disposition")
        disposition_counts[disposition] += 1
        if disposition not in DISPOSITIONS:
            fail.append(f"{name}:{entry['source_row']}: unknown disposition")
        target, reason = entry.get("target_id", ""), entry.get("reject_reason", "")
        if bool(target) == bool(reason):
            fail.append(f"{name}:{entry['source_row']}: exactly one target or reject reason required")
        if target.startswith("domain:") and target.split(":", 1)[1] not in domain_ids:
            fail.append(f"{name}:{entry['source_row']}: unresolved target domain")
        elif target and not target.startswith("domain:") and target not in item_ids:
            fail.append(f"{name}:{entry['source_row']}: unresolved target item")
        if reason:
            reject_counts[reason] += 1
            if reason not in REJECT_REASONS:
                fail.append(f"{name}:{entry['source_row']}: open reject reason")
        if entry.get("basis") not in BASIS or not entry.get("derivation"):
            fail.append(f"{name}:{entry['source_row']}: missing basis/derivation")
        if disposition == "owner_review_handoff" and (entry.get("basis") != "editorial" or "no value or fact is transferred" not in entry.get("derivation", "")):
            fail.append(f"{name}:{entry['source_row']}: v2 handoff must not transfer an unreviewed fact")
        if disposition == "new_item_candidate" and source.get("region_scope") != "novgorod_land" and entry.get("basis") != "analogy":
            fail.append(f"{name}:{entry['source_row']}: nonlocal candidate must be analogy")
        if disposition == "new_item_candidate" and (entry.get("basis") != "analogy" or "no value or number is transferred" not in entry.get("derivation", "")):
            fail.append(f"{name}:{entry['source_row']}: candidate anchor must remain non-numeric analogy")
    if dict(sorted(disposition_counts.items())) != report.get("dispositions"):
        fail.append("ledger disposition totals do not reconcile")
    if dict(sorted(reject_counts.items())) != report.get("reject_reasons"):
        fail.append("ledger reject reason totals do not reconcile")
    if not report.get("screening_rule", {}).get("confidence_is_not_rejection"):
        fail.append("confidence must not be a rejection reason")
    screening = report.get("screening_rule", {})
    if not screening.get("numeric_transfer_requires_verified") or "note is never parsed for dates" not in screening.get("derivation", ""):
        fail.append("v2 period/number screening rule missing")
    used = report.get("directly_used_source_rows", [])
    candidate_keys = {(r["source_file"], int(r["source_row"]), r["target_id"])
                      for r in ledger if r["disposition"] == "new_item_candidate"}
    used_keys = {(r.get("source_file"), int(r.get("source_row", 0)), r.get("target_id")) for r in used}
    if candidate_keys != used_keys:
        fail.append("directly used v2 rows do not reconcile with candidate ledger rows")

    items = {r["it_id"]: r for name in ("household.csv", "personal.csv") for r in read_csv(ITEMS / name)}
    new_items = report.get("new_items", [])
    if report.get("new_item_ids_created") != len(new_items):
        fail.append("new item count differs from evidence report")
    for row in new_items:
        iid = row.get("item_id", "")
        if iid not in items:
            fail.append(f"{iid}: evidence-created item missing")
            continue
        if row.get("basis") not in {"sourced", "analogy"} or not re.search(r"book:\d+ §\d+", row.get("derivation", "")):
            fail.append(f"{iid}: reviewed book basis missing")
        exact_refs = set(re.findall(r"book:\d+ §\d+", row.get("derivation", "")))
        if not exact_refs.issubset(evidence_refs):
            fail.append(f"{iid}: book reference absent from snapshot")
        if not exact_refs.issubset(set(split(items[iid]["source_refs"]))):
            fail.append(f"{iid}: item source_refs do not preserve evidence refs")
        if not row.get("quote"):
            fail.append(f"{iid}: short quote missing")
    for row in report.get("accepted_anchors", []):
        if row.get("basis") not in {"sourced", "analogy"} or not row.get("derivation") or not row.get("quote"):
            fail.append(f"{row.get('target', '<blank>')}: incomplete accepted evidence anchor")
        elif not set(re.findall(r"book:\d+ §\d+", row["derivation"])).issubset(evidence_refs):
            fail.append(f"{row.get('target', '<blank>')}: anchor absent from snapshot")
    return fail, {
        "input_rows": rows_total, "ledger_rows": len(ledger),
        "dispositions": dict(sorted(disposition_counts.items())),
        "reject_reasons": dict(sorted(reject_counts.items())),
        "new_item_ids_created": len(new_items),
    }


def load_report():
    return json.loads((REPORTS / "household_evidence_intake.json").read_text(encoding="utf-8"))


def self_test(report):
    baseline, _ = validate_report(report)
    assert not baseline, baseline[:3]
    probes = [
        ({**report, "input_rows_total": report["input_rows_total"] - 1}, "cover all"),
        ({**report, "screening_rule": {**report["screening_rule"], "confidence_is_not_rejection": False}}, "confidence"),
        ({**report, "new_items": [{**report["new_items"][0], "basis": "guess"}] + report["new_items"][1:]}, "reviewed book basis"),
    ]
    for changed, expected in probes:
        failures, _ = validate_report(changed)
        assert any(expected in failure for failure in failures), expected
    legacy_flag = {
        "flags": "period_c1230_but_note_says_later_or_absent", "period": "medieval_general",
        "fact_type": "use", "domain": "food_drink", "book_id": "0", "para_no": "0",
        "dated": "XI–XIV вв.; 1230", "region_scope": "rus_other", "number_unverified": "0",
    }
    assert classify(legacy_flag)[0] == "owner_review_handoff"
    conflicting_local_number = {
        "flags": "", "period": "medieval_general", "fact_type": "presence_in_region",
        "domain": "household_items", "book_id": "301539", "para_no": "1824",
        "entity_ru": "серебряная чаша", "dated": "1230", "region_scope": "novgorod_land",
        "number_unverified": "1", "note": "Волынская летопись; не Новгород",
    }
    classified = classify(conflicting_local_number)
    assert classified[0] == "new_item_candidate" and classified[3] == "analogy"
    assert "no value or number is transferred" in classified[4]
    print(f"evidence-intake negative probes PASS ({len(probes) + 2})")
