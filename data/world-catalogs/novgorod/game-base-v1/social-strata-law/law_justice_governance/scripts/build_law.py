# -*- coding: utf-8 -*-
"""
build_law.py — law_justice_governance (collector: collect-social-strata-law)

Validates every `wk:claim:<ref>` cited in seed_law_rows.py against the actual
claim_ref list in the three source WK files (approved-only), then splits the
authored rows by law_type into three CSVs sharing one column schema (the
domain's key_fields list treats offences/procedures/institutions as one
schema with a discriminating law_type column).

Reads (read-only, current checkout):
  - data/world-catalogs/novgorod/world-knowledge/production-v1/residual-law-norms-v1.json
  - data/world-catalogs/novgorod/world-knowledge/production-v1/residual-government-law-v1.json
  - data/world-catalogs/novgorod/world-knowledge/production-v1/residual-government-law-v2.json

Writes (this folder only):
  - law/offences_sanctions.csv
  - law/procedures.csv
  - law/institutions.csv
  - reports/counts.json
  - reports/validation.json
"""
import csv
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOMAIN_DIR = HERE.parent
OUT_DIR = DOMAIN_DIR / "law"
REPORT_DIR = DOMAIN_DIR / "reports"

MAIN_CHECKOUT = HERE.parents[6]
WK_DIR = MAIN_CHECKOUT / "data/world-catalogs/novgorod/world-knowledge/production-v1"
WK_FILES = [
    "residual-law-norms-v1.json",
    "residual-government-law-v1.json",
    "residual-government-law-v2.json",
]

sys.path.insert(0, str(HERE))
from seed_law_rows import HEADER, ROWS, ARCHIVE_CANDIDATE_COUNTS  # noqa: E402

CLAIM_REF_RE = re.compile(r"wk:claim:([a-z0-9\-]+)")


def normalize_name(value):
    return "".join(c for c in value.casefold() if c.isalnum())


