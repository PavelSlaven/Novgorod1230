#!/usr/bin/env python3
"""
RUS13 Novgorod social archetype backfill v1.

Reads regional TSV roles/occupations, proposes universal archetype mappings,
writes audit report CSVs and optional manual mapping tables.

Usage:
  python backfill_novgorod_archetypes.py \\
    --roles-tsv data/novgorod-region/novgorod_social_roles_v1.tsv \\
    --occupations-tsv data/novgorod-region/novgorod_occupations_v1.tsv \\
    --output-dir data/world-base-seeds \\
    --update-maps --auto-approve-confidence high --write-enriched-tsv
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ponytail: position ids, not role_archetype ids
ROLE_GROUP_HINTS: Dict[str, List[str]] = {
    "власть": ["urban_elite_office_holder", "armed_retainer_service", "regional_dynastic_ruler"],
    "военное": ["armed_retainer_service", "guard_watchman_service"],
    "церковь": ["parish_cleric", "monastic_community_member", "ecclesiastical_household_agent"],
    "город": ["free_urban_householder", "artisan_master_urban", "elite_household_dependent_agent"],
    "торговля": ["urban_merchant_trader", "privileged_long_distance_merchant"],
    "село": ["free_rural_householder_commoner", "rural_laborer_commoner"],
    "промысел": ["forest_water_producer_commoner"],
    "дорога": ["transport_worker_itinerant", "traveler_guide_itinerant"],
    "зависимые": ["dependent_servant_household", "bonded_laborer_dependent"],
    "низкий_статус": ["marginal_outcast_low_status", "displaced_status_lost_outsider", "captive_unfree_person"],
}

EXPLICIT_ROLE_MAP: Dict[str, str] = {
    "nov_role_prince": "regional_dynastic_ruler",
    "nov_role_posadnik": "urban_elite_office_holder",
    "nov_role_tysyatsky": "military_officer_elite",
    "nov_role_sotsky": "urban_elite_office_holder",
    "nov_role_city_elder": "free_urban_householder",
    "nov_role_starosta": "landholding_notable_rural",
    "nov_role_toll_collector": "urban_elite_office_holder",
    "nov_role_guard": "guard_watchman_service",
    "nov_role_princely_man": "armed_retainer_service",
    "nov_role_princely_druzhinnik": "armed_retainer_service",
    "nov_role_junior_druzhinnik": "armed_retainer_service",
    "nov_role_bishop_man": "ecclesiastical_household_agent",
    "nov_role_boyar_man": "elite_household_dependent_agent",
    "nov_role_boyar": "landholding_notable_rural",
    "nov_role_boyar_house_mistress": "elite_household_dependent_agent",
    "nov_role_merchant_guest": "privileged_long_distance_merchant",
    "nov_role_local_merchant": "urban_merchant_trader",
    "nov_role_merchant_clerk": "dependent_servant_household",
    "nov_role_trader": "urban_merchant_trader",
    "nov_role_foreign_guest": "foreign_privileged_merchant_outsider",
    "nov_role_craftsman_master": "artisan_master_urban",
    "nov_role_journeyman": "artisan_master_urban",
    "nov_role_apprentice": "dependent_servant_household",
    "nov_role_householder": "free_urban_householder",
    "nov_role_household_mistress": "free_urban_householder",
    "nov_role_servant": "dependent_servant_household",
    "nov_role_hired_worker": "rural_laborer_commoner",
    "nov_role_port_worker": "rural_laborer_commoner",
    "nov_role_smerd_householder": "free_rural_householder_commoner",
    "nov_role_dependent_peasant": "contract_dependent_laborer",
    "nov_role_ploughman": "rural_laborer_commoner",
    "nov_role_pastoral_worker": "forest_water_producer_commoner",
    "nov_role_fisher": "forest_water_producer_commoner",
    "nov_role_hunter": "forest_water_producer_commoner",
    "nov_role_bortnik": "forest_water_producer_commoner",
    "nov_role_forest_promyslovik": "forest_water_producer_commoner",
    "nov_role_senokos_worker": "rural_laborer_commoner",
    "nov_role_miller": "artisan_master_urban",
    "nov_role_monastery_worker": "dependent_servant_household",
    "nov_role_widow_householder": "free_rural_householder_commoner",
    "nov_role_youth_helper": "rural_laborer_commoner",
    "nov_role_old_household_member": "free_rural_householder_commoner",
    "nov_role_archbishop": "high_ecclesiastical_ruler",
    "nov_role_igumen": "monastic_community_member",
    "nov_role_priest": "parish_cleric",
    "nov_role_deacon": "parish_cleric",
    "nov_role_monk": "monastic_community_member",
    "nov_role_novice": "monastic_community_member",
    "nov_role_ponomar": "dependent_servant_household",
    "nov_role_church_guard": "guard_watchman_service",
    "nov_role_church_scribe": "ecclesiastical_official_manager",
    "nov_role_pilgrim": "traveler_guide_itinerant",
    "nov_role_guide": "traveler_guide_itinerant",
    "nov_role_ferryman": "transport_worker_itinerant",
    "nov_role_boatman": "transport_worker_itinerant",
    "nov_role_helmsman": "transport_worker_itinerant",
    "nov_role_cart_driver": "transport_worker_itinerant",
    "nov_role_winter_road_man": "transport_worker_itinerant",
    "nov_role_portage_worker": "transport_worker_itinerant",
    "nov_role_merchant_companion": "dependent_servant_household",
    "nov_role_druzhina_companion": "armed_retainer_service",
    "nov_role_kholop": "unfree_household_dependent",
    "nov_role_debtor": "debt_dependent_commoner",
    "nov_role_runaway": "marginal_outcast_low_status",
    "nov_role_orphan": "dependent_servant_household",
    "nov_role_outsider": "displaced_status_lost_outsider",
    "nov_role_izgoi": "displaced_status_lost_outsider",
    "nov_role_captive": "captive_unfree_person",
    "nov_role_beggar": "marginal_outcast_low_status",
    "nov_role_sick_disabled": "marginal_outcast_low_status",
    "nov_role_no_guarantor": "displaced_status_lost_outsider",
}

ACTIVE_STATUSES = {"approved", "usable_with_caution"}
ROLE_ENRICHED_COLUMNS = [
    "social_position_archetype_id",
    "social_class_id",
    "role_archetype_id",
    "legal_status_archetype_id",
    "dependency_archetype_id",
    "mobility_archetype_id",
    "mapping_review_status",
    "mapping_confidence",
    "mapping_notes",
]
OCC_ENRICHED_COLUMNS = [
    "occupation_archetype_id",
    "mapping_review_status",
    "mapping_confidence",
    "mapping_notes",
]

OCC_GROUP_BASE: Dict[str, str] = {
    "военное": "military_security",
    "дорога": "transport_guiding",
    "власть": "administration_law",
    "церковь": "religious_literate",
    "торговля": "trade_exchange",
    "ремесло": "craft_production",
    "промысел": "forest_hunting",
    "село": "agriculture",
    "зависимые": "domestic_service",
    "низкий_статус": "illicit_marginal",
    "город": "craft_production",
}

OCC_TITLE_OVERRIDES: Dict[str, str] = {
    "рыб": "fishing_water",
    "охот": "forest_hunting",
    "лес": "forest_hunting",
    "скот": "animal_husbandry",
    "врач": "healing_care",
    "леч": "healing_care",
    "страж": "military_security",
    "посад": "administration_law",
    "купец": "trade_exchange",
    "гост": "trade_exchange",
    "холоп": "domestic_service",
    "нищ": "illicit_marginal",
}

FREEDOM_LEGAL = {
    "свобод": "free",
    "завис": "dependent",
    "несвобод": "unfree",
    "холоп": "unfree",
    "плен": "captive",
    "изгой": "outcast",
    "иностр": "privileged_foreign",
    "церков": "ecclesiastical",
}

DEPENDENCY_HINTS = {
    "долг": "debt_dependency",
    "закуп": "debt_dependency",
    "ряд": "lord_dependency",
    "хозяин": "owner_control",
    "двор": "household_dependency",
    "монаст": "monastery_dependency",
    "служ": "office_service",
    "воен": "military_service",
    "купец": "merchant_house_service",
}


def read_tsv(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def write_tsv(path: Path, fieldnames: List[str], rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def read_manual_map(path: Path, key_col: str, val_col: str) -> Dict[str, str]:
    if not path.exists():
        return {}
    out: Dict[str, str] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("review_status", "approved") not in {"approved", "accepted_with_caution"}:
                continue
            key = (row.get(key_col) or "").strip()
            val = (row.get(val_col) or "").strip()
            if key and val:
                out[key] = val
    return out


def norm(text: Any) -> str:
    return str(text or "").strip().lower()


def infer_legal(freedom_status: str) -> str:
    t = norm(freedom_status)
    for needle, val in FREEDOM_LEGAL.items():
        if needle in t:
            return val
    return "unclear"


def infer_dependency(dependency_type: str) -> str:
    t = norm(dependency_type)
    for needle, val in DEPENDENCY_HINTS.items():
        if needle in t:
            return val
    if not t or t in {"нет", "none", "-"}:
        return "none"
    return "household_dependency"


def load_position_index(seeds_dir: Path) -> Dict[str, Dict[str, str]]:
    path = seeds_dir / "social_position_archetypes_v1.csv"
    if not path.exists():
        return {}
    idx: Dict[str, Dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            idx[row["id"]] = row
    return idx


def propose_role_position(
    row: Dict[str, str],
    manual: Dict[str, str],
    position_index: Dict[str, Dict[str, str]],
) -> Tuple[Optional[str], str, bool, str, str]:
    role_id = (row.get("role_id") or row.get("id") or "").strip()
    if role_id in manual:
        return manual[role_id], "manual_map", False, "", ""
    if role_id in EXPLICIT_ROLE_MAP:
        return EXPLICIT_ROLE_MAP[role_id], "explicit_map", False, "", ""

    explicit_tsv = (row.get("social_position_archetype_id") or "").strip()
    if explicit_tsv and explicit_tsv in position_index:
        return explicit_tsv, "tsv_explicit", False, "", ""

    group = norm(row.get("role_group"))
    freedom = norm(row.get("freedom_status"))
    dependency = norm(row.get("dependency_type"))
    historical = norm(row.get("historical_term") or row.get("role_title"))

    candidates = ROLE_GROUP_HINTS.get(group, [])
    if "долг" in dependency or "закуп" in historical:
        return "debt_dependent_commoner", "freedom_dependency", True, "debt signal", ""
    if "холоп" in historical or "несвобод" in freedom:
        return "unfree_household_dependent", "freedom_dependency", True, "unfree signal", ""
    if "изгой" in historical:
        return "displaced_status_lost_outsider", "historical_term", True, "outcast term", ""
    if "гость" in historical and "иностр" in historical:
        return "foreign_privileged_merchant_outsider", "historical_term", True, "foreign guest", ""
    if "гость" in historical and "куп" in historical:
        return "privileged_long_distance_merchant", "historical_term", True, "merchant guest", ""
    if "смерд" in historical or group == "село":
        return "free_rural_householder_commoner", "role_group_hint", True, f"group={group}", ""
    if len(candidates) == 1:
        pos = candidates[0]
        if pos in position_index:
            return pos, "role_group_singleton", True, f"group={group}", ""
    if candidates:
        return None, "ambiguous", True, f"multi candidate for group={group}", f"candidates={','.join(candidates)}"
    return None, "unmapped", True, "no mapping rule", "blocking_issue=missing_position_archetype"


def propose_occupation(
    row: Dict[str, str],
    manual: Dict[str, str],
) -> Tuple[Optional[str], str, bool, str]:
    occ_id = (row.get("occupation_id") or row.get("id") or "").strip()
    if occ_id in manual:
        return manual[occ_id], "manual_map", False, ""
    explicit = (row.get("occupation_archetype_id") or "").strip()
    if explicit:
        return explicit, "tsv_explicit", False, ""

    group = norm(row.get("occupation_group"))
    title = norm(row.get("occupation_title") or row.get("title"))
    for needle, occ in OCC_TITLE_OVERRIDES.items():
        if needle in title:
            return occ, "title_override", True, f"title contains {needle}"
    base = OCC_GROUP_BASE.get(group)
    if base:
        return base, "group_base", True, f"group={group}"
    return None, "unmapped", True, "no occupation archetype rule"


def mapping_review_for(confidence: str, review_required: bool, has_position: bool) -> str:
    if not has_position:
        return "pending"
    if review_required:
        return "accepted_with_caution" if confidence == "medium" else "pending"
    if confidence == "high":
        return "approved"
    if confidence == "medium":
        return "accepted_with_caution"
    return "pending"


def write_csv(path: Path, fieldnames: List[str], rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def build_role_map_rows(role_report: List[Dict[str, Any]], auto_approve: Optional[str]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for item in role_report:
        rid = item["source_role_id"]
        pos = item.get("proposed_social_position_archetype_id") or ""
        confidence = item.get("confidence") or "low"
        review_required = item.get("review_required") == "true"
        if not pos:
            review_status = "pending"
        elif auto_approve == "high" and confidence == "high" and not review_required:
            review_status = "approved"
        elif confidence == "medium" and not review_required:
            review_status = "accepted_with_caution"
        elif confidence == "high" and not review_required:
            review_status = "approved"
        else:
            review_status = "pending"
        rows.append({
            "source_role_id": rid,
            "social_position_archetype_id": pos,
            "review_status": review_status,
            "notes": item.get("mapping_method") or "",
        })
    return rows


def build_occ_map_rows(occ_report: List[Dict[str, Any]], auto_approve: Optional[str]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for item in occ_report:
        oid = item["source_occupation_id"]
        occ = item.get("proposed_occupation_archetype_id") or ""
        confidence = item.get("confidence") or "low"
        review_required = item.get("review_required") == "true"
        if not occ:
            review_status = "pending"
        elif auto_approve == "high" and confidence == "high" and not review_required:
            review_status = "approved"
        elif confidence in {"high", "medium"} and not review_required:
            review_status = "approved" if confidence == "high" else "accepted_with_caution"
        else:
            review_status = "pending"
        rows.append({
            "source_occupation_id": oid,
            "occupation_archetype_id": occ,
            "review_status": review_status,
            "notes": item.get("mapping_method") or "",
        })
    return rows


def enrich_roles(
    rows_in: List[Dict[str, str]],
    role_report: List[Dict[str, Any]],
    role_map: Dict[str, Dict[str, str]],
    position_index: Dict[str, Dict[str, str]],
) -> List[Dict[str, str]]:
    report_by_id = {r["source_role_id"]: r for r in role_report}
    out: List[Dict[str, str]] = []
    for row in rows_in:
        rid = row.get("role_id") or row.get("id") or ""
        enriched = dict(row)
        report = report_by_id.get(rid, {})
        approved = role_map.get(rid, {})
        pos_id = (
            (row.get("social_position_archetype_id") or "").strip()
            or (approved.get("social_position_archetype_id") or "").strip()
            or (report.get("proposed_social_position_archetype_id") or "").strip()
        )
        confidence = report.get("confidence") or ("high" if pos_id else "low")
        review_required = report.get("review_required") == "true"
        review_status = (approved.get("review_status") or "").strip() or mapping_review_for(
            confidence, review_required, bool(pos_id)
        )
        if norm(row.get("status")) in ACTIVE_STATUSES and pos_id and review_status == "pending" and confidence == "high":
            review_status = "approved"

        pos = position_index.get(pos_id or "", {})
        enriched["social_position_archetype_id"] = pos_id
        enriched["social_class_id"] = pos.get("social_class_id", "")
        enriched["role_archetype_id"] = pos.get("role_archetype_id", "")
        enriched["legal_status_archetype_id"] = pos.get("legal_status_archetype_id", infer_legal(row.get("freedom_status", "")))
        enriched["dependency_archetype_id"] = pos.get("dependency_archetype_id", infer_dependency(row.get("dependency_type", "")))
        enriched["mobility_archetype_id"] = pos.get("mobility_archetype_id", "")
        enriched["mapping_review_status"] = review_status
        enriched["mapping_confidence"] = confidence
        enriched["mapping_notes"] = report.get("mapping_method") or approved.get("notes") or ""
        out.append(enriched)
    return out


def enrich_occupations(
    rows_in: List[Dict[str, str]],
    occ_report: List[Dict[str, Any]],
    occ_map: Dict[str, Dict[str, str]],
) -> List[Dict[str, str]]:
    report_by_id = {r["source_occupation_id"]: r for r in occ_report}
    out: List[Dict[str, str]] = []
    for row in rows_in:
        oid = row.get("occupation_id") or row.get("id") or ""
        enriched = dict(row)
        report = report_by_id.get(oid, {})
        approved = occ_map.get(oid, {})
        occ_id = (
            (row.get("occupation_archetype_id") or "").strip()
            or (approved.get("occupation_archetype_id") or "").strip()
            or (report.get("proposed_occupation_archetype_id") or "").strip()
        )
        confidence = report.get("confidence") or ("high" if occ_id else "low")
        review_required = report.get("review_required") == "true"
        review_status = (approved.get("review_status") or "").strip() or mapping_review_for(
            confidence, review_required, bool(occ_id)
        )
        if norm(row.get("status")) in ACTIVE_STATUSES and occ_id and review_status == "pending" and confidence in {"high", "medium"}:
            review_status = "approved" if confidence == "high" else "accepted_with_caution"

        enriched["occupation_archetype_id"] = occ_id
        enriched["mapping_review_status"] = review_status
        enriched["mapping_confidence"] = confidence
        enriched["mapping_notes"] = report.get("mapping_method") or approved.get("notes") or ""
        out.append(enriched)
    return out


def write_proposals(
    output_dir: Path,
    role_report: List[Dict[str, Any]],
    region_id: str = "region_novgorod_land",
) -> None:
    rows: List[Dict[str, str]] = []
    for item in role_report:
        if item.get("proposed_social_position_archetype_id"):
            continue
        rid = item["source_role_id"]
        rows.append({
            "id": f"proposal_role_{rid}",
            "source_region_id": region_id,
            "proposal_type": "social_position_archetype",
            "local_term": item.get("source_historical_term") or item.get("source_role_title") or rid,
            "why_existing_archetypes_not_enough": item.get("blocking_issue") or item.get("ambiguity_reason") or "unmapped regional role",
            "proposed_archetype_payload": json.dumps({
                "source_role_id": rid,
                "fingerprint": {
                    "role_group": item.get("source_role_group"),
                    "freedom_status": item.get("source_freedom_status"),
                    "dependency_type": item.get("source_dependency_type"),
                },
                "nearest_existing_archetype_id": "",
            }, ensure_ascii=False),
            "review_status": "needs_review",
            "status": "needs_review",
            "confidence": "low",
        })
    if rows:
        write_csv(
            output_dir / "universal_archetype_proposals_from_novgorod_v1.csv",
            list(rows[0].keys()),
            rows,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill Novgorod social/occupation archetype mappings")
    parser.add_argument("--roles-tsv", default="data/novgorod-region/novgorod_social_roles_v1.tsv")
    parser.add_argument("--occupations-tsv", default="data/novgorod-region/novgorod_occupations_v1.tsv")
    parser.add_argument("--seeds-dir", default="data/world-base-seeds")
    parser.add_argument("--output-dir", default="data/world-base-seeds")
    parser.add_argument("--write-enriched-tsv", action="store_true")
    parser.add_argument("--update-maps", action="store_true")
    parser.add_argument("--auto-approve-confidence", choices=["high", "medium"], default=None)
    args = parser.parse_args()

    seeds_dir = Path(args.seeds_dir)
    output_dir = Path(args.output_dir)
    roles_path = Path(args.roles_tsv)
    occ_path = Path(args.occupations_tsv)
    position_index = load_position_index(seeds_dir)
    role_map_path = seeds_dir / "novgorod_role_position_map_v1.csv"
    occ_map_path = seeds_dir / "novgorod_occupation_archetype_map_v1.csv"
    role_manual = read_manual_map(role_map_path, "source_role_id", "social_position_archetype_id")
    occ_manual = read_manual_map(occ_map_path, "source_occupation_id", "occupation_archetype_id")

    role_rows_in = read_tsv(roles_path)
    occ_rows_in = read_tsv(occ_path)

    role_report: List[Dict[str, Any]] = []
    for row in role_rows_in:
        pos_id, method, review, ambiguity, blocking = propose_role_position(row, role_manual, position_index)
        pos = position_index.get(pos_id or "", {})
        role_report.append({
            "source_role_id": row.get("role_id") or row.get("id"),
            "source_role_title": row.get("role_title") or row.get("title"),
            "source_historical_term": row.get("historical_term"),
            "source_role_group": row.get("role_group"),
            "source_freedom_status": row.get("freedom_status"),
            "source_dependency_type": row.get("dependency_type"),
            "proposed_social_position_archetype_id": pos_id or "",
            "proposed_social_class_id": pos.get("social_class_id", ""),
            "proposed_role_archetype_id": pos.get("role_archetype_id", ""),
            "proposed_legal_status_archetype_id": pos.get("legal_status_archetype_id", infer_legal(row.get("freedom_status", ""))),
            "proposed_dependency_archetype_id": pos.get("dependency_archetype_id", infer_dependency(row.get("dependency_type", ""))),
            "proposed_mobility_archetype_id": pos.get("mobility_archetype_id", ""),
            "mapping_method": method,
            "confidence": "high" if method in {"manual_map", "tsv_explicit", "explicit_map"} else ("medium" if pos_id else "low"),
            "review_required": "true" if review else "false",
            "ambiguity_reason": ambiguity,
            "blocking_issue": blocking,
        })

    occ_report: List[Dict[str, Any]] = []
    skill_defaults_path = seeds_dir / "occupation_skill_defaults_v1.csv"
    skill_by_occ: Dict[str, Dict[str, str]] = {}
    if skill_defaults_path.exists():
        with skill_defaults_path.open("r", encoding="utf-8-sig", newline="") as f:
            for srow in csv.DictReader(f):
                skill_by_occ[srow["occupation_archetype_id"]] = srow

    for row in occ_rows_in:
        occ_arch, method, review, ambiguity = propose_occupation(row, occ_manual)
        skills = skill_by_occ.get(occ_arch or "", {})
        occ_report.append({
            "source_occupation_id": row.get("occupation_id") or row.get("id"),
            "source_occupation_title": row.get("occupation_title") or row.get("title"),
            "source_historical_term": row.get("historical_term"),
            "source_occupation_group": row.get("occupation_group"),
            "proposed_occupation_archetype_id": occ_arch or "",
            "proposed_primary_skill_ids": skills.get("primary_skill_ids", "[]"),
            "proposed_secondary_skill_ids": skills.get("secondary_skill_ids", "[]"),
            "mapping_method": method,
            "confidence": "high" if method in {"manual_map", "tsv_explicit"} else ("medium" if occ_arch else "low"),
            "review_required": "true" if review else "false",
            "ambiguity_reason": ambiguity,
        })

    write_csv(
        output_dir / "novgorod_role_backfill_report_v1.csv",
        list(role_report[0].keys()) if role_report else [
            "source_role_id", "proposed_social_position_archetype_id", "confidence", "review_required"
        ],
        role_report,
    )
    write_csv(
        output_dir / "novgorod_occupation_backfill_report_v1.csv",
        list(occ_report[0].keys()) if occ_report else [
            "source_occupation_id", "proposed_occupation_archetype_id", "confidence", "review_required"
        ],
        occ_report,
    )
    write_proposals(output_dir, role_report)

    role_map_rows = build_role_map_rows(role_report, args.auto_approve_confidence)
    occ_map_rows = build_occ_map_rows(occ_report, args.auto_approve_confidence)
    if args.update_maps:
        write_csv(role_map_path, ["source_role_id", "social_position_archetype_id", "review_status", "notes"], role_map_rows)
        write_csv(occ_map_path, ["source_occupation_id", "occupation_archetype_id", "review_status", "notes"], occ_map_rows)

    role_map_by_id = {r["source_role_id"]: r for r in role_map_rows}
    occ_map_by_id = {r["source_occupation_id"]: r for r in occ_map_rows}

    if args.write_enriched_tsv:
        roles_enriched = enrich_roles(role_rows_in, role_report, role_map_by_id, position_index)
        occ_enriched = enrich_occupations(occ_rows_in, occ_report, occ_map_by_id)
        roles_out = roles_path.parent / "novgorod_social_roles_v1_enriched.tsv"
        occ_out = occ_path.parent / "novgorod_occupations_v1_enriched.tsv"
        role_fields = list(role_rows_in[0].keys()) + [c for c in ROLE_ENRICHED_COLUMNS if c not in role_rows_in[0]]
        occ_fields = list(occ_rows_in[0].keys()) + [c for c in OCC_ENRICHED_COLUMNS if c not in occ_rows_in[0]]
        write_tsv(roles_out, role_fields, roles_enriched)
        write_tsv(occ_out, occ_fields, occ_enriched)

    unmapped_roles = sum(1 for r in role_report if not r.get("proposed_social_position_archetype_id"))
    unmapped_occ = sum(1 for r in occ_report if not r.get("proposed_occupation_archetype_id"))
    approved_roles = sum(1 for r in role_map_rows if r.get("review_status") in {"approved", "accepted_with_caution"} and r.get("social_position_archetype_id"))
    print(json.dumps({
        "roles_input": str(roles_path),
        "roles_rows": len(role_rows_in),
        "occupations_rows": len(occ_rows_in),
        "unmapped_roles": unmapped_roles,
        "unmapped_occupations": unmapped_occ,
        "approved_role_mappings": approved_roles,
        "role_map_rows": len(role_map_rows),
        "occupation_map_rows": len(occ_map_rows),
        "role_report": str(output_dir / "novgorod_role_backfill_report_v1.csv"),
        "occupation_report": str(output_dir / "novgorod_occupation_backfill_report_v1.csv"),
        "write_enriched_tsv": bool(args.write_enriched_tsv),
        "update_maps": bool(args.update_maps),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
