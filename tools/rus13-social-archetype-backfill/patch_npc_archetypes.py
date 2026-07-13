#!/usr/bin/env python3
"""Patch novgorod_npc_archetypes_v1.json with universal archetype allow-lists."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "tools" / "rus13-novgorod-regional-templates" / "novgorod_npc_archetypes_v1.json"

POSITION_BY_ARCHETYPE = {
    "bg_market_onlooker": ["free_urban_householder", "urban_merchant_trader"],
    "bg_yard_family_member": ["free_urban_householder", "dependent_servant_household"],
    "bg_road_traveler": ["transport_worker_itinerant", "traveler_guide_itinerant"],
    "bg_church_parishioner": ["parish_cleric", "monastic_community_member", "ecclesiastical_household_agent"],
    "bg_forest_worker": ["forest_water_producer_commoner"],
    "scene_ferryman": ["transport_worker_itinerant", "traveler_guide_itinerant"],
    "scene_market_seller": ["urban_merchant_trader", "privileged_long_distance_merchant"],
    "scene_householder": ["free_urban_householder", "free_rural_householder_commoner"],
    "scene_priest": ["parish_cleric", "ecclesiastical_official_manager"],
    "scene_guard": ["guard_watchman_service", "armed_retainer_service"],
    "key_local_elder_template": ["landholding_notable_rural", "free_rural_householder_commoner", "urban_elite_office_holder"],
    "key_merchant_house_template": ["urban_merchant_trader", "privileged_long_distance_merchant"],
    "key_monastery_official_template": ["ecclesiastical_official_manager", "ecclesiastical_household_agent", "high_ecclesiastical_ruler"],
}

OCC_ARCH_BY_ARCHETYPE = {
    "bg_market_onlooker": ["trade_exchange"],
    "bg_yard_family_member": ["domestic_service"],
    "bg_road_traveler": ["transport_guiding"],
    "bg_church_parishioner": ["religious_literate"],
    "bg_forest_worker": ["forest_hunting", "fishing_water"],
    "scene_ferryman": ["transport_guiding"],
    "scene_market_seller": ["trade_exchange"],
    "scene_householder": ["agriculture", "domestic_service", "craft_production"],
    "scene_priest": ["religious_literate"],
    "scene_guard": ["military_security"],
    "key_local_elder_template": ["administration_law", "agriculture"],
    "key_merchant_house_template": ["trade_exchange"],
    "key_monastery_official_template": ["religious_literate", "administration_law"],
}


def patch_list(items: list) -> None:
    for archetype in items:
        aid = archetype.get("archetype_id")
        if "allowed_roles" in archetype and "allowed_regional_roles" not in archetype:
            archetype["allowed_regional_roles"] = archetype.pop("allowed_roles")
        if "allowed_occupations" in archetype and "allowed_regional_occupations" not in archetype:
            archetype["allowed_regional_occupations"] = archetype.pop("allowed_occupations")
        archetype["allowed_social_position_archetypes"] = POSITION_BY_ARCHETYPE.get(aid, [])
        archetype["allowed_occupation_archetypes"] = OCC_ARCH_BY_ARCHETYPE.get(aid, [])


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    for key in [
        "background_npc_archetypes",
        "scene_npc_archetypes",
        "key_npc_archetypes",
        "historical_key_npc_archetypes",
    ]:
        if isinstance(data.get(key), list):
            patch_list(data[key])
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"patched {PATH}")


if __name__ == "__main__":
    main()