def load_approved_claim_refs():
    refs = {}
    for fn in WK_FILES:
        d = json.loads((WK_DIR / fn).read_text(encoding="utf-8"))
        for c in d.get("claims", []):
            ref = c["claim_ref"]
            # claim_ref values look like "claim:xxx" — normalise to "xxx"
            key = ref.split("claim:", 1)[-1]
            refs[key] = {"file": fn, "review_status": c.get("review_status")}
    return refs


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    approved_refs = load_approved_claim_refs()

    errors = []
    warnings = []
    by_type = {"offence": [], "procedure": [], "institution": []}
    title_owners = {}
    archive_rows = 0

    if ARCHIVE_CANDIDATE_COUNTS != {
        "archive_candidates": 60,
        "new": 48,
        "attached": 9,
        "merged": 4,
        "variants": 1,
    }:
        errors.append(f"unexpected archive candidate counts: {ARCHIVE_CANDIDATE_COUNTS}")

    archive_candidates = json.loads(
        (HERE / "archive_rule_candidates.json").read_text(encoding="utf-8")
    )
    b_law_topics = [
        item for item in archive_candidates
        if item["confidence"] == "B" and item["archive_id"].startswith("n1230:law_rule:")
    ]
    if len(b_law_topics) != 29 or any(item["basis"] != "analogy" for item in b_law_topics):
        errors.append("reviewer basis coverage mismatch: all 29 B law topics must use analogy")
    b_property_reconstructions = [
        item for item in archive_candidates
        if item["archive_id"] in {
            "n1230:property_rule:household_property",
            "n1230:property_rule:pledged_property",
        }
    ]
    if len(b_property_reconstructions) != 2 or any(
        item["confidence"] != "B" or item["basis"] != "logical_necessity"
        for item in b_property_reconstructions
    ):
        errors.append("reviewer basis mismatch: household_property and pledged_property must be B/logical_necessity")

    for row in ROWS:
        lw_id = row["lw_id"]
        if row["law_type"] not in by_type:
            errors.append(f"{lw_id}: unknown law_type {row['law_type']!r}")
            continue
        missing = [c for c in HEADER if c not in row]
        if missing:
            errors.append(f"{lw_id}: missing columns {missing}")
            continue

        normalized_title = normalize_name(row["title_ru"])
        if normalized_title in title_owners:
            errors.append(
                f"{lw_id}: duplicate normalized title {row['title_ru']!r} with {title_owners[normalized_title]}"
            )
        else:
            title_owners[normalized_title] = lw_id

        cited = set(CLAIM_REF_RE.findall(row["source_refs"]))
        archive_refs = re.findall(r"archive:(n1230:[^;]+)", row["source_refs"])
        if not cited and not archive_refs:
            errors.append(f"{lw_id}: source_refs cites no wk:claim:<ref>")
        if archive_refs:
            archive_rows += len(archive_refs)
            if not re.search(r"basis:(sourced|analogy|logical_necessity)", row["source_refs"]):
                errors.append(f"{lw_id}: archive row missing basis token")
            if "derivation:" not in row["source_refs"]:
                errors.append(f"{lw_id}: archive row missing derivation token")
            if not row.get("period_caveat") or "region" not in row.get("period_caveat", ""):
                if not all("period:" in row["source_refs"] and "region:" in row["source_refs"] for _ in archive_refs):
                    errors.append(f"{lw_id}: archive row missing period/region provenance")
            if row["status"] != "candidate":
                errors.append(f"{lw_id}: archive candidate status must remain candidate")
        for ref in cited:
            info = approved_refs.get(ref)
            if info is None:
                errors.append(f"{lw_id}: wk:claim:{ref} not found in {WK_FILES}")
            elif info["review_status"] != "approved":
                warnings.append(
                    f"{lw_id}: wk:claim:{ref} has review_status={info['review_status']!r} (expected approved)"
                )

        by_type[row["law_type"]].append({c: row[c] for c in HEADER})

    if errors:
        print(f"{len(errors)} error(s):")
        for e in errors:
            print(" -", e)
        (REPORT_DIR / "validation.json").write_text(
            json.dumps({"ok": False, "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        sys.exit(1)

    file_map = {
        "offence": OUT_DIR / "offences_sanctions.csv",
        "procedure": OUT_DIR / "procedures.csv",
        "institution": OUT_DIR / "institutions.csv",
    }
    counts = {}
    for law_type, path in file_map.items():
        rows = by_type[law_type]
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
            w.writeheader()
            for row in rows:
                w.writerow(row)
        counts[path.name] = len(rows)

    used_claims = set()
    for row in ROWS:
        used_claims.update(CLAIM_REF_RE.findall(row["source_refs"]))
    total_approved = sum(1 for v in approved_refs.values())
    archive_owner_map = {}
    provenance_errors = []
    for item in archive_candidates:
        matches = [
            row for row in ROWS
            if f"archive:{item['archive_ref']}" in row["source_refs"]
        ]
        if len(matches) != 1:
            provenance_errors.append(f"{item['archive_ref']}: expected one owner, found {len(matches)}")
            continue
        row = matches[0]
        archive_owner_map[item["archive_ref"]] = row["lw_id"]
        for token in (
            f"basis:{item['basis']}",
            f"derivation:{item['archive_ref']}",
            f"confidence:{item['confidence']}",
            f"period:{item['period']}",
            f"region:{item['region']}",
        ):
            # Legacy add_variant refs use their own provenance shape; every one
            # of the 60 included archive topics must retain all five fields.
            if token not in row["source_refs"]:
                provenance_errors.append(f"{item['archive_ref']}: missing {token}")
    if provenance_errors:
        print("archive provenance errors:")
        for error in provenance_errors:
            print(" -", error)
        sys.exit(1)

    (REPORT_DIR / "validation.json").write_text(
        json.dumps(
            {
                "ok": True,
                "errors": [],
                "warnings": warnings,
                "wk_claim_refs_used": len(used_claims),
                "wk_claim_refs_available_approved": total_approved,
                "archive_provenance_rows": archive_rows,
                "archive_new_rows": ARCHIVE_CANDIDATE_COUNTS["new"],
                "archive_attached_rows": ARCHIVE_CANDIDATE_COUNTS["attached"],
                "archive_merged_refs": ARCHIVE_CANDIDATE_COUNTS["merged"],
                "archive_basis_counts": {
                    basis: sum(1 for item in archive_candidates if item["basis"] == basis)
                    for basis in sorted({item["basis"] for item in archive_candidates})
                },
                "archive_owner_map": archive_owner_map,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (REPORT_DIR / "counts.json").write_text(
        json.dumps(counts, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("wrote:", counts)
    print("warnings:", len(warnings))


if __name__ == "__main__":
    main()
