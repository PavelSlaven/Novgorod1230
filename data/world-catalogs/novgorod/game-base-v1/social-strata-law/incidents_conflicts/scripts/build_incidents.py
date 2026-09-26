# -*- coding: utf-8 -*-
"""
build_incidents.py — incidents_conflicts (collector: collect-social-strata-law)

Reads (read-only):
  - tools/rus13-novgorod-regional-templates/novgorod_local_conflict_templates_v1.json
    (main checkout) — 40 conflict_templates (draft) + 5 escalation rules +
    5 resolution rules + 5 status_and_law_effects.
  - data/novgorod-region/novgorod_social_roles_v1_enriched.tsv (pinned, 71 rows)
  - social_strata_legal_status/roles/new_role_candidates.tsv (this collector's
    own domain 1 output, 11 rows)
  - data/novgorod-region/novgorod_occupations_v1_enriched.tsv (69 rows)
  - infra/world-base/schema/05.sql (world-base-runtime worktree) — only to
    confirm the conflict_type CHECK constraint's 14 allowed values, never
    written to.

Writes (this folder only):
  - conflicts/incidents.csv        (40 rows, one per source template)
  - conflicts/escalation_rules.csv (5 rows, pass-through)
  - conflicts/resolution_rules.csv (5 rows, pass-through)
  - conflicts/status_law_effects.csv (5 rows, pass-through)
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
GROUP_DIR = DOMAIN_DIR.parent
OUT_DIR = DOMAIN_DIR / "conflicts"
REPORT_DIR = DOMAIN_DIR / "reports"

MAIN_CHECKOUT = Path("C:/Users/Slaven/Documents/Novgorod")
TEMPLATES_JSON = MAIN_CHECKOUT / "tools/rus13-novgorod-regional-templates/novgorod_local_conflict_templates_v1.json"
PINNED_ROLES_TSV = MAIN_CHECKOUT / "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"
OCCUPATIONS_TSV = MAIN_CHECKOUT / "data/novgorod-region/novgorod_occupations_v1_enriched.tsv"
CANDIDATE_ROLES_TSV = GROUP_DIR / "social_strata_legal_status/roles/new_role_candidates.tsv"
DDL_SQL = Path("C:/Users/Slaven/Documents/Novgorod-runtime/infra/world-base/schema/05.sql")

sys.path.insert(0, str(HERE))
from participant_and_type_map import CONFLICT_TYPE_MAP, WEAK_FIT_TYPES, PARTICIPANT_MAP  # noqa: E402

# Hand-picked links from a template to a law_justice_governance lw_id, where
# the template's own text makes the connection unambiguous. Every other
# template's resolution is marked "обычай, C" per the collector brief's
# acceptance rule ("каждое разрешение ссылается на law_justice_governance
# или помечено «обычай, C»").
LAW_LINK = {
    "conflict_debt_dispute": "lw_proc_debt_denial_witness_oath",
    "conflict_witness_argument": "lw_proc_witness_status_exceptions",
    "conflict_guarantor": "lw_proc_zakup_complaint_route",  # closest sourced guarantor/status text available
}


def ddl_conflict_types():
    text = DDL_SQL.read_text(encoding="utf-8")
    m = re.search(r"conflict_type TEXT CHECK.*?IN \(([^)]*)\)", text, re.S)
    if not m:
        raise RuntimeError("could not find conflict_type CHECK constraint in 05.sql")
    return {v.strip().strip("'") for v in m.group(1).split(",")}


def load_role_ids(path, id_col, delim="\t"):
    with open(path, encoding="utf-8") as f:
        return {row[id_col] for row in csv.DictReader(f, delimiter=delim)}


def load_occupation_ids():
    with open(OCCUPATIONS_TSV, encoding="utf-8") as f:
        return {row["occupation_id"] for row in csv.DictReader(f, delimiter="\t")}


def resolve_participant(term, known_role_ids, known_occ_ids, errors, tid):
    entry = PARTICIPANT_MAP.get(term)
    if entry is None:
        errors.append(f"{tid}: participant term {term!r} has no entry in PARTICIPANT_MAP")
        return f"unresolved:{term}"
    kind, ref = entry
    if kind == "role" and ref not in known_role_ids:
        errors.append(f"{tid}: participant role_id {ref!r} (term {term!r}) not found in pinned or candidate roles")
    if kind == "occupation" and ref not in known_occ_ids:
        errors.append(f"{tid}: participant occupation_id {ref!r} (term {term!r}) not found in occupations TSV")
    return f"{kind}:{ref}"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    allowed_types = ddl_conflict_types()
    mapped_targets = set(CONFLICT_TYPE_MAP.values())
    bad_targets = mapped_targets - allowed_types
    errors = []
    if bad_targets:
        errors.append(f"CONFLICT_TYPE_MAP maps to values outside the DDL enum: {bad_targets}")

    known_role_ids = load_role_ids(PINNED_ROLES_TSV, "role_id") | load_role_ids(
        CANDIDATE_ROLES_TSV, "role_id"
    )
    known_occ_ids = load_occupation_ids()

    d = json.loads(TEMPLATES_JSON.read_text(encoding="utf-8"))
    templates = d["conflict_templates"]

    seen_source_types = set()
    incident_rows = []
    weak_fit_used = []

    for t in templates:
        tid = t["conflict_template_id"]
        src_type = t["conflict_type"]
        seen_source_types.add(src_type)
        ddl_type = CONFLICT_TYPE_MAP.get(src_type)
        if ddl_type is None:
            errors.append(f"{tid}: source conflict_type {src_type!r} has no entry in CONFLICT_TYPE_MAP")
            continue
        if src_type in WEAK_FIT_TYPES:
            weak_fit_used.append((tid, src_type, ddl_type))

        participants = [
            resolve_participant(p, known_role_ids, known_occ_ids, errors, tid)
            for p in t["participants_by_role"]
        ]

        law_ref = LAW_LINK.get(tid)
        if law_ref:
            resolution_refs = f"law_justice_governance:{law_ref}"
        else:
            resolution_refs = "обычай, C"

        row = {
            "ic_id": f"ic_{tid}",
            "conflict_type": ddl_type,
            "source_conflict_type_ru": src_type,
            "title_ru": t["title"],
            "pf_ids": "",  # not resolved this pass — see README gap
            "where_common_ru": "; ".join(t["where_common"]),
            "participant_roles": "; ".join(participants),
            "trigger_conditions": "; ".join(t.get("typical_trigger", [])),
            "visible_signs": "; ".join(t.get("visible_signs", [])),
            "hidden_factors_ru": "; ".join(t.get("hidden_factors_allowed", [])),
            "nonviolent_paths_ru": "; ".join(t.get("nonviolent_paths", [])),
            "violent_escalation_conditions_ru": "; ".join(t.get("violent_escalation_conditions", [])),
            "escalation_refs": "; ".join(t.get("violent_escalation_conditions", [])) or "нет данных",
            "resolution_refs": resolution_refs,
            "authority_response_ru": t.get("authority_response", ""),
            "church_response_ru": t.get("church_response", ""),
            "memory_consequences_ru": "; ".join(t.get("memory_consequences", [])),
            "timer_rule": "",  # timers live in deferred_event_templates — separate domain, see README gap
            "frequency_class": "unspecified",  # draft source gives no explicit frequency — see README gap
            "region_id": "region_novgorod_land",
            "source_refs": "src_rus13tpl_local_conflict_templates_v1",
            "confidence": "C",
            "status": "candidate",
        }
        incident_rows.append(row)

    unknown_src_types = seen_source_types - set(CONFLICT_TYPE_MAP)
    if unknown_src_types:
        errors.append(f"templates use conflict_type values with no map entry: {unknown_src_types}")

    if errors:
        print(f"{len(errors)} error(s):")
        for e in errors:
            print(" -", e)
        (REPORT_DIR / "validation.json").write_text(
            json.dumps({"ok": False, "errors": errors}, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        sys.exit(1)

    incident_header = list(incident_rows[0].keys())
    with open(OUT_DIR / "incidents.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=incident_header, lineterminator="\n")
        w.writeheader()
        w.writerows(incident_rows)

    def write_passthrough(name, key, out_name, extra_cols=()):
        rows = d[key]
        header = list(rows[0].keys()) + list(extra_cols)
        with open(OUT_DIR / out_name, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header, lineterminator="\n")
            w.writeheader()
            for r in rows:
                r2 = dict(r)
                for col in extra_cols:
                    r2[col] = "src_rus13tpl_local_conflict_templates_v1"
                w.writerow(r2)
        return len(rows)

    n_esc = write_passthrough("conflict_escalation_rules", "conflict_escalation_rules", "escalation_rules.csv", ("source_refs",))
    n_res = write_passthrough("conflict_resolution_rules", "conflict_resolution_rules", "resolution_rules.csv", ("source_refs",))
    n_sle = write_passthrough("status_and_law_effects", "status_and_law_effects", "status_law_effects.csv", ("source_refs",))

    counts = {
        "incidents.csv": len(incident_rows),
        "escalation_rules.csv": n_esc,
        "resolution_rules.csv": n_res,
        "status_law_effects.csv": n_sle,
    }
    (REPORT_DIR / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "validation.json").write_text(
        json.dumps(
            {
                "ok": True,
                "errors": [],
                "weak_fit_conflict_types_used": weak_fit_used,
                "ddl_allowed_conflict_types": sorted(allowed_types),
                "resolved_via_law_justice_governance": sorted(LAW_LINK.keys()),
                "resolved_as_обычай_C": len(incident_rows) - len(LAW_LINK),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print("wrote:", counts)
    print("weak-fit conflict_type mappings:", len(weak_fit_used))


if __name__ == "__main__":
    main()
