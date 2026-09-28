"""Build a deterministic row-level disposition ledger for the pinned evidence snapshot."""
from collections import Counter
import csv
import hashlib
import json
import re

from common import ITEMS, REPORTS, write_csv

SNAPSHOT = ITEMS.parent / "sources/evidence-household-v2"
FILES = ("x-household.csv", "x-household.web.csv", "x-food.csv", "x-clothing.csv", "x-crafts.csv")
LEDGER = REPORTS / "household_evidence_ledger.csv"
REPORT = REPORTS / "household_evidence_intake.json"
FIELDS = ("source_file", "source_row", "row_sha256", "disposition", "target_id",
          "reject_reason", "basis", "derivation")
PHYSICAL_FACTS = {
    "dating", "description", "dimensions", "material", "name_form", "presence_in_region",
    "price", "quantity", "technique", "use",
}
DIRECT_PERIODS = {"c1230", "medieval_general"}

NEW_ITEMS = [
    {"item_id": "it_hh_clay_baking_pan", "basis": "analogy", "derivation": "book:624953 §301; v2 region_scope=rus_other, форма перенесена как осторожная аналогия", "quote": "глиняные сковородки (диаметром 30–35 см)"},
    {"item_id": "it_hh_clay_latka", "basis": "analogy", "derivation": "book:624953 §301; book:624953 §312; v2 region_scope=rus_other, форма перенесена как осторожная аналогия", "quote": "латки — открытые сосуды с тремя ножками-выступами"},
    {"item_id": "it_hh_perforated_clay_vessel", "basis": "analogy", "derivation": "book:624953 §236; форма VIII–X вв. роменско-боршевского ареала перенесена как осторожная функциональная аналогия", "quote": "сосудов усеченно-конической формы с отверстиями"},
    {"item_id": "it_hh_rectangular_clay_tray", "basis": "analogy", "derivation": "book:624953 §236; форма VIII–X вв. роменско-боршевского ареала перенесена как осторожная функциональная аналогия", "quote": "прямоугольных толстостенных больших сковородок"},
    {"item_id": "it_hh_glass_drinking_vessel", "basis": "analogy", "derivation": "book:624953 §344; book:624953 §346; book:624953 §348; v2 region_scope=far, локальность не переносится", "quote": "владелец усадьбы Б ... имел византийские чаши, бутылки"},
    {"item_id": "it_hh_silver_feast_cup", "basis": "analogy", "derivation": "book:622242 §2450; book:301539 §1824; v2 mixed region_scope, пиршественная форма перенесена осторожно", "quote": "серебряные чаши для пиров"},
]


def canonical_row_hash(row):
    payload = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def candidate_target(row):
    entity = row.get("entity_ru", "").lower()
    key = (row.get("book_id", ""), row.get("para_no", ""))
    if key == ("624953", "301") and "глиняная сковород" in entity:
        return "it_hh_clay_baking_pan"
    if key in {("624953", "301"), ("624953", "312")} and "латк" in entity:
        return "it_hh_clay_latka"
    if key == ("624953", "236") and "сырниц" in entity:
        return "it_hh_perforated_clay_vessel"
    if key == ("624953", "236") and "против" in entity:
        return "it_hh_rectangular_clay_tray"
    if key[0] == "624953" and key[1] in {"344", "346", "348"}:
        return "it_hh_glass_drinking_vessel"
    if key in {("622242", "2450"), ("301539", "1824")} and re.search(r"серебр|чаш|сосуд", " ".join(row.values()), re.I):
        return "it_hh_silver_feast_cup"
    return ""


def classify(row):
    flags = set(filter(None, row.get("flags", "").split(";")))
    if "anachronism_denylist_hit" in flags:
        return "rejected", "", "anachronism_or_late_form", "editorial", "closed flag vocabulary"
    if row.get("period") not in DIRECT_PERIODS:
        return "rejected", "", "outside_target_period", "editorial", "period is not c1230 or medieval_general"
    target = candidate_target(row)
    if target:
        region = row.get("region_scope", "")
        basis = "analogy"
        derivation = (f"explicit item anchor reviewed for CR #176; v2 period={row.get('period', '')}; "
                      f"dated={row.get('dated', '') or 'none'}; region_scope={region}; "
                      f"number_unverified={row.get('number_unverified', '')}; "
                      "no value or number is transferred; anchor alone does not establish local Novgorod presence")
        return "new_item_candidate", target, "", basis, derivation
    if row.get("fact_type") not in PHYSICAL_FACTS:
        return "rejected", "", "outside_item_relation_scope", "editorial", "fact type is not a physical item relation"
    derivation = (f"v2 row routed for owner review only; period={row.get('period', '')}; "
                  f"dated={row.get('dated', '') or 'none'}; region_scope={row.get('region_scope', '')}; "
                  f"number_unverified={row.get('number_unverified', '')}; no value or fact is transferred")
    return "owner_review_handoff", f"domain:{row['domain']}", "", "editorial", derivation


