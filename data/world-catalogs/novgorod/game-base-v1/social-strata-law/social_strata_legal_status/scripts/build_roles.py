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
  - roles/new_role_candidates.tsv   (the pinned 64 columns plus allowed_occupations)
  - reports/counts.json
  - reports/validation.json
"""
import csv
import json
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOMAIN_DIR = HERE.parent
OUT_DIR = DOMAIN_DIR / "roles"
REPORT_DIR = DOMAIN_DIR / "reports"

MAIN_CHECKOUT = HERE.parents[6]
PINNED_TSV = MAIN_CHECKOUT / "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"
SEEDS_DIR = MAIN_CHECKOUT / "data/world-base-seeds"

sys.path.insert(0, str(HERE))
from seed_new_roles import HEADER, PINNED_HEADER, BOILERPLATE, NEW_ROLES  # noqa: E402

ARCHIVE_ROLES = json.loads(
    (HERE / "archive_role_candidates.json").read_text(encoding="utf-8")
)

SEMANTIC_ROLE_IDS = {
    "ROL0028": "nov_role_vessel_owner",
    "ROL0042": "nov_role_vod_izhora_supplier",
    "ROL0068": "nov_role_foreign_mercenary",
    "ROL0071": "nov_role_princess",
    "ROL0104": "nov_role_church_singer",
    "ROL0149": "nov_role_foreign_ambassador",
    "ROL0077": "nov_role_veche_participant",
    "ROL0086": "nov_role_court_participant",
    "ROL0087": "nov_role_transaction_witness",
    "ROL0088": "nov_role_guarantor",
    "ROL0089": "nov_role_claimant",
    "ROL0090": "nov_role_defendant",
    "ROL0110": "nov_role_church_alms_distributor",
    "ROL0113": "nov_role_relative_caregiver",
    "ROL0142": "nov_role_festival_participant",
    "ROL0143": "nov_role_contest_participant",
    "ROL0152": "nov_role_famine_property_seller",
    "ROL0153": "nov_role_famine_migrant",
    "ROL0156": "nov_role_famine_food_distributor",
    "ROL0163": "nov_role_famine_vulnerable_child",
    "ROL0164": "nov_role_famine_dependency_risk",
    "PRO0358": "nov_role_embassy_interpreter",
}
EXPECTED_SECONDARY_PROFESSION_REFS = {
    "ROL0028": ("PRO0226",), "ROL0104": ("PRO0382",),
    "ROL0110": ("PRO0397",), "ROL0113": ("PRO0406",),
    "ROL0142": ("PRO0456",), "ROL0143": ("PRO0457",),
    "ROL0149": ("PRO0463",), "ROL0152": ("PRO0467",),
    "ROL0153": ("PRO0468",), "ROL0156": ("PRO0471",),
    "ROL0163": ("PRO0478",), "ROL0164": ("PRO0479",),
}
CONTEXT_ONLY_NOT_MASS_DEFAULT = {"ROL0068", "ROL0104", "ROL0110", "ROL0143", "ROL0156"}
ROLE_BASIS_OVERRIDES = {"ROL0113": "logical_necessity"}
ROLE_STATUS_OVERRIDES = {
    # Match all applicable pinned nov_role_ponomar archetype/status fields.
    "ROL0104": {
        "social_rank": "low",
        "freedom_status": "free",
        "dependency_type": "church_service",
        "social_position_archetype_id": "dependent_servant_household",
        "social_class_id": "dependent_commoner",
        "role_archetype_id": "elite_household_member",
        "legal_status_archetype_id": "dependent",
        "dependency_archetype_id": "household_dependency",
        "mobility_archetype_id": "restricted_by_master",
    },
}
PONOMAR_EQUIVALENCE_FIELDS = (
    "social_rank", "freedom_status", "dependency_type",
    "social_position_archetype_id", "social_class_id", "role_archetype_id",
    "legal_status_archetype_id", "dependency_archetype_id", "mobility_archetype_id",
)
ROLE_EXPLANATION_OVERRIDES = {
    "ROL0086": "Участник конкретного судебного дела или представитель стороны; не современный профессиональный адвокат.",
    "ROL0089": "Сторона, заявляющая требование в конкретном споре.",
    "ROL0090": "Сторона, к которой обращено требование в конкретном споре.",
    "ROL0110": "Помогает раздавать пищу или милостыню при церкви; в кризисе это вероятнее, но организация зависит от источника.",
    "ROL0163": "Ребёнок в уязвимом положении во время голода; кризисное социальное состояние, не профессия.",
}


def effective_basis(item):
    return ROLE_BASIS_OVERRIDES.get(item["role_id"], item["basis"])

REVIEW_BASIS_LOGICAL = {
    "ROL0028", "ROL0042", "ROL0071", "ROL0149",
    "ROL0086", "ROL0088", "ROL0113", "ROL0142", "PRO0358",
}
DISTINCT_ROLE_PROBES = (
    ("ROL0087", "ROL0088"),  # witness and guarantor
    ("ROL0089", "ROL0090"),  # claimant and defendant
    ("ROL0028", "ROL0068"),  # vessel owner and foreign mercenary
)
ROLE_GROUP_OVERRIDES = {
    "ROL0068": "военное",
    "ROL0149": "власть",
}
ARCHETYPE_OVERRIDES = {
    # Historical princely household status; mirror nov_role_prince ontology.
    "ROL0071": ("regional_dynastic_ruler", "ruling_dynastic_elite", "ruler"),
    # Local Votic/Izhora populations are not foreign outsiders by default.
    "ROL0042": ("free_rural_householder_commoner", "free_commoner", "merchant_trader"),
    "ROL0068": ("armed_retainer_service", "outsider_foreign", "armed_retainer"),
    # Scene roles, not standing civic offices.
    "ROL0077": ("free_urban_householder", "free_commoner", "common_householder"),
    "ROL0086": ("free_urban_householder", "free_commoner", "common_householder"),
    "ROL0087": ("free_urban_householder", "free_commoner", "common_householder"),
    "ROL0088": ("free_urban_householder", "free_commoner", "common_householder"),
    "ROL0089": ("free_urban_householder", "free_commoner", "common_householder"),
    "ROL0090": ("free_urban_householder", "free_commoner", "common_householder"),
    # Crisis states do not imply a household head; singer/alms distributor are lay roles.
    "ROL0163": ("marginal_outcast_low_status", "marginal_outcast", "traveler_outsider"),
    "ROL0110": ("free_urban_householder", "free_commoner", "common_householder"),
}


def archive_role_to_seed(item):
    domain_map = {
        "administration": ("власть", "free_urban_householder", "free_commoner", "official_manager"),
        "care": ("село", "free_rural_householder_commoner", "free_commoner", "common_householder"),
        "church": ("церковь", "ecclesiastical_household_agent", "ecclesiastical_elite", "cleric"),
        "famine": ("низкий_статус", "free_rural_householder_commoner", "free_commoner", "common_householder"),
        "foreigners": ("торговля", "traveler_guide_itinerant", "outsider_foreign", "traveler_outsider"),
        "music": ("город", "free_urban_householder", "free_commoner", "common_householder"),
        "water_transport": ("торговля", "transport_worker_itinerant", "free_commoner", "merchant_trader"),
        "communication": ("дорога", "traveler_guide_itinerant", "outsider_foreign", "traveler_outsider"),
    }
    group, position, social_class, role_archetype = domain_map.get(
        item["domain"], ("город", "free_urban_householder", "free_commoner", "common_householder")
    )
    override = ARCHETYPE_OVERRIDES.get(item["role_id"])
    if override:
        position, social_class, role_archetype = override
    group = ROLE_GROUP_OVERRIDES.get(item["role_id"], group)
    profession_refs = item["profession_refs"]
    source_refs = list(dict.fromkeys(
        [f"archive:{item['archive_ref']}", *(f"archive:{ref}" for ref in profession_refs)]
    ))
    source_refs.extend((f"basis:{effective_basis(item)}", f"derivation:{item['archive_ref']}"))
    description = item["description_ru"]
    description = re.sub(
        r"^.+? в хозяйственной и социальной системе Новгорода около 1230 года\.\s*", "", description
    )
    description = re.sub(r"^Рабочая цепочка:.*?\.\s*", "", description)
    description = ROLE_EXPLANATION_OVERRIDES.get(item["role_id"], description)
    if not description or description == item["description_ru"]:
        description = f"no_source:modern_explanation:{item['role_id']}"
    role_id = SEMANTIC_ROLE_IDS.get(item["role_id"], "")
    generation_rules = BOILERPLATE["llm_generation_rules"]
    if item["role_id"] in CONTEXT_ONLY_NOT_MASS_DEFAULT:
        generation_rules = (
            "policy:context_only_not_mass_default; "
            "создавать только при конкретной сценической причине, не использовать как массовый default"
        )
    role = {
        "role_id": role_id,
        "role_title": item["title_ru"],
        "role_group": group,
        "historical_term": item["title_ru"],
        "modern_explanation": description,
        "period": item["period"],
        "region_id": "region_novgorod_land",
        "social_rank": "variable",
        "freedom_status": "unclear",
        "dependency_type": "context_dependent",
        "typical_authority_over_them": "определяется личным статусом и обстоятельствами; роль сама по себе его не задаёт",
        "typical_authority_they_have": "не выводится из названия роли; определяется поручением и обстоятельствами сцены",
        "legal_capacity": "не задаётся ролью; проверяется по индивидуальному статусу и конкретному делу",
        "property_rights": "не выводятся из роли; права на имущество требуют отдельного основания",
        "movement_rights": "зависят от личного статуса, поручения и обстоятельств",
        "weapon_rights": "не заданы ролью; проверяются по личному статусу и ситуации",
        "speech_and_testimony_weight": "зависит от личного статуса, дела и конкретных свидетельских правил",
        "access_to_places": "только по подтверждённому основанию и текущей ситуации",
        "typical_places": "no_source:typical_places",
        "typical_g3_place_types": "",
        "typical_g4_location_types": "",
        "economic_basis": "не выводится из роли без дополнительных источников",
        "common_income_sources": "зависят от обстоятельств и подтверждённого занятия",
        "route_knowledge_level": "context_dependent",
        "market_knowledge_level": "context_dependent",
        "law_custom_knowledge_level": "context_dependent",
        "religious_knowledge_level": "context_dependent",
        "npc_generation_depth_default": "scene",
        "can_be_key_npc": "conditional",
        "player_character_allowed": "conditional",
        "source_note": f"D39 candidate; period={item['period']}; region={item['region']}",
        "confidence": item["confidence"],
        "sources": "; ".join(source_refs),
        "audit_notes": "Права, зависимость и полномочия не выводятся из роли автоматически; поля с неопределённостью оставлены контекстными для отдельного review.",
        "social_position_archetype_id": position,
        "social_class_id": social_class,
        "role_archetype_id": role_archetype,
        "legal_status_archetype_id": "unclear",
        "dependency_archetype_id": "none",
        "mobility_archetype_id": "regionally_mobile" if item["domain"] in {"foreigners", "water_transport", "communication"} else "locally_mobile",
        "mapping_review_status": "candidate",
        "mapping_confidence": "low",
        "mapping_notes": (
            "Временная кризисная уязвимость; ближайший approved archetype не утверждает постоянный статус."
            if item["role_id"] == "ROL0163"
            else "Контекстная provisional mapping; не устанавливает права или личный статус."
        ),
        "status": "candidate",
        "llm_generation_rules": generation_rules,
    }
    role.update(ROLE_STATUS_OVERRIDES.get(item["role_id"], {}))
    return role


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
    if pinned_header != PINNED_HEADER:
        print("ERROR: pinned TSV header does not match expected 64-column schema.")
        print("pinned :", pinned_header)
        print("expect :", PINNED_HEADER)
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

    roles = [*NEW_ROLES, *(archive_role_to_seed(item) for item in ARCHIVE_ROLES)]
    if set(SEMANTIC_ROLE_IDS) != {item["role_id"] for item in ARCHIVE_ROLES}:
        errors.append("semantic role ID map does not cover exact archive role set")
    if len(set(SEMANTIC_ROLE_IDS.values())) != len(SEMANTIC_ROLE_IDS):
        errors.append("semantic role ID map contains collisions")
    if any(not value or value.startswith("nov_role_archive_") for value in SEMANTIC_ROLE_IDS.values()):
        errors.append("archive role still has empty or archive-number ID")
    pinned_names = {"".join(c for c in r["role_title"].casefold() if c.isalnum()) for r in pinned_rows}
    seen_names = set()

    for role in roles:
        role_id = role["role_id"]
        if role_id in pinned_ids:
            errors.append(f"{role_id}: id collision with pinned TSV — pick a new id")
            continue

        row = dict(BOILERPLATE)
        row.update(role)

        normalized_name = "".join(c for c in row["role_title"].casefold() if c.isalnum())
        if normalized_name in pinned_names or normalized_name in seen_names:
            errors.append(f"{role_id}: duplicate normalized role title {row['role_title']!r}")
            continue
        seen_names.add(normalized_name)

        if role_id in SEMANTIC_ROLE_IDS.values():
            for token in ("basis:", "derivation:", "archive:"):
                if token not in row["sources"]:
                    errors.append(f"{role_id}: missing provenance token {token}")
            if not row["period"].strip() or "region=" not in row["source_note"]:
                errors.append(f"{role_id}: missing period/region provenance")
            archive_tokens = [
                token.strip() for token in row["sources"].split(";")
                if token.strip().startswith("archive:")
            ]
            if len(archive_tokens) != len(set(archive_tokens)):
                errors.append(f"{role_id}: duplicate archive provenance token")

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

    role_by_archive_id = {
        item["role_id"]: archive_role_to_seed(item) for item in ARCHIVE_ROLES
    }
    for item in ARCHIVE_ROLES:
        row = role_by_archive_id[item["role_id"]]
        expected_archive_tokens = {
            f"archive:{item['archive_ref']}",
            *(f"archive:{ref}" for ref in item["profession_refs"]),
        }
        actual_archive_tokens = {
            token.strip() for token in row["sources"].split(";")
            if token.strip().startswith("archive:")
        }
        if actual_archive_tokens != expected_archive_tokens:
            errors.append(f"{item['role_id']}: archive provenance coverage mismatch")
        if any(ref not in item["profession_refs"] for ref in EXPECTED_SECONDARY_PROFESSION_REFS.get(item["role_id"], ())):
            errors.append(f"{item['role_id']}: expected secondary profession refs absent from authoring")
        for token in (
            f"basis:{effective_basis(item)}",
            f"derivation:{item['archive_ref']}",
        ):
            if row["sources"].count(token) != 1:
                errors.append(f"{item['role_id']}: expected one {token} token")
    tolmach = role_by_archive_id.get("PRO0358")
    if tolmach and tolmach["sources"].count("archive:PRO0358") != 1:
        errors.append("PRO0358: duplicate archive/profession provenance was not deduplicated")
    for role_id in REVIEW_BASIS_LOGICAL:
        source = next((item for item in ARCHIVE_ROLES if item["role_id"] == role_id), None)
        if source is None or effective_basis(source) != "logical_necessity":
            errors.append(f"{role_id}: reviewer requires basis=logical_necessity")
    for role_id, expected in ARCHETYPE_OVERRIDES.items():
        row = role_by_archive_id.get(role_id)
        if row is None or (
            row["social_position_archetype_id"],
            row["social_class_id"],
            row["role_archetype_id"],
        ) != expected:
            errors.append(f"{role_id}: reviewer archetype correction missing")
    pinned_ponomar = next((row for row in pinned_rows if row["role_id"] == "nov_role_ponomar"), None)
    singer = role_by_archive_id["ROL0104"]
    if pinned_ponomar is None or any(
        singer[field] != pinned_ponomar[field] for field in PONOMAR_EQUIVALENCE_FIELDS
    ):
        errors.append("ROL0104: archetype/status fields differ from pinned nov_role_ponomar")
    if any(
        role_by_archive_id[role_id]["role_archetype_id"] == "official_manager"
        for role_id in ("ROL0077", "ROL0086", "ROL0087", "ROL0088", "ROL0089", "ROL0090")
    ):
        errors.append("situational court/veche role mapped to official_manager")
    if any(
        role_by_archive_id[role_id]["social_class_id"] == "merchant_trader"
        for role_id in ("ROL0068", "ROL0149")
    ):
        errors.append("foreign mercenary or ambassador mapped to trade")
    if any(
        role_by_archive_id[role_id]["social_class_id"] == "ecclesiastical_elite"
        for role_id in ("ROL0104", "ROL0110")
    ):
        errors.append("singer or alms distributor mapped to ecclesiastical elite")
    if role_by_archive_id["ROL0042"]["social_class_id"] == "outsider_foreign":
        errors.append("Votic/Izhora supplier mapped to foreign outsider")
    if role_by_archive_id["ROL0068"]["role_archetype_id"] != "armed_retainer":
        errors.append("foreign mercenary missing armed_retainer archetype")
    if role_by_archive_id["ROL0104"]["role_archetype_id"] != "elite_household_member":
        errors.append("church singer archetype differs from pinned ponomar")
    if any(
        role_by_archive_id["ROL0104"].get(field) != expected
        for field, expected in ROLE_STATUS_OVERRIDES["ROL0104"].items()
    ):
        errors.append("church singer archetype/status mapping differs from pinned ponomar")
    for role_id in CONTEXT_ONLY_NOT_MASS_DEFAULT:
        role = role_by_archive_id[role_id]
        if "policy:context_only_not_mass_default" not in role["llm_generation_rules"]:
            errors.append(f"{role_id}: context-only policy missing from generation rules")
    for item in ARCHIVE_ROLES:
        role = role_by_archive_id[item["role_id"]]
        if "Рабочая цепочка:" in role["modern_explanation"] or "Рабочая цепочка" in role["typical_places"]:
            errors.append(f"{item['role_id']}: workflow template leaked into role fields")
        if any(shared in role["modern_explanation"] for shared in (
            "социальная, правовая или общественная роль в хозяйственной и социальной системе",
            "временная или сезонная роль в хозяйственной и социальной системе",
            "регулярное занятие, не обязательно отдельная профессия",
        )):
            errors.append(f"{item['role_id']}: shared archive boilerplate leaked into modern_explanation")
    for role_id, expected in {
        "ROL0086": "Участник конкретного судебного дела",
        "ROL0089": "Сторона, заявляющая требование",
        "ROL0090": "Сторона, к которой обращено требование",
        "ROL0110": "милостыню",
        "ROL0163": "Ребёнок в уязвимом положении",
    }.items():
        if expected not in role_by_archive_id[role_id]["modern_explanation"]:
            errors.append(f"{role_id}: positive role-specific explanation probe failed")
    if any(role["typical_places"] != "no_source:typical_places" for role in role_by_archive_id.values()):
        errors.append("family workflow template leaked into typical_places")
    if role_by_archive_id["ROL0113"]["sources"].count("basis:logical_necessity") != 1:
        errors.append("ROL0113: expected basis:logical_necessity provenance")
    for left, right in DISTINCT_ROLE_PROBES:
        left_row = role_by_archive_id.get(left)
        right_row = role_by_archive_id.get(right)
        if left_row is None or right_row is None or left_row["role_id"] == right_row["role_id"]:
            errors.append(f"semantic negative probe collapsed distinct roles: {left} / {right}")
    for role_id in ("ROL0068", "ROL0149"):
        if role_by_archive_id[role_id]["role_group"] == "торговля":
            errors.append(f"{role_id}: foreign military/diplomatic role mapped to trade group")

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
                "archive_role_candidates": len(ARCHIVE_ROLES),
                "archive_basis_counts": {
                    basis: sum(1 for item in ARCHIVE_ROLES if effective_basis(item) == basis)
                    for basis in sorted({effective_basis(item) for item in ARCHIVE_ROLES})
                },
                "archive_provenance_rows": len(ARCHIVE_ROLES),
                "semantic_role_ids": len(SEMANTIC_ROLE_IDS),
                "context_only_not_mass_default": len(CONTEXT_ONLY_NOT_MASS_DEFAULT),
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
                "archive_role_candidates": len(ARCHIVE_ROLES),
                "semantic_role_ids": len(SEMANTIC_ROLE_IDS),
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
