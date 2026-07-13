#!/usr/bin/env python3
"""
RUS13 world_base importer v1.

Imports the current reference workbook/TSV/JSON package into PostgreSQL schema
`world_base`, or emits a deterministic SQL seed file for review.

Design constraints:
- does not invent world facts;
- preserves unknown/unmapped fields in audit_notes when possible;
- normalizes only technical enum/ID differences needed for schema validity;
- supports dry-run validation before writing.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import pandas as pd
except ImportError as exc:
    raise SystemExit("Missing dependency: pandas. Install with: pip install pandas openpyxl") from exc

SCHEMA_NAME = "world_base"
NOW_UTC = "2026-07-06T00:00:00Z"

# Minimal column allow-list copied from world_base_schema_reference.md for all
# tables directly imported by this package. Unknown fields are not thrown away:
# preserve_extra_fields() appends them into audit_notes.
TABLE_COLUMNS: Dict[str, List[str]] = {
    "source_records": [
        "id", "title", "slug", "source_type", "author", "publication_year",
        "period_covered", "region_covered", "url", "file_reference", "page_or_section",
        "quote_short", "summary", "reliability_level", "bias_notes", "usefulness",
        "limitations", "checked_by", "checked_at", "status", "confidence", "audit_notes",
        "created_at", "updated_at"
    ],
    "graph_scale_rules": [
        "id", "scale_level", "title", "unit", "typical_edge_min", "typical_edge_max",
        "time_unit", "uses_gu", "uses_minutes", "summary", "game_use", "limits",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "graph_edge_modifiers": [
        "id", "title", "modifier_type", "applies_to_edge_type", "applies_to_terrain_type",
        "applies_to_season", "multiplier", "summary", "example", "game_use", "limits",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "landscape_templates": [
        "id", "slug", "title", "parent_landscape_template_id", "landscape_group",
        "base_environment", "dominant_vegetation", "forest_type", "moisture_level",
        "relief_type", "soil_ground_type", "openness", "seasonal_stability", "summary",
        "base_movement_multiplier", "default_orientation_difficulty", "base_risk_level",
        "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "water_body_templates": [
        "id", "slug", "title", "summary", "water_body_type", "salinity", "flow_type",
        "typical_depth", "typical_width", "drinkable_default", "supports_boat",
        "supports_fishing", "supports_ford", "supports_ferry", "supports_bridge",
        "supports_winter_crossing", "freeze_pattern", "flood_risk", "base_crossing_risk",
        "navigation_use", "water_hazard_notes", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "route_templates": [
        "id", "slug", "title", "summary", "route_kind", "default_edge_type", "surface_type",
        "requires_landscape_template", "requires_water_body_template", "supports_pedestrian",
        "supports_horse", "supports_cart", "supports_sled", "supports_boat", "seasonal_availability",
        "default_access_rule", "default_orientation_difficulty", "default_risk_level",
        "default_movement_multiplier", "game_use", "limits", "status", "confidence", "sources",
        "audit_notes", "created_at", "updated_at"
    ],
    "land_use_templates": [
        "id", "slug", "title", "summary", "land_use_kind", "requires_settlement_nearby",
        "requires_water_nearby", "requires_specific_landscape", "compatible_landscape_template_ids",
        "compatible_water_body_template_ids", "seasonal_pattern", "labor_intensity", "economic_use",
        "visibility_effect", "movement_effect", "risk_effect", "game_use", "limits", "status",
        "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "place_templates": [
        "id", "slug", "title", "summary", "place_kind", "default_node_type",
        "can_exist_inside_landscape", "requires_water_nearby", "requires_route_nearby",
        "requires_land_use", "compatible_landscape_template_ids", "compatible_water_body_template_ids",
        "compatible_route_template_ids", "compatible_land_use_template_ids", "typical_scale_level",
        "settlement_density_effect", "access_logic", "social_logic", "economic_logic",
        "defense_logic", "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "regions": [
        "id", "slug", "canonical_name", "display_name", "alt_names", "region_type",
        "parent_region_id", "period_start_year", "period_end_year", "summary", "geographic_scope",
        "natural_landscape", "climate_summary", "seasonal_rules", "waterways_summary",
        "roads_summary", "settlement_logic_summary", "political_summary", "ruling_power",
        "administrative_structure", "law_summary", "custom_summary", "religion_summary",
        "social_order_summary", "economy_summary", "military_pressure_summary",
        "historical_context_summary", "neighbor_regions", "external_pressure_summary",
        "common_risks_summary", "npc_common_knowledge_summary", "llm_generation_rules",
        "llm_forbidden_assumptions", "llm_context_summary", "validation_notes", "status",
        "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "region_neighbors": [
        "id", "region_id", "neighbor_region_id", "direction", "border_type", "connection_type",
        "trade_connection", "military_pressure", "political_relation", "cultural_relation",
        "religious_relation", "route_connection_summary", "known_to_commoners", "known_to_traders",
        "known_to_elites", "known_to_clergy", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "region_landscape_templates": [
        "id", "region_id", "landscape_template_id", "is_allowed", "is_common", "is_dominant",
        "is_rare", "generation_weight", "allowed_scale_levels", "allowed_node_types",
        "regional_limits", "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "region_water_body_templates": [
        "id", "region_id", "water_body_template_id", "is_allowed", "is_common", "is_dominant",
        "is_rare", "generation_weight", "allowed_scale_levels", "allowed_node_types",
        "regional_limits", "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "region_land_use_templates": [
        "id", "region_id", "land_use_template_id", "is_allowed", "is_common", "is_rare",
        "generation_weight", "allowed_scale_levels", "allowed_node_types", "regional_limits",
        "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "region_place_templates": [
        "id", "region_id", "place_template_id", "is_allowed", "is_common", "is_rare",
        "generation_weight", "allowed_scale_levels", "allowed_node_types", "regional_limits",
        "game_use", "limits", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "social_classes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "social_role_archetypes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "legal_status_archetypes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "dependency_archetypes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "mobility_archetypes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "social_position_archetypes": [
        "id", "slug", "title", "social_class_id", "role_archetype_id",
        "legal_status_archetype_id", "dependency_archetype_id", "mobility_archetype_id",
        "property_rights_model", "weapon_rights_model", "court_voice_model",
        "typical_power_over_others", "typical_power_over_them", "summary", "game_use", "limits",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "class_role_rules": [
        "social_class_id", "role_archetype_id", "is_allowed", "notes", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "occupation_archetypes": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "skill_catalog": [
        "id", "slug", "title", "summary", "game_use", "limits", "status", "confidence",
        "sources", "audit_notes", "created_at", "updated_at"
    ],
    "occupation_skill_defaults": [
        "occupation_archetype_id", "primary_skill_ids", "secondary_skill_ids", "gate_skill_ids",
        "forbidden_skill_ids", "default_level_logic", "status", "confidence", "sources",
        "audit_notes", "created_at", "updated_at"
    ],
    "role_occupation_rules": [
        "role_archetype_id", "occupation_archetype_id", "is_allowed", "notes", "status",
        "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "universal_archetype_proposals": [
        "id", "source_region_id", "proposal_type", "local_term",
        "why_existing_archetypes_not_enough", "proposed_archetype_payload", "affected_regions",
        "review_status", "review_notes", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "region_social_roles": [
        "id", "region_id", "title", "slug", "role_group",
        "social_position_archetype_id", "social_class_id", "role_archetype_id",
        "legal_status_archetype_id", "dependency_archetype_id", "mobility_archetype_id",
        "mapping_review_status", "mapping_confidence", "mapping_notes",
        "status_level", "free_status",
        "dependency_type", "wealth_level", "legal_capacity", "mobility_level", "social_respect",
        "vulnerability_level", "allowed_occupations", "forbidden_occupations", "allowed_weapons",
        "forbidden_weapons", "allowed_places", "restricted_places", "property_rights", "travel_rights",
        "trade_rights", "court_rights", "tax_obligations", "service_obligations",
        "typical_clothing", "typical_equipment", "typical_knowledge", "typical_speech_register",
        "typical_fears", "typical_goals", "who_commands_them", "who_protects_them",
        "who_can_punish_them", "relation_to_church", "relation_to_power",
        "npc_generation_rules", "player_character_rules", "game_use", "limits", "status",
        "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "region_occupations": [
        "id", "region_id", "title", "slug", "occupation_group",
        "occupation_archetype_id", "mapping_review_status", "mapping_confidence", "mapping_notes",
        "summary",
        "allowed_social_roles", "forbidden_social_roles", "typical_status", "typical_wealth",
        "typical_gender_age_rules", "required_location_types", "required_economy_types",
        "required_tools", "required_materials", "produced_goods", "services_provided",
        "seasonality", "work_rhythm", "income_logic", "typical_skills", "typical_attributes",
        "typical_clothing", "typical_equipment", "typical_risks", "typical_knowledge",
        "typical_contacts", "settlement_generation_weight", "npc_generation_weight", "rarity",
        "is_historical_fact", "is_generated_allowed", "game_use", "limits", "status",
        "confidence", "sources", "audit_notes", "created_at", "updated_at"
    ],
    "graph_nodes": [
        "id", "slug", "title", "node_type", "scale_level", "parent_node_id", "region_id",
        "place_id", "grid_x", "grid_y", "grid_z", "region_cell_code", "cell_shape",
        "region_cell_status", "cell_size_km", "crossing_base_gu", "crossing_base_time_hours",
        "primary_landscape_template_id", "secondary_landscape_template_ids", "landscape_mix_notes",
        "primary_water_body_template_id", "secondary_water_body_template_ids", "hydrology_notes",
        "land_use_template_ids", "place_template_id", "terrain_profile", "water_profile",
        "road_profile", "settlement_density", "dominant_content", "known_landmarks",
        "canonical_corridors", "neighbor_node_ids", "historical_status", "is_known_to_player_default",
        "is_known_to_character_default", "summary", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "graph_edges": [
        "id", "from_node_id", "to_node_id", "reverse_edge_id", "scale_level", "edge_type",
        "base_gu", "base_distance_km", "base_time_minutes", "base_time_hours", "base_time_days",
        "route_template_id", "landscape_template_id", "water_body_template_id", "terrain_type",
        "route_surface", "seasonal_rule", "access_rule", "risk_level", "known_to_commoners",
        "known_to_traders", "known_to_elites", "known_to_clergy", "known_to_character_default",
        "requires_guide", "requires_boat", "requires_horse", "requires_sled", "requires_permission",
        "requires_orientation_check", "orientation_difficulty", "movement_risk_profile",
        "failure_consequences", "historical_status", "status", "confidence", "sources", "audit_notes",
        "created_at", "updated_at"
    ],
    "historical_anchors": [
        "id", "region_id", "place_id", "slug", "canonical_name", "display_name",
        "anchor_type", "summary", "historical_status", "period_start_year", "period_end_year",
        "approximate_bearing", "distance_band", "zone_of_influence", "access_graph_edges",
        "visible_signs", "economic_influence", "political_influence", "religious_influence",
        "military_influence", "trade_influence", "character_knowledge_common",
        "character_knowledge_trader", "character_knowledge_elite", "character_knowledge_clergy",
        "character_knowledge_outsider", "discovery_conditions", "llm_use_rules",
        "llm_forbidden_changes", "game_use", "limits", "status", "confidence", "sources",
        "audit_notes", "created_at", "updated_at"
    ],
}

JSONB_COLUMNS = {
    "sources", "alt_names", "seasonal_rules", "neighbor_regions", "llm_generation_rules",
    "llm_forbidden_assumptions", "allowed_scale_levels", "allowed_node_types",
    "compatible_landscape_template_ids", "compatible_water_body_template_ids",
    "compatible_route_template_ids", "compatible_land_use_template_ids", "allowed_occupations",
    "forbidden_occupations", "allowed_weapons", "forbidden_weapons", "allowed_places",
    "restricted_places", "typical_equipment", "typical_knowledge", "typical_fears",
    "typical_goals", "npc_generation_rules", "player_character_rules", "allowed_social_roles",
    "forbidden_social_roles", "required_location_types", "required_economy_types",
    "required_tools", "required_materials", "produced_goods", "services_provided",
    "typical_skills", "typical_attributes", "typical_risks", "typical_contacts",
    "secondary_landscape_template_ids", "secondary_water_body_template_ids",
    "land_use_template_ids", "known_landmarks", "canonical_corridors", "neighbor_node_ids",
    "movement_risk_profile", "failure_consequences", "access_graph_edges", "visible_signs",
    "discovery_conditions", "llm_use_rules", "llm_forbidden_changes",
    "primary_skill_ids", "secondary_skill_ids", "gate_skill_ids", "forbidden_skill_ids",
    "proposed_archetype_payload", "affected_regions"
}

BOOL_COLUMNS = {
    "uses_gu", "uses_minutes", "supports_boat", "supports_fishing", "supports_ford",
    "supports_ferry", "supports_bridge", "supports_winter_crossing", "requires_landscape_template",
    "requires_water_body_template", "supports_pedestrian", "supports_horse", "supports_cart",
    "supports_sled", "requires_settlement_nearby", "requires_water_nearby",
    "requires_specific_landscape", "can_exist_inside_landscape", "requires_route_nearby",
    "requires_land_use", "is_allowed", "is_common", "is_dominant", "is_rare",
    "is_historical_fact", "is_generated_allowed", "is_known_to_player_default",
    "is_known_to_character_default", "requires_guide", "requires_boat", "requires_horse",
    "requires_sled", "requires_permission", "requires_orientation_check", "is_allowed"
}

NUMERIC_COLUMNS = {
    "typical_edge_min", "typical_edge_max", "multiplier", "base_movement_multiplier",
    "default_movement_multiplier", "generation_weight", "grid_x", "grid_y", "grid_z",
    "cell_size_km", "crossing_base_gu", "crossing_base_time_hours", "base_gu",
    "base_distance_km", "base_time_minutes", "base_time_hours", "base_time_days",
    "period_start_year", "period_end_year", "publication_year"
}

TABLE_ORDER = [
    "source_records",
    "graph_scale_rules",
    "graph_edge_modifiers",
    "landscape_templates",
    "water_body_templates",
    "route_templates",
    "land_use_templates",
    "place_templates",
    "regions",
    "region_landscape_templates",
    "region_water_body_templates",
    "region_land_use_templates",
    "region_place_templates",
    "region_neighbors",
    "social_classes",
    "social_role_archetypes",
    "legal_status_archetypes",
    "dependency_archetypes",
    "mobility_archetypes",
    "social_position_archetypes",
    "class_role_rules",
    "occupation_archetypes",
    "skill_catalog",
    "occupation_skill_defaults",
    "role_occupation_rules",
    "universal_archetype_proposals",
    "region_social_roles",
    "region_occupations",
    "graph_nodes",
    "graph_edges",
    "historical_anchors",
]

REQUIRED_COLUMNS = {
    "source_records": ["id"],
    "graph_scale_rules": ["id", "scale_level"],
    "graph_edge_modifiers": ["id"],
    "landscape_templates": ["id", "slug", "title", "base_environment"],
    "water_body_templates": ["id", "slug", "title", "water_body_type", "salinity"],
    "route_templates": ["id", "slug", "title"],
    "land_use_templates": ["id", "slug", "title"],
    "place_templates": ["id", "slug", "title"],
    "regions": ["id"],
    "region_neighbors": ["id", "region_id", "neighbor_region_id"],
    "region_landscape_templates": ["id", "region_id", "landscape_template_id"],
    "region_water_body_templates": ["id", "region_id", "water_body_template_id"],
    "region_land_use_templates": ["id", "region_id", "land_use_template_id"],
    "region_place_templates": ["id", "region_id", "place_template_id"],
    "social_classes": ["id", "slug", "title"],
    "social_role_archetypes": ["id", "slug", "title"],
    "legal_status_archetypes": ["id", "slug", "title"],
    "dependency_archetypes": ["id", "slug", "title"],
    "mobility_archetypes": ["id", "slug", "title"],
    "social_position_archetypes": [
        "id", "slug", "title", "social_class_id", "role_archetype_id",
        "legal_status_archetype_id", "dependency_archetype_id", "mobility_archetype_id"
    ],
    "class_role_rules": ["social_class_id", "role_archetype_id"],
    "occupation_archetypes": ["id", "slug", "title"],
    "skill_catalog": ["id", "slug", "title"],
    "occupation_skill_defaults": ["occupation_archetype_id"],
    "role_occupation_rules": ["role_archetype_id", "occupation_archetype_id"],
    "universal_archetype_proposals": ["id"],
    "region_social_roles": ["id", "region_id", "title"],
    "region_occupations": ["id", "region_id", "title"],
    "graph_nodes": ["id", "node_type", "scale_level", "region_id"],
    "graph_edges": ["id", "from_node_id", "to_node_id"],
    "historical_anchors": ["id", "region_id"],
}

ROLE_GROUP_MAP = {
    "власть": "official",
    "село": "peasant",
    "военное": "warrior",
    "церковь": "clergy",
    "город": "craftsman",
    "торговля": "merchant",
    "зависимые": "dependent",
    "дорога": "servant",
    "промысел": "peasant",
    "низкий_статус": "marginal",
}

OCCUPATION_GROUP_MAP = {
    "военное": "military",
    "дорога": "transport",
    "власть": "administration",
    "церковь": "religious",
    "город": "service",
    "торговля": "trade",
    "ремесло": "craft",
    "промысел": "forest",
    "село": "agriculture",
    "зависимые": "service",
    "низкий_статус": "service",
}

ALLOWED_HISTORICAL_ANCHOR_TYPES = {
    "city", "fortress", "monastery", "market", "river", "ford", "ferry", "road",
    "winter_road", "border", "battle_site", "princely_court", "bishopric"
}

ACTIVE_IMPORT_STATUSES = {"approved", "usable_with_caution"}
POSITION_DENORM_FIELDS = (
    "social_class_id",
    "role_archetype_id",
    "legal_status_archetype_id",
    "dependency_archetype_id",
    "mobility_archetype_id",
)
TABLES_WITH_POSITION_DENORM = ("region_social_roles", "historical_figures")

TABLE_CONFLICT_KEYS = {
    "class_role_rules": ("social_class_id", "role_archetype_id"),
    "role_occupation_rules": ("role_archetype_id", "occupation_archetype_id"),
    "occupation_skill_defaults": ("occupation_archetype_id",),
}

@dataclass
class Batch:
    table: str
    rows: List[Dict[str, Any]]
    dataset_name: str
    priority: int = 1000
    source_path: str = ""
    warnings: List[str] = field(default_factory=list)


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def clean_scalar(value: Any) -> Any:
    if is_missing(value):
        return None
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        if isinstance(value, pd.Timestamp):
            value = value.to_pydatetime()
        if isinstance(value, dt.datetime):
            return value.replace(microsecond=0).isoformat()
        return value.isoformat()
    return value


def parse_bool(value: Any) -> Optional[bool]:
    value = clean_scalar(value)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)
    s = str(value).strip().lower()
    if s in {"true", "t", "yes", "y", "1", "да", "истина"}:
        return True
    if s in {"false", "f", "no", "n", "0", "нет", "ложь"}:
        return False
    return None


def split_semicolon_list(text: str) -> List[str]:
    return [x.strip() for x in re.split(r"[;,]", text) if x.strip()]


def normalize_json_value(value: Any) -> Any:
    value = clean_scalar(value)
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        s = value.strip()
        if s == "":
            return []
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                return [s]
        if ";" in s or "," in s:
            return split_semicolon_list(s)
        return [s]
    return [value]


def normalize_value(column: str, value: Any) -> Any:
    value = clean_scalar(value)
    if column in JSONB_COLUMNS:
        return normalize_json_value(value)
    if column in BOOL_COLUMNS:
        return parse_bool(value)
    if column in NUMERIC_COLUMNS:
        if value is None:
            return None
        try:
            if isinstance(value, str) and value.strip() == "":
                return None
            f = float(value)
            if column in {"grid_x", "grid_y", "grid_z", "period_start_year", "period_end_year", "publication_year"}:
                return int(f)
            return f
        except (ValueError, TypeError):
            return None
    return value


def append_audit_note(existing: Any, note: str) -> str:
    existing = clean_scalar(existing)
    if existing:
        return f"{existing}\n{note}"
    return note


def preserve_extra_fields(row: Dict[str, Any], table: str) -> Dict[str, Any]:
    allowed = set(TABLE_COLUMNS[table])
    extra = {k: clean_scalar(v) for k, v in row.items() if k not in allowed and not is_missing(v)}
    out = {k: row.get(k) for k in TABLE_COLUMNS[table] if k in row}
    if extra:
        out["audit_notes"] = append_audit_note(
            out.get("audit_notes"),
            "Importer preserved unmapped source fields: " + json.dumps(extra, ensure_ascii=False, sort_keys=True),
        )
    return out


def normalize_row(row: Dict[str, Any], table: str) -> Dict[str, Any]:
    row = preserve_extra_fields(row, table)
    out: Dict[str, Any] = {}
    for col in TABLE_COLUMNS[table]:
        if col in row:
            val = normalize_value(col, row.get(col))
            if val is not None or col in JSONB_COLUMNS:
                out[col] = val
    if "status" in TABLE_COLUMNS[table] and "status" not in out:
        out["status"] = "draft"
    if "confidence" in TABLE_COLUMNS[table] and "confidence" not in out:
        out["confidence"] = "unknown"
    return out


def read_table(path: Path, fmt: str, sheet: Optional[str] = None) -> List[Dict[str, Any]]:
    if fmt == "csv":
        df = pd.read_csv(path, dtype=object)
    elif fmt == "tsv":
        df = pd.read_csv(path, sep="\t", dtype=object)
    elif fmt == "xlsx":
        df = pd.read_excel(path, sheet_name=sheet or 0, dtype=object)
    else:
        raise ValueError(f"Unsupported tabular format: {fmt}")
    df = df.where(pd.notnull(df), None)
    return [{str(k): clean_scalar(v) for k, v in rec.items()} for rec in df.to_dict("records")]


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9а-яё]+", "_", text, flags=re.I)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def normalize_region_id(raw: str) -> str:
    raw = clean_scalar(raw) or ""
    if raw.startswith("region_"):
        return raw
    return "region_" + raw


def transform_region_profile(path: Path, dataset: Dict[str, Any]) -> List[Batch]:
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("metadata", {})
    identity = data.get("region_identity", {})
    region_id = normalize_region_id(meta.get("region_id_aliases", [meta.get("region_id", "novgorod_land")])[0])
    sources = identity.get("sources") or [s.get("source_id") for s in meta.get("source_registry", []) if s.get("source_id")]
    row = {
        "id": region_id,
        "slug": meta.get("region_id") or "novgorod_land",
        "canonical_name": meta.get("region_title") or "Новгородская земля",
        "display_name": meta.get("region_title") or "Новгородская земля",
        "alt_names": meta.get("region_id_aliases", []),
        "region_type": "historical_land",
        "period_start_year": 1230,
        "period_end_year": 1250,
        "summary": identity.get("summary"),
        "geographic_scope": data.get("geography", {}).get("summary"),
        "natural_landscape": identity.get("game_model"),
        "climate_summary": data.get("climate_and_seasons", {}).get("summary"),
        "seasonal_rules": data.get("climate_and_seasons", {}).get("seasons", []),
        "waterways_summary": data.get("geography", {}).get("summary"),
        "roads_summary": data.get("movement_and_routes", {}).get("summary"),
        "settlement_logic_summary": data.get("settlement_logic", {}).get("summary"),
        "political_summary": data.get("political_order", {}).get("summary"),
        "law_summary": data.get("law_and_custom", {}).get("summary"),
        "religion_summary": data.get("religion", {}).get("summary"),
        "social_order_summary": data.get("social_order", {}).get("summary"),
        "economy_summary": data.get("economy", {}).get("summary"),
        "historical_context_summary": "1230-1250 regional frame; detailed timeline imported separately or used by LLM context packs.",
        "neighbor_regions": [],
        "common_risks_summary": data.get("risks", {}).get("summary"),
        "npc_common_knowledge_summary": data.get("knowledge_rules", {}).get("summary"),
        "llm_generation_rules": data.get("llm_generation_limits", {}),
        "llm_forbidden_assumptions": data.get("validation", {}).get("forbidden_assumptions", []),
        "llm_context_summary": identity.get("game_model"),
        "validation_notes": meta.get("audit_note"),
        "status": identity.get("status") or meta.get("status") or "draft",
        "confidence": identity.get("confidence") or meta.get("confidence") or "medium",
        "sources": sources,
        "audit_notes": "Generated from novgorod_region_profile_v1.json by importer; no new region facts were added.",
    }
    return [Batch(table="regions", rows=[normalize_row(row, "regions")], dataset_name=dataset["name"], priority=dataset.get("priority", 0), source_path=str(path))]


def transform_region_neighbors(path: Path, dataset: Dict[str, Any]) -> List[Batch]:
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("metadata", {})
    sources = [s.get("source_id") for s in meta.get("source_registry", []) if s.get("source_id")]
    region_id = normalize_region_id(meta.get("region_id", "novgorod_land"))
    rows_neighbors: List[Dict[str, Any]] = []
    rows_regions: List[Dict[str, Any]] = []
    seen_region_ids = set()
    for n in data.get("neighbor_regions", []):
        raw_neighbor = n.get("neighbor_region_id")
        neighbor_id = normalize_region_id(raw_neighbor)
        title = n.get("neighbor_region_title") or raw_neighbor
        if neighbor_id not in seen_region_ids:
            seen_region_ids.add(neighbor_id)
            rows_regions.append(normalize_row({
                "id": neighbor_id,
                "slug": raw_neighbor,
                "canonical_name": title,
                "display_name": title,
                "region_type": "historical_land_stub",
                "period_start_year": 1230,
                "period_end_year": 1250,
                "summary": "Minimal neighboring-region stub generated only to satisfy region_neighbors FK. Full regional passport must be imported separately.",
                "status": "needs_review",
                "confidence": "medium_low",
                "sources": sources,
                "audit_notes": "FK stub from novgorod_neighbor_regions_v1.json; not a full region record.",
            }, "regions"))
        row = {
            "id": f"rn_{region_id.replace('region_', '')}_{neighbor_id.replace('region_', '')}",
            "region_id": region_id,
            "neighbor_region_id": neighbor_id,
            "direction": n.get("direction_from_novgorod"),
            "border_type": ",".join(n.get("relationship_type", [])) if isinstance(n.get("relationship_type"), list) else n.get("relationship_type"),
            "connection_type": n.get("relationship_summary"),
            "trade_connection": json.dumps(n.get("trade_connection", {}), ensure_ascii=False),
            "military_pressure": json.dumps(n.get("military_and_security_pressure", {}), ensure_ascii=False),
            "political_relation": json.dumps(n.get("political_relation", {}), ensure_ascii=False),
            "cultural_relation": json.dumps(n.get("religious_and_cultural_connection", {}).get("cultural_notes", []), ensure_ascii=False),
            "religious_relation": json.dumps(n.get("religious_and_cultural_connection", {}), ensure_ascii=False),
            "route_connection_summary": json.dumps(n.get("route_connection_summary", {}), ensure_ascii=False),
            "known_to_commoners": n.get("political_relation", {}).get("what_commoners_know"),
            "known_to_traders": n.get("trade_connection", {}).get("summary"),
            "known_to_elites": n.get("political_relation", {}).get("what_elites_know"),
            "known_to_clergy": n.get("religious_and_cultural_connection", {}).get("summary"),
            "game_use": "Use as G0/G1 border and external-pressure guidance; concrete travel must be resolved through graph_edges.",
            "limits": n.get("political_relation", {}).get("player_visible_limits") or "Do not reveal objective political truth as character knowledge.",
            "status": n.get("status") or meta.get("status") or "draft",
            "confidence": n.get("confidence") or meta.get("confidence") or "medium",
            "sources": sources,
            "audit_notes": "Generated from novgorod_neighbor_regions_v1.json by importer.",
        }
        rows_neighbors.append(normalize_row(row, "region_neighbors"))
    return [
        Batch(table="regions", rows=rows_regions, dataset_name=dataset["name"] + "_stubs", priority=dataset.get("priority", 0) - 1, source_path=str(path)),
        Batch(table="region_neighbors", rows=rows_neighbors, dataset_name=dataset["name"], priority=dataset.get("priority", 0), source_path=str(path)),
    ]


def transform_social_roles(rows: List[Dict[str, Any]], dataset: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for r in rows:
        raw_group = clean_scalar(r.get("role_group"))
        mapped_group = ROLE_GROUP_MAP.get(raw_group, None)
        row = {
            "id": r.get("role_id"),
            "region_id": r.get("region_id"),
            "title": r.get("role_title"),
            "slug": r.get("role_id"),
            "role_group": mapped_group,
            "social_position_archetype_id": r.get("social_position_archetype_id"),
            "social_class_id": r.get("social_class_id"),
            "role_archetype_id": r.get("role_archetype_id"),
            "legal_status_archetype_id": r.get("legal_status_archetype_id"),
            "dependency_archetype_id": r.get("dependency_archetype_id"),
            "mobility_archetype_id": r.get("mobility_archetype_id"),
            "mapping_review_status": r.get("mapping_review_status"),
            "mapping_confidence": r.get("mapping_confidence"),
            "mapping_notes": r.get("mapping_notes"),
            "status_level": r.get("social_rank"),
            "free_status": r.get("freedom_status"),
            "dependency_type": r.get("dependency_type"),
            "wealth_level": r.get("typical_status_range"),
            "legal_capacity": r.get("legal_capacity"),
            "mobility_level": r.get("movement_rights"),
            "social_respect": r.get("speech_and_testimony_weight"),
            "allowed_occupations": r.get("allowed_occupations"),
            "allowed_weapons": r.get("weapon_rights"),
            "allowed_places": r.get("access_to_places"),
            "property_rights": r.get("property_rights"),
            "travel_rights": r.get("movement_rights"),
            "trade_rights": r.get("economic_basis"),
            "service_obligations": r.get("common_obligations"),
            "typical_clothing": r.get("typical_clothing"),
            "typical_equipment": r.get("typical_equipment"),
            "typical_knowledge": r.get("typical_knowledge"),
            "typical_speech_register": r.get("languages_or_speech_notes"),
            "typical_fears": r.get("typical_fears"),
            "typical_goals": r.get("typical_goals"),
            "who_commands_them": r.get("typical_authority_over_them"),
            "who_protects_them": r.get("typical_patrons"),
            "who_can_punish_them": r.get("typical_authority_over_them"),
            "relation_to_church": r.get("attitude_to_church"),
            "relation_to_power": r.get("attitude_to_authority"),
            "npc_generation_rules": r.get("llm_generation_rules"),
            "player_character_rules": r.get("player_character_limits"),
            "game_use": r.get("llm_generation_rules"),
            "limits": r.get("llm_forbidden_uses"),
            "status": r.get("status"),
            "confidence": r.get("confidence"),
            "sources": r.get("sources"),
            "audit_notes": append_audit_note(r.get("audit_notes"), f"Raw role_group={raw_group}; mapped to schema enum role_group={mapped_group}."),
        }
        out.append(normalize_row(row, "region_social_roles"))
    return out


def transform_occupations(rows: List[Dict[str, Any]], dataset: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for r in rows:
        raw_group = clean_scalar(r.get("occupation_group"))
        mapped_group = OCCUPATION_GROUP_MAP.get(raw_group, None)
        row = {
            "id": r.get("occupation_id"),
            "region_id": r.get("region_id"),
            "title": r.get("occupation_title"),
            "slug": r.get("occupation_id"),
            "occupation_group": mapped_group,
            "occupation_archetype_id": r.get("occupation_archetype_id"),
            "mapping_review_status": r.get("mapping_review_status"),
            "mapping_confidence": r.get("mapping_confidence"),
            "mapping_notes": r.get("mapping_notes"),
            "summary": r.get("modern_explanation"),
            "allowed_social_roles": r.get("allowed_social_role_ids"),
            "typical_status": r.get("typical_status_range"),
            "typical_wealth": r.get("typical_property"),
            "required_location_types": r.get("typical_g4_location_types"),
            "required_economy_types": r.get("economic_basis"),
            "required_tools": r.get("typical_tools"),
            "required_materials": r.get("typical_property"),
            "produced_goods": r.get("typical_property"),
            "services_provided": r.get("common_services_to_player"),
            "seasonality": r.get("seasonality"),
            "work_rhythm": r.get("daily_schedule_normal"),
            "income_logic": r.get("economic_basis"),
            "typical_skills": r.get("typical_skills"),
            "typical_attributes": r.get("typical_attributes"),
            "typical_clothing": r.get("typical_clothing"),
            "typical_equipment": r.get("typical_inventory_visible"),
            "typical_risks": r.get("common_fears"),
            "typical_knowledge": r.get("typical_local_knowledge"),
            "typical_contacts": r.get("common_relationships"),
            "settlement_generation_weight": r.get("rarity"),
            "npc_generation_weight": r.get("npc_generation_weight"),
            "rarity": r.get("rarity"),
            "is_historical_fact": False,
            "is_generated_allowed": True,
            "game_use": r.get("how_to_materialize_as_scene_npc"),
            "limits": r.get("llm_forbidden_uses"),
            "status": r.get("status"),
            "confidence": r.get("confidence"),
            "sources": r.get("sources"),
            "audit_notes": append_audit_note(r.get("audit_notes"), f"Raw occupation_group={raw_group}; mapped to schema enum occupation_group={mapped_group}."),
        }
        out.append(normalize_row(row, "region_occupations"))
    return out


def transform_graph_nodes(rows: List[Dict[str, Any]], dataset: Dict[str, Any], manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    default_region = manifest.get("default_region_id", "region_novgorod_land")
    for r in rows:
        if not r.get("region_id"):
            r["region_id"] = default_region
        if r.get("scale_level") == "G1" and r.get("node_type") == "region_cell":
            r.setdefault("region_cell_status", manifest.get("default_region_cell_status", "active"))
            r.setdefault("grid_z", 0)
            r.setdefault("cell_shape", "square")
        if "place_template_ids_allowed" in r and not r.get("place_template_id"):
            # graph_nodes has only a single optional place_template_id. Keep the full allowed list in audit_notes.
            pass
        out.append(normalize_row(r, "graph_nodes"))
    return out


def transform_graph_edges(rows: List[Dict[str, Any]], dataset: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for r in rows:
        # Empty optional booleans should remain NULL/DEFAULT, not false by invention.
        out.append(normalize_row(r, "graph_edges"))
    return out


def transform_historical_anchors(rows: List[Dict[str, Any]], dataset: Dict[str, Any], manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    default_region = manifest.get("default_region_id", "region_novgorod_land")
    for r in rows:
        raw_anchor_type = clean_scalar(r.get("anchor_type"))
        anchor_type = raw_anchor_type if raw_anchor_type in ALLOWED_HISTORICAL_ANCHOR_TYPES else None
        row = {
            "id": r.get("id"),
            "region_id": default_region,
            "slug": r.get("id"),
            "canonical_name": r.get("title"),
            "display_name": r.get("title"),
            "anchor_type": anchor_type,
            "summary": f"G1-level anchor bound to {r.get('g1_cell_code') or r.get('g1_cell_id')}",
            "historical_status": r.get("evidence_status"),
            "period_start_year": 1230,
            "period_end_year": 1250,
            "zone_of_influence": r.get("g1_cell_id"),
            "access_graph_edges": [],
            "visible_signs": [],
            "discovery_conditions": [],
            "llm_use_rules": ["Use only as a G1-scale generation anchor; exact G3/G4 position must be materialized causally."],
            "llm_forbidden_changes": ["Do not treat approximate G1 placement as exact historical GIS."],
            "game_use": r.get("game_use"),
            "limits": r.get("limits"),
            "status": r.get("status") or "draft",
            "confidence": r.get("confidence") or "medium_low",
            "sources": r.get("sources"),
            "audit_notes": append_audit_note(r.get("audit_notes"), f"Raw anchor_type={raw_anchor_type}; unsupported schema enum mapped to NULL when needed."),
        }
        out.append(normalize_row(row, "historical_anchors"))
    return out


def load_dataset(input_root: Path, dataset: Dict[str, Any], manifest: Dict[str, Any]) -> List[Batch]:
    path = input_root / dataset["path"]
    if not path.exists():
        return [Batch(table=dataset.get("table", "unknown"), rows=[], dataset_name=dataset["name"], priority=dataset.get("priority", 1000), source_path=str(path), warnings=[f"File not found: {path}"])]
    fmt = dataset["format"]
    if fmt == "json_region_profile":
        return transform_region_profile(path, dataset)
    if fmt == "json_region_neighbors":
        return transform_region_neighbors(path, dataset)
    rows = read_table(path, fmt, dataset.get("sheet"))
    table = dataset["table"]
    if table == "region_social_roles":
        rows_out = transform_social_roles(rows, dataset)
    elif table == "region_occupations":
        rows_out = transform_occupations(rows, dataset)
    elif dataset.get("transform") == "graph_nodes":
        rows_out = transform_graph_nodes(rows, dataset, manifest)
    elif dataset.get("transform") == "graph_edges":
        rows_out = transform_graph_edges(rows, dataset)
    elif dataset.get("transform") == "historical_anchors":
        rows_out = transform_historical_anchors(rows, dataset, manifest)
    else:
        rows_out = [normalize_row(r, table) for r in rows]
    return [Batch(table=table, rows=rows_out, dataset_name=dataset["name"], priority=dataset.get("priority", 1000), source_path=str(path))]


def load_manifest(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_all(input_root: Path, manifest_path: Path) -> List[Batch]:
    manifest = load_manifest(manifest_path)
    batches: List[Batch] = []
    for dataset in sorted(manifest.get("datasets", []), key=lambda d: d.get("priority", 1000)):
        batches.extend(load_dataset(input_root, dataset, manifest))
    order_index = {t: i for i, t in enumerate(TABLE_ORDER)}
    batches.sort(key=lambda b: (order_index.get(b.table, 999), b.priority, b.dataset_name))
    return batches


def collect_ids(batches: List[Batch]) -> Dict[str, set]:
    ids: Dict[str, set] = {t: set() for t in TABLE_COLUMNS}
    for b in batches:
        for r in b.rows:
            if r.get("id"):
                ids.setdefault(b.table, set()).add(r["id"])
            if b.table == "occupation_skill_defaults" and r.get("occupation_archetype_id"):
                ids.setdefault("occupation_archetypes", set()).add(r["occupation_archetype_id"])
    return ids


def source_refs_from_value(v: Any) -> List[str]:
    refs = normalize_json_value(v)
    return [str(x) for x in refs if isinstance(x, str)]


def materialize_missing_source_records(batches: List[Batch]) -> Optional[Batch]:
    ids = collect_ids(batches)
    existing = ids.get("source_records", set())
    referenced = set()
    for b in batches:
        if b.table == "source_records":
            continue
        for r in b.rows:
            referenced.update(source_refs_from_value(r.get("sources")))
    missing = sorted(x for x in referenced if x and x not in existing)
    if not missing:
        return None
    rows = []
    for src in missing:
        rows.append(normalize_row({
            "id": src,
            "title": src,
            "slug": slugify(src),
            "source_type": "manual_entry",
            "summary": "Unresolved source id referenced by imported data. Placeholder only; bibliography must be filled manually before approval.",
            "reliability_level": "unknown",
            "limitations": "Generated as unresolved source stub by importer; do not treat as approved evidence.",
            "status": "needs_review",
            "confidence": "unknown",
            "audit_notes": "Auto-created by world_base_importer_v1 because imported rows referenced this source id but source_records_unified_v1 did not contain it. No bibliographic facts were invented.",
            "created_at": NOW_UTC,
            "updated_at": NOW_UTC,
        }, "source_records"))
    return Batch(table="source_records", rows=rows, dataset_name="auto_unresolved_source_stubs", priority=11, source_path="generated by importer")


def build_position_archetype_index(batches: List[Batch]) -> Dict[str, Dict[str, Any]]:
    idx: Dict[str, Dict[str, Any]] = {}
    for b in batches:
        if b.table != "social_position_archetypes":
            continue
        for r in b.rows:
            rid = r.get("id")
            if rid:
                idx[rid] = r
    return idx


def apply_position_denorm_consistency(batches: List[Batch]) -> List[Dict[str, Any]]:
    """Auto-fill empty denorm FKs from position archetype; collect mismatch errors."""
    errors: List[Dict[str, Any]] = []
    position_index = build_position_archetype_index(batches)
    for b in batches:
        if b.table not in TABLES_WITH_POSITION_DENORM:
            continue
        for i, r in enumerate(b.rows, start=1):
            pos_id = r.get("social_position_archetype_id")
            if is_missing(pos_id):
                continue
            pos = position_index.get(pos_id)
            if not pos:
                continue
            for field in POSITION_DENORM_FIELDS:
                row_val = r.get(field)
                canon = pos.get(field)
                if is_missing(row_val):
                    if not is_missing(canon):
                        r[field] = canon
                elif not is_missing(canon) and row_val != canon:
                    errors.append({
                        "table": b.table,
                        "dataset": b.dataset_name,
                        "row": i,
                        "id": r.get("id"),
                        "error": (
                            f"denorm mismatch: {field}={row_val} "
                            f"!= social_position_archetype {pos_id}.{field}={canon}"
                        ),
                    })
    return errors


def validate_batches(batches: List[Batch]) -> Dict[str, Any]:
    denorm_errors = apply_position_denorm_consistency(batches)
    ids = collect_ids(batches)
    errors: List[Dict[str, Any]] = list(denorm_errors)
    warnings: List[Dict[str, Any]] = []
    summary: Dict[str, Any] = {"tables": {}, "datasets": []}
    for b in batches:
        for w in b.warnings:
            warnings.append({"dataset": b.dataset_name, "table": b.table, "warning": w})
        summary["datasets"].append({"name": b.dataset_name, "table": b.table, "rows": len(b.rows), "source_path": b.source_path})
        t = summary["tables"].setdefault(b.table, {"rows": 0, "datasets": []})
        t["rows"] += len(b.rows)
        t["datasets"].append(b.dataset_name)
        req = REQUIRED_COLUMNS.get(b.table, [])
        for i, r in enumerate(b.rows, start=1):
            for c in req:
                if is_missing(r.get(c)):
                    errors.append({"table": b.table, "dataset": b.dataset_name, "row": i, "error": f"missing required column {c}", "id": r.get("id")})
            for src in source_refs_from_value(r.get("sources")):
                if src and src not in ids.get("source_records", set()):
                    warnings.append({"table": b.table, "dataset": b.dataset_name, "id": r.get("id"), "warning": f"source id not in unified source_records: {src}"})
            if b.table == "region_social_roles":
                status = clean_scalar(r.get("status"))
                if status in ACTIVE_IMPORT_STATUSES and is_missing(r.get("social_position_archetype_id")):
                    errors.append({
                        "table": b.table,
                        "dataset": b.dataset_name,
                        "row": i,
                        "id": r.get("id"),
                        "error": "active regional social role requires social_position_archetype_id (generation gate)",
                    })
    # Staged FK checks. Database remains source of truth; these catch common import mistakes.
    for b in batches:
        for r in b.rows:
            rid = r.get("id")
            def check(ref_table: str, value: Any, label: str) -> None:
                if not is_missing(value) and value not in ids.get(ref_table, set()):
                    errors.append({"table": b.table, "id": rid, "error": f"FK candidate {label}={value} missing in staged {ref_table}"})
            if b.table == "region_neighbors":
                check("regions", r.get("region_id"), "region_id")
                check("regions", r.get("neighbor_region_id"), "neighbor_region_id")
            if b.table.startswith("region_") and b.table not in {"region_neighbors"}:
                check("regions", r.get("region_id"), "region_id")
            if b.table == "region_landscape_templates":
                check("landscape_templates", r.get("landscape_template_id"), "landscape_template_id")
            if b.table == "region_water_body_templates":
                check("water_body_templates", r.get("water_body_template_id"), "water_body_template_id")
            if b.table == "region_land_use_templates":
                check("land_use_templates", r.get("land_use_template_id"), "land_use_template_id")
            if b.table == "region_place_templates":
                check("place_templates", r.get("place_template_id"), "place_template_id")
            if b.table == "social_position_archetypes":
                check("social_classes", r.get("social_class_id"), "social_class_id")
                check("social_role_archetypes", r.get("role_archetype_id"), "role_archetype_id")
                check("legal_status_archetypes", r.get("legal_status_archetype_id"), "legal_status_archetype_id")
                check("dependency_archetypes", r.get("dependency_archetype_id"), "dependency_archetype_id")
                check("mobility_archetypes", r.get("mobility_archetype_id"), "mobility_archetype_id")
            if b.table == "class_role_rules":
                check("social_classes", r.get("social_class_id"), "social_class_id")
                check("social_role_archetypes", r.get("role_archetype_id"), "role_archetype_id")
            if b.table == "role_occupation_rules":
                check("social_role_archetypes", r.get("role_archetype_id"), "role_archetype_id")
                check("occupation_archetypes", r.get("occupation_archetype_id"), "occupation_archetype_id")
            if b.table == "occupation_skill_defaults":
                check("occupation_archetypes", r.get("occupation_archetype_id"), "occupation_archetype_id")
            if b.table == "region_social_roles":
                check("social_position_archetypes", r.get("social_position_archetype_id"), "social_position_archetype_id")
                check("social_classes", r.get("social_class_id"), "social_class_id")
                check("social_role_archetypes", r.get("role_archetype_id"), "role_archetype_id")
                check("legal_status_archetypes", r.get("legal_status_archetype_id"), "legal_status_archetype_id")
                check("dependency_archetypes", r.get("dependency_archetype_id"), "dependency_archetype_id")
                check("mobility_archetypes", r.get("mobility_archetype_id"), "mobility_archetype_id")
            if b.table == "region_occupations":
                check("occupation_archetypes", r.get("occupation_archetype_id"), "occupation_archetype_id")
            if b.table == "universal_archetype_proposals":
                check("regions", r.get("source_region_id"), "source_region_id")
            if b.table == "graph_nodes":
                check("regions", r.get("region_id"), "region_id")
                check("graph_nodes", r.get("parent_node_id"), "parent_node_id")
                check("landscape_templates", r.get("primary_landscape_template_id"), "primary_landscape_template_id")
                check("water_body_templates", r.get("primary_water_body_template_id"), "primary_water_body_template_id")
                check("place_templates", r.get("place_template_id"), "place_template_id")
            if b.table == "graph_edges":
                check("graph_nodes", r.get("from_node_id"), "from_node_id")
                check("graph_nodes", r.get("to_node_id"), "to_node_id")
                check("graph_edges", r.get("reverse_edge_id"), "reverse_edge_id")
                check("route_templates", r.get("route_template_id"), "route_template_id")
                check("landscape_templates", r.get("landscape_template_id"), "landscape_template_id")
                check("water_body_templates", r.get("water_body_template_id"), "water_body_template_id")
            if b.table == "historical_anchors":
                check("regions", r.get("region_id"), "region_id")
    return {"summary": summary, "errors": errors, "warnings": warnings}


def sql_literal(value: Any, jsonb: bool = False) -> str:
    if value is None:
        return "NULL"
    if jsonb:
        s = json.dumps(value, ensure_ascii=False)
        return quote_sql(s) + "::jsonb"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and math.isnan(value):
            return "NULL"
        return str(value)
    return quote_sql(str(value))


def quote_sql(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def emit_insert_sql(table: str, rows: List[Dict[str, Any]], omit_columns: Optional[set] = None) -> List[str]:
    omit_columns = omit_columns or set()
    statements = []
    for r in rows:
        cols = [c for c in TABLE_COLUMNS[table] if c in r and c not in omit_columns]
        if not cols:
            continue
        values = [sql_literal(r.get(c), c in JSONB_COLUMNS) for c in cols]
        conflict_keys = TABLE_CONFLICT_KEYS.get(table, ("id",))
        update_cols = [c for c in cols if c not in conflict_keys]
        update_sql = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
        key_sql = ", ".join(conflict_keys)
        if update_sql:
            conflict = f"ON CONFLICT ({key_sql}) DO UPDATE SET {update_sql}"
        else:
            conflict = f"ON CONFLICT ({key_sql}) DO NOTHING"
        statements.append(
            f"INSERT INTO {SCHEMA_NAME}.{table} ({', '.join(cols)}) VALUES ({', '.join(values)}) {conflict};"
        )
    return statements


def write_sql_seed(batches: List[Batch], output_path: Path) -> None:
    lines = [
        "-- Generated by RUS13 world_base importer v1",
        f"-- Generated at: {dt.datetime.utcnow().replace(microsecond=0).isoformat()}Z",
        "BEGIN;",
        "SET CONSTRAINTS ALL DEFERRED;",
        ""
    ]
    edge_reverse_updates: List[Tuple[str, str]] = []
    for b in batches:
        if not b.rows:
            continue
        lines.append(f"-- Dataset: {b.dataset_name} -> {b.table} ({len(b.rows)} rows)")
        if b.table == "graph_edges":
            for r in b.rows:
                if r.get("reverse_edge_id"):
                    edge_reverse_updates.append((r["id"], r["reverse_edge_id"]))
            lines.extend(emit_insert_sql(b.table, b.rows, omit_columns={"reverse_edge_id"}))
        else:
            lines.extend(emit_insert_sql(b.table, b.rows))
        lines.append("")
    if edge_reverse_updates:
        lines.append("-- Second pass: self-referencing graph_edges.reverse_edge_id")
        for edge_id, reverse_id in edge_reverse_updates:
            lines.append(
                f"UPDATE {SCHEMA_NAME}.graph_edges SET reverse_edge_id = {quote_sql(reverse_id)} WHERE id = {quote_sql(edge_id)};"
            )
        lines.append("")
    lines.append("COMMIT;")
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def apply_batches(batches: List[Batch], database_url: str, dry_run: bool = False) -> None:
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("Missing dependency: psycopg. Install with: pip install psycopg[binary]") from exc

    def upsert(cur, table: str, rows: List[Dict[str, Any]], omit_columns: Optional[set] = None):
        omit_columns = omit_columns or set()
        conflict_keys = TABLE_CONFLICT_KEYS.get(table, ("id",))
        for r in rows:
            cols = [c for c in TABLE_COLUMNS[table] if c in r and c not in omit_columns]
            if not cols:
                continue
            placeholders = ", ".join(["%s"] * len(cols))
            update_cols = [c for c in cols if c not in conflict_keys]
            update_sql = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
            key_sql = ", ".join(conflict_keys)
            if update_sql:
                conflict = f"ON CONFLICT ({key_sql}) DO UPDATE SET {update_sql}"
            else:
                conflict = f"ON CONFLICT ({key_sql}) DO NOTHING"
            sql = f"INSERT INTO {SCHEMA_NAME}.{table} ({', '.join(cols)}) VALUES ({placeholders}) {conflict}"
            vals = []
            for c in cols:
                v = r.get(c)
                if c in JSONB_COLUMNS:
                    vals.append(json.dumps(v, ensure_ascii=False))
                else:
                    vals.append(v)
            cur.execute(sql, vals)

    edge_reverse_updates: List[Tuple[str, str]] = []
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("BEGIN")
            cur.execute("SET CONSTRAINTS ALL DEFERRED")
            for b in batches:
                if b.table == "graph_edges":
                    for r in b.rows:
                        if r.get("reverse_edge_id"):
                            edge_reverse_updates.append((r["id"], r["reverse_edge_id"]))
                    upsert(cur, b.table, b.rows, omit_columns={"reverse_edge_id"})
                else:
                    upsert(cur, b.table, b.rows)
            for edge_id, reverse_id in edge_reverse_updates:
                cur.execute(f"UPDATE {SCHEMA_NAME}.graph_edges SET reverse_edge_id = %s WHERE id = %s", (reverse_id, edge_id))
            if dry_run:
                cur.execute("ROLLBACK")
            else:
                cur.execute("COMMIT")


def write_report(report: Dict[str, Any], path: Path) -> None:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import RUS13 reference files into world_base or emit SQL.")
    parser.add_argument("--input-root", default="/mnt/data", help="Root directory containing the source files from the manifest.")
    parser.add_argument("--manifest", default=str(Path(__file__).resolve().parent.parent / "config" / "world_base_import_manifest_v1.json"), help="Import manifest JSON.")
    parser.add_argument("--mode", choices=["dry-run", "emit-sql", "apply"], default="dry-run")
    parser.add_argument("--output-sql", default="world_base_seed_v1.sql")
    parser.add_argument("--report", default="world_base_import_report_v1.json")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"), help="PostgreSQL DATABASE_URL for --mode apply.")
    parser.add_argument("--allow-warnings", action="store_true", help="Exit 0 when warnings exist but no errors.")
    args = parser.parse_args(argv)

    input_root = Path(args.input_root).resolve()
    manifest_path = Path(args.manifest).resolve()
    batches = load_all(input_root, manifest_path)
    stub_batch = materialize_missing_source_records(batches)
    if stub_batch is not None:
        batches.append(stub_batch)
        order_index = {t: i for i, t in enumerate(TABLE_ORDER)}
        batches.sort(key=lambda b: (order_index.get(b.table, 999), b.priority, b.dataset_name))
    report = validate_batches(batches)
    write_report(report, Path(args.report))

    error_count = len(report["errors"])
    warning_count = len(report["warnings"])
    print(f"Loaded {sum(len(b.rows) for b in batches)} rows across {len(report['summary']['tables'])} tables.")
    print(f"Validation: {error_count} errors, {warning_count} warnings. Report: {args.report}")

    if args.mode == "dry-run":
        return 1 if error_count else 0
    if error_count:
        print("Refusing to continue because dry-run validation has errors.", file=sys.stderr)
        return 1
    if args.mode == "emit-sql":
        write_sql_seed(batches, Path(args.output_sql))
        print(f"SQL seed written: {args.output_sql}")
        return 0
    if args.mode == "apply":
        if not args.database_url:
            print("--database-url or DATABASE_URL is required for --mode apply", file=sys.stderr)
            return 1
        apply_batches(batches, args.database_url)
        print("Import applied.")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
