#!/usr/bin/env python3
"""Add universal social ontology FKs to novgorod_key_npc_seeds_v1.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "tools" / "rus13-novgorod-regional-templates" / "novgorod_key_npc_seeds_v1.json"

SEED_ONTOLOGY = {
    "seed_hist_npc_aleksandr_yaroslavich": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_yaroslav_vsevolodovich": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_fedor_yaroslavich": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_spiridon_archbishop": {
        "social_class_id": "ecclesiastical_elite",
        "role_archetype_id": "cleric",
        "social_position_archetype_id": "high_ecclesiastical_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_dalmat_archbishop": {
        "social_class_id": "ecclesiastical_elite",
        "role_archetype_id": "cleric",
        "social_position_archetype_id": "high_ecclesiastical_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_stepan_tverdislavich": {
        "social_class_id": "urban_elite",
        "role_archetype_id": "official_manager",
        "social_position_archetype_id": "urban_elite_office_holder",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_mikhail_stepanich": {
        "social_class_id": "urban_elite",
        "role_archetype_id": "official_manager",
        "social_position_archetype_id": "urban_elite_office_holder",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_batu_khan": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
        "mapping_notes": "nearest universal ruler; steppe_imperial_ruler proposal pending review",
    },
    "seed_hist_npc_birger_magnusson": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_hermann_dorpat": {
        "social_class_id": "ecclesiastical_elite",
        "role_archetype_id": "cleric",
        "social_position_archetype_id": "high_ecclesiastical_ruler",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_andreas_von_velven": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "armed_retainer",
        "social_position_archetype_id": "military_officer_elite",
        "occupation_archetype_id": None,
    },
    "seed_hist_npc_mindaugas": {
        "social_class_id": "ruling_dynastic_elite",
        "role_archetype_id": "ruler",
        "social_position_archetype_id": "regional_dynastic_ruler",
        "occupation_archetype_id": None,
    },
}


def patch_seed(seed: dict) -> None:
    mapping = SEED_ONTOLOGY.get(seed.get("npc_seed_id") or "")
    if not mapping:
        return
    for key, value in mapping.items():
        if key == "mapping_notes":
            seed["mapping_notes"] = value
            continue
        seed[key] = value


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    for seed in data.get("historical_key_npc_seeds", []):
        patch_seed(seed)
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"patched {PATH}")


if __name__ == "__main__":
    main()
