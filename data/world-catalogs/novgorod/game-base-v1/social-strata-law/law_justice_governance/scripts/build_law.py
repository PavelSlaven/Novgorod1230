# -*- coding: utf-8 -*-
"""
build_law.py — law_justice_governance (collector: collect-social-strata-law)

Validates every `wk:claim:<ref>` cited in seed_law_rows.py against the actual
claim_ref list in the three source WK files (approved-only), then splits the
authored rows by law_type into three CSVs sharing one column schema (the
domain's key_fields list treats offences/procedures/institutions as one
schema with a discriminating law_type column).

Reads (read-only, main checkout C:/Users/Slaven/Documents/Novgorod):
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

WK_DIR = Path(
    "C:/Users/Slaven/Documents/Novgorod/data/world-catalogs/novgorod/world-knowledge/production-v1"
)
WK_FILES = [
    "residual-law-norms-v1.json",
    "residual-government-law-v1.json",
    "residual-government-law-v2.json",
]

sys.path.insert(0, str(HERE))
from seed_law_rows import HEADER, ROWS  # noqa: E402

CLAIM_REF_RE = re.compile(r"wk:claim:([a-z0-9\-]+)")


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

    for row in ROWS:
        lw_id = row["lw_id"]
        if row["law_type"] not in by_type:
            errors.append(f"{lw_id}: unknown law_type {row['law_type']!r}")
            continue
        missing = [c for c in HEADER if c not in row]
        if missing:
            errors.append(f"{lw_id}: missing columns {missing}")
            continue

        cited = set(CLAIM_REF_RE.findall(row["source_refs"]))
        if not cited:
            errors.append(f"{lw_id}: source_refs cites no wk:claim:<ref>")
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

    (REPORT_DIR / "validation.json").write_text(
        json.dumps(
            {
                "ok": True,
                "errors": [],
                "warnings": warnings,
                "wk_claim_refs_used": len(used_claims),
                "wk_claim_refs_available_approved": total_approved,
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