def main():
    ledger = []
    file_metrics = {}
    totals = Counter()
    reasons = Counter()
    directly_used = []
    for name in FILES:
        path = SNAPSHOT / name
        rows = list(csv.DictReader(path.open(encoding="utf-8", newline="")))
        counts = Counter()
        for source_row, row in enumerate(rows, 2):
            disposition, target_id, reason, basis, derivation = classify(row)
            ledger.append({
                "source_file": name, "source_row": str(source_row),
                "row_sha256": canonical_row_hash(row), "disposition": disposition,
                "target_id": target_id, "reject_reason": reason,
                "basis": basis, "derivation": derivation,
            })
            counts[disposition] += 1
            totals[disposition] += 1
            if reason:
                reasons[reason] += 1
            if disposition == "new_item_candidate":
                directly_used.append({
                    "source_file": name, "source_row": source_row,
                    "book_ref": f"book:{row.get('book_id')} §{row.get('para_no')}",
                    "period_label_v2": row.get("period", ""), "dated": row.get("dated", ""),
                    "region_scope": row.get("region_scope", ""),
                    "number_unverified": row.get("number_unverified", ""), "target_id": target_id,
                })
        file_metrics[name] = {
            "rows": len(rows), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "dispositions": dict(sorted(counts.items())),
        }
    REPORTS.mkdir(exist_ok=True)
    write_csv(LEDGER, ledger, FIELDS)
    report = {
        "status": "candidate", "reviewed_at": "2026-09-29",
        "snapshot_path": "sources/evidence-household-v2",
        "input_rows_total": len(ledger), "dispositions": dict(sorted(totals.items())),
        "reject_reasons": dict(sorted(reasons.items())), "files": file_metrics,
        "ledger": {"path": "reports/household_evidence_ledger.csv", "rows": len(ledger),
                   "sha256": hashlib.sha256(LEDGER.read_bytes()).hexdigest()},
        "screening_rule": {
            "basis": "editorial", "confidence_is_not_rejection": True,
            "derivation": "Every non-broken v2 row receives exactly one item target, owner-review domain target, or closed reject reason. Period comes only from v2 period; dated and region_scope are preserved for review; number_unverified forbids numeric transfer; note is never parsed for dates; confidence never rejects a row.",
            "allowed_direct_periods": sorted(DIRECT_PERIODS),
            "region_scopes": ["novgorod_land", "rus_other", "neighbour", "far"],
            "numeric_transfer_requires_verified": True,
            "physical_fact_types": sorted(PHYSICAL_FACTS),
        },
        "new_item_ids_created": len(NEW_ITEMS), "new_items": NEW_ITEMS,
        "directly_used_source_rows": directly_used,
        "accepted_anchors": [
            {"target": "FUR0002", "basis": "sourced", "derivation": "book:624953 §47; book:624953 §53", "quote": "неподвижная мебель — лавки, полати, разнообразные поставцы"},
            {"target": "it_hh_splinter_holder_wood", "basis": "sourced", "derivation": "book:624953 §100", "quote": "с XIII в. дома на Руси освещались лучинами"},
            {"target": "it_hh_bucket_stave", "basis": "sourced", "derivation": "book:624953 §463", "quote": "ведра, известны на Руси с IX в."},
            {"target": "it_hh_frying_pan", "basis": "sourced", "derivation": "book:624953 §118", "quote": "широко использовались железные сковороды"},
            {"target": "it_hh_spindle", "basis": "sourced", "derivation": "book:638081 §1922", "quote": "Прядение и ткачество ... были в числе наиболее распространенных домашних занятий"},
            {"target": "tl_smith_tongs", "basis": "sourced", "derivation": "book:622242 §1599", "quote": "двое клещей, одни молот, один молоток, зубило"},
            {"target": "mt_copper", "basis": "sourced", "derivation": "book:622242 §1742", "quote": "более 100 обрезков листовой меди"},
            {"target": "bt_bathhouse", "basis": "analogy", "derivation": "book:728823 §933; позднее описание подтверждает только бревенчатую форму", "quote": "Строилась баня из бревен"},
        ],
        "candidate_consolidation": {
            "basis": "editorial",
            "derivation": "Named variants and archaeological exemplars reuse existing domain owners instead of creating parallel identities.",
        },
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"evidence_ledger={len(ledger)} dispositions={dict(sorted(totals.items()))}")


if __name__ == "__main__":
    main()
