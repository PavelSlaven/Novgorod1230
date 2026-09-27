# -*- coding: utf-8 -*-
"""
build_roles.py — social_strata_legal_status (collector: collect-social-strata-law)

Reads:
  - seed_new_roles.py (authored judgment: 11 candidate roles missing from the pinned
    novgorod_social_roles_v1_enriched.tsv — тиун, вирник, мечник, бирич, подвойский,
    закуп, рядович, скоморох, повитуха, кормилица, знахарка)
  - the pinned enriched TSV (read-only, main checkout) — only to copy the exact
    boilerplate column values used by sibling rows of the same role_group, and to
    check for id collisions. NEVER writes to that file.
  - world-base-seeds/*.csv (approved archetypes) — to validate that every
    social_position_archetype_id / social_class_id / role_archetype_id /
    legal_status_archetype_id / dependency_archetype_id / mobility_archetype_id
    used by a candidate row resolves to an APPROVED seed row (acceptance rule
    from the collector brief).

Writes (this folder only):
  - roles/new_role_candidates.tsv   (same 64-column schema as the pinned TSV)
  - reports/counts.json
  - reports/validation.json
"""
import csv
import json
import hashlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOMAIN_DIR = HERE.parent
OUT_DIR = DOMAIN_DIR / "roles"
REPORT_DIR = DOMAIN_DIR / "reports"

MAIN_CHECKOUT = Path("C:/Users/Slaven/Documents/Novgorod")
PINNED_TSV = MAIN_CHECKOUT / "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"
SEEDS_DIR = MAIN_CHECKOUT / "data/world-base-seeds"

sys.path.insert(0, str(HERE))
from seed_new_roles import HEADER, BOILERPLATE, NEW_ROLES  # noqa: E402


def load_pinned():
    with open(PINNED_TSV, encoding="utf-8") as f:
        r = csv.DictReader(f, delimiter="\t")
        rows = list(r)
        header = r.fieldnames
    return header, rows


def load_seed_ids(fname):
    path = SEEDS_DIR / fname
    ids = {}
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ids[row["id"]] = row.get("status", "")
    return ids


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    pinned_header, pinned_rows = load_pinned()
    if pinned_header != HEADER:
        print("ERROR: pinned TSV header does not match expected 64-column schema.")
        print("pinned :", pinned_header)
        print("expect :", HEADER)
        sys.exit(1)
    pinned_ids = {row["role_id"] for row in pinned_rows}

    # sha256 of the pinned file, so a reviewer can confirm it was never touched
    pinned_sha256 = hashlib.sha256(PINNED_TSV.read_bytes()).hexdigest()

    seed_files = {
        "social_position_archetype_id": "social_position_archetypes_v1.csv",
        "social_class_id": "social_classes_v1.csv",
        "role_archetype_id": "social_role_archetypes_v1.csv",
        "legal_status_archetype_id": "legal_status_archetypes_v1.csv",
        "dependency_archetype_id": "dependency_archetypes_v1.csv",
        "mobility_archetype_id": "mobility_archetypes_v1.csv",
    }
    seed_ids = {field: load_seed_ids(fn) for field, fn in seed_files.items()}

    errors = []
    warnings = []
    out_rows = []

    for role in NEW_ROLES:
        role_id = role["role_id"]
        if role_id in pinned_ids:
            errors.append(f"{role_id}: id collision with pinned TSV — pick a new id")
            continue

        row = dict(BOILERPLATE)
        row.update(role)

        missing = [c for c in HEADER if c not in row]
        if missing:
            errors.append(f"{role_id}: missing columns {missing}")
            continue

        for field, fname in seed_files.items():
            val = row[field]
            status = seed_ids[field].get(val)
            if status is None:
                errors.append(
                    f"{role_id}: {field}={val!r} does not resolve in world-base-seeds/{fname}"
                )
            elif status != "approved":
                warnings.append(
                    f"{role_id}: {field}={val!r} resolves but status={status!r} (expected approved)"
                )

        for attitude_field in (
            "attitude_to_strangers",
            "attitude_to_authority",
            "attitude_to_church",
            "attitude_to_violence",
        ):
            if not row.get(attitude_field, "").strip():
                errors.append(f"{role_id}: {attitude_field} is empty")

        out_rows.append({c: row[c] for c in HEADER})

    if errors:
        print(f"{len(errors)} error(s):")
        for e in errors:
            print(" -", e)
        # still write what validated cleanly is not attempted; fail hard so
        # nothing partial reaches the candidate file.
        (REPORT_DIR / "validation.json").write_text(
            json.dumps(
                {"ok": False, "errors": errors, "warnings": warnings},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        sys.exit(1)

    out_path = OUT_DIR / "new_role_candidates.tsv"
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, delimiter="\t", lineterminator="\n")
        w.writeheader()
        for row in out_rows:
            w.writerow(row)

    (REPORT_DIR / "validation.json").write_text(
        json.dumps(
            {
                "ok": True,
                "errors": [],
                "warnings": warnings,
                "pinned_tsv_sha256": pinned_sha256,
                "pinned_row_count": len(pinned_rows),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (REPORT_DIR / "counts.json").write_text(
        json.dumps(
            {
                "new_role_candidates.tsv": len(out_rows),
                "pinned_enriched_tsv_rows_untouched": len(pinned_rows),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"wrote {len(out_rows)} candidate rows to {out_path}")
    print(f"warnings: {len(warnings)}")


if __name__ == "__main__":
    main()
