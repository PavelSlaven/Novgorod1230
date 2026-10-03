#!/usr/bin/env python3
"""Deterministic validator for the unapproved combat-min data candidate."""
from __future__ import annotations
import copy
import csv
import hashlib
import json
import math
import re
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANDIDATE_PATH = HERE / "minimal-combat-bundle.candidate.json"
SOURCE_MAP_PATH = HERE / "source-map.json"
GAPS_PATH = HERE / "typed-gaps.json"
EXPECTED_SCHEMA = "novgorod.combat_data_source_map.v1"
EXPECTED_QUALITY = [
    (None, -10, 0), (-9, -5, 0), (-4, -1, 0),
    (0, 4, 1), (5, 9, 2), (10, 14, 3), (15, None, 4)
]
EXPECTED_HEALTH = [(0, 1, 0), (2, 3, 5), (4, 5, 12), (6, 7, 25), (8, None, 45)]
EXPECTED_ACTION_PROFILES = {"melee_attack_step"}
EXPECTED_CATALOG_WEAPONS = {
    "wp_sword": ("cat_item_object_sword_v1", 3),
    "wp_spear": ("cat_item_object_spear_v1", 3),
    "wp_rogatina": ("cat_item_object_rogatina_v1", 3),
    "wp_battle_axe": ("cat_item_object_combat_axe_v1", 3),
    "wp_knife": ("cat_item_object_utility_knife_v1", 2),
    "wp_long_knife": ("cat_item_object_long_knife_v1", 2),
    "wp_club": ("cat_item_object_mace_v1", 2),
}
EXPECTED_WEAPON_MAP = {
    "not_weapon_capable": 0,
    "improvised_puncture_light": 1,
    "improvised_impact_light": 1,
    "improvised_cutting_light": 1,
    "improvised_two_hand_heavy": 2,
}
EXPECTED_ATTACK_FORMULA = "d20 + floor((attribute_value - 10) / 2) + skill_bonus + state_modifier + equipment_modifier + circumstance_modifier"
EXPECTED_DEFENSE_FORMULA = "10 + defensive_bonus + active_defense + position_modifier"
EXPECTED_MARGIN_FORMULA = "attack_total - target_defense"
EXPECTED_RAW_HARM_FORMULA = "raw_damage_score = hit_quality + weapon_danger + target_vulnerability - target_protection"
EXPECTED_HEALTH_TRANSITION = "next_health = max(0, current_health - committed_health_loss)"
EXPECTED_GAP_CONTRACTS = {
    "G-APPLICABILITY-V17": ("contract_applicability", {"applicability.values", "execution.check", "execution.harm", "execution.health_transition"}),
    "G-ACTOR-CHECK-FACTS": ("source_binding", {"execution.check.typed_inputs.actor attribute/skill/state/equipment/circumstances", "execution.check.typed_inputs.target defense/position"}),
    "G-GENERIC-WEAPON-ROWS": ("item_mechanics_mapping", {"execution.weapon_capability_mapping game-base catalog rows"}),
    "G-TARGET-PROTECTION-VULNERABILITY": ("combat_input_profile", {"execution.harm.target_vulnerability", "execution.harm.target_protection"}),
    "G-BODY-READBACK-COMMIT": ("runtime_body_handoff", {"execution.health_transition"}),
    "G-DURATION-APPROVAL": ("game_calibration_approval", {"durations.per_action_profiles[0]"}),
    "G-RATIONAL-TIME-HANDOFF": ("clock_representation_handoff", {"durations.per_action_profiles[0].duration_minutes", "durations.npc_boundary_and_intent_events"}),
    "G-AUTO-DEFENSE-TIMING": ("step_duration_composition", {"durations.per_action_profiles[0].automatic_defense_timing"}),
    "G-RETREAT-MOVEMENT": ("movement_profile", {"durations.retreat_movement", "npc_decision.surrender_or_exit_facts.break_contact_basis"}),
    "G-INDIVIDUAL-SURRENDER-BASIS": ("npc_individual_context", {"npc_decision.surrender_or_exit_facts.surrender_basis"}),
    "G-PERCEPTION-BOUNDARY-APPLICABILITY": ("perception_binding", {"npc_decision.meaningful_boundary", "npc_decision.decision_context_required"}),
    "G-SURRENDER-PHYSICAL-ACTION": ("physical_effect_profile", {"npc_decision.surrender_or_exit_facts.physical_effect"}),
    "G-WEAPON-UNMAPPED-MELEE-VARIANTS": ("weapon_variant_classification", {"execution.weapon_capability_mapping.unmapped_catalog_melee_rows"}),
    "G-NPC-BODY-QUALITATIVE-BANDS": ("owner_semantics_and_game_calibration_approval", {"npc_decision.body_state_qualitative_context"}),
}
EXPECTED_BODY_STATE_PHRASES = {
    "health": ["Здоровье низкое.", "Здоровье умеренное.", "Здоровье высокое."],
    "energy": ["Запас энергии низкий.", "Запас энергии умеренный.", "Запас энергии высокий."],
    "satiety": ["Сытость низкая.", "Сытость умеренная.", "Сытость высокая."],
}


def load_json(path: Path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def issue(errors, condition, code):
    if condition:
        errors.append(code)


def bands_match(bands, expected, keys):
    actual = []
    for band in bands:
        row = []
        for key in keys:
            value = band.get(key)
            if value in ("-infinity", "infinity"):
                value = None
            row.append(value)
        actual.append(tuple(row))
    return actual == expected


def source_ids(source_map):
    return {item.get("id") for item in source_map.get("sources", [])}


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_bundle(bundle, source_map, gaps):
    errors = []
    if not isinstance(gaps, dict):
        errors.append("GAP_SCHEMA_INVALID")
        gaps = {}
    issue(errors, bundle.get("status") != "candidate_not_approved", "APPROVAL_STATUS")
    issue(errors, bundle.get("production_usable") is not False, "PRODUCTION_ENABLED")
    app = bundle.get("applicability", {})
    issue(errors, app.get("fallback_to_scenario_profile") is not False, "SCENARIO_FALLBACK")
    issue(errors, not app.get("required"), "REQUIRED_INPUTS_EMPTY")
    issue(errors, app.get("values") is not None, "UNPINNED_APPLICABILITY_MUST_STAY_NULL")

    source_entries = source_map.get("sources", [])
    if not isinstance(source_entries, list):
        source_entries = []
        errors.append("SOURCE_MAP_SOURCES_TYPE")
    known_sources = source_ids(source_map)
    issue(errors, source_map.get("schema") != EXPECTED_SCHEMA, "SOURCE_MAP_SCHEMA")
    issue(errors, len(known_sources) != len(source_entries), "SOURCE_ID_DUPLICATE")
    for entry in source_entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            errors.append("SOURCE_ENTRY_INVALID")
            continue
        path = entry.get("path")
        digest = entry.get("sha256")
        pin_kind = entry.get("pin_kind", "full_file")
        source_path = Path(path) if isinstance(path, str) and path else None
        if pin_kind == "append_only_excerpt":
            lines = entry.get("lines")
            excerpt_digest = entry.get("excerpt_sha256")
            if (digest is not None or not source_path or not isinstance(lines, list) or len(lines) != 2
                    or not all(isinstance(x, int) and not isinstance(x, bool) and x > 0 for x in lines)
                    or not isinstance(excerpt_digest, str) or not re.fullmatch(r"[a-f0-9]{64}", excerpt_digest)):
                errors.append("SOURCE_EXCERPT_PIN_INVALID")
            elif not source_path.is_file():
                errors.append("SOURCE_MISSING")
            else:
                source_lines = source_path.read_bytes().splitlines(keepends=True)
                start, end = lines
                if start > end or end > len(source_lines):
                    errors.append("SOURCE_EXCERPT_RANGE_INVALID")
                elif hashlib.sha256(b"".join(source_lines[start - 1:end])).hexdigest() != excerpt_digest:
                    errors.append("SOURCE_EXCERPT_HASH_MISMATCH")
        elif pin_kind == "internal_candidate_locator":
            if (entry.get("id") != "src.duration.calibration.v1" or digest is not None
                    or source_path != CANDIDATE_PATH or entry.get("json_pointer") != "/durations/per_action_profiles/0"):
                errors.append("SELF_SOURCE_LOCATOR_INVALID")
            else:
                duration = bundle.get("durations", {}).get("per_action_profiles", [])
                if (len(duration) != 1 or duration[0].get("profile_id") != "candidate.melee-attack-step.v1"
                        or duration[0].get("equivalent_seconds") != 6
                        or duration[0].get("duration_minutes") != {"numerator": 1, "denominator": 10, "calibration_ref": "src.duration.calibration.v1"}):
                    errors.append("SELF_SOURCE_LOCATOR_TARGET_INVALID")
                lines = entry.get("lines", [])
                candidate_lines = CANDIDATE_PATH.read_text(encoding="utf-8").splitlines()
                if (not isinstance(lines, list) or len(lines) != 2
                        or not all(isinstance(x, int) and not isinstance(x, bool) for x in lines)
                        or lines[0] < 1 or lines[1] < lines[0] or lines[1] > len(candidate_lines)
                        or not any("candidate.melee-attack-step.v1" in line for line in candidate_lines[lines[0]-1:lines[1]])):
                    errors.append("SELF_SOURCE_LOCATOR_RANGE_INVALID")
        elif pin_kind == "full_file":
            if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                errors.append("SOURCE_HASH_MISSING")
            elif not source_path or not source_path.is_file():
                errors.append("SOURCE_MISSING")
            elif hashlib.sha256(source_path.read_bytes()).hexdigest() != digest:
                errors.append("SOURCE_HASH_MISMATCH")
        else:
            errors.append("SOURCE_PIN_KIND_INVALID")
    field_sources = source_map.get("field_sources", {})
    required_source_fields = {
        "applicability", "execution.check.normative_rule", "execution.harm",
        "execution.health_transition", "execution.weapon_capability_mapping",
        "durations.per_action_profiles", "npc_decision.meaningful_boundary",
        "npc_decision.decision_context_required", "npc_decision.surrender_or_exit_facts",
        "npc_decision.body_state_qualitative_context",
        "execution.check.owner_request_binding",
        "execution.health_transition.body_initialization.owner_initialization_profile_adapter",
        "execution.harm.derived_normalization",
    }
    if not required_source_fields.issubset(field_sources):
        errors.append("FIELD_SOURCE_UNRESOLVED")
    for field, refs in field_sources.items():
        if (not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or ref not in known_sources for ref in refs)):
            errors.append("FIELD_SOURCE_UNRESOLVED")

    # Every source_ref embedded in a candidate object must resolve in the map.
    def scan_refs(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "source_refs":
                    if not isinstance(item, list) or any(not isinstance(ref, str) or ref not in known_sources for ref in item):
                        errors.append("SOURCE_REF_UNRESOLVED")
                elif key.endswith("_ref") and item is not None:
                    if key.endswith("source_ref") and (not isinstance(item, str) or item not in known_sources):
                        errors.append("SOURCE_REF_UNRESOLVED")
                    elif isinstance(item, str) and item.startswith("src.") and item not in known_sources:
                        errors.append("SOURCE_REF_UNRESOLVED")
                elif key == "source_and_version" and isinstance(item, str) and item.startswith("src."):
                    if item not in known_sources:
                        errors.append("SOURCE_REF_UNRESOLVED")
                else:
                    scan_refs(item)
        elif isinstance(value, list):
            for item in value:
                scan_refs(item)
    scan_refs(bundle)

    execution = bundle.get("execution", {})
    required_owners = [
        execution.get("check", {}).get("owner"), execution.get("harm", {}).get("owner"),
        execution.get("health_transition", {}).get("owner"),
        execution.get("weapon_capability_mapping", {}).get("owner"),
        bundle.get("durations", {}).get("clock_owner"),
        bundle.get("npc_decision", {}).get("owner"),
        bundle.get("npc_decision", {}).get("permitted_context_owner"),
        bundle.get("npc_decision", {}).get("movement_feasibility_owner"),
    ]
    issue(errors, any(not owner for owner in required_owners), "OWNER_MISSING")
    check = execution.get("check", {}).get("normative_rule", {})
    issue(errors, not bands_match(check.get("quality_bands", []), EXPECTED_QUALITY,
                                 ("min_margin", "max_margin", "quality")),
          "CHECK_BANDS_INVALID")
    harm = execution.get("harm", {})
    issue(errors, not bands_match(harm.get("health_loss_bands", []), EXPECTED_HEALTH,
                                 ("damage_score_min", "damage_score_max", "health_loss")),
          "HEALTH_BANDS_INVALID")
    issue(errors, check.get("attack") != EXPECTED_ATTACK_FORMULA
          or check.get("defense") != EXPECTED_DEFENSE_FORMULA
          or check.get("margin") != EXPECTED_MARGIN_FORMULA,
          "ATTACK_FORMULA_INVALID")
    issue(errors, harm.get("normative_rule") != EXPECTED_RAW_HARM_FORMULA,
          "HARM_FORMULA_INVALID")
    normalization = harm.get("derived_normalization", {})
    issue(errors, normalization.get("kind") != "nonnegative_damage_score"
          or normalization.get("rule") != "damage_score = max(0, raw_damage_score)"
          or normalization.get("source_ref") != "src.combat-health-runtime-harm.v-current"
          or "not attributed verbatim" not in normalization.get("scope", "")
          or not normalization.get("rationale"),
          "HARM_NORMALIZATION_INVALID")
    issue(errors, "unknown" not in str(harm.get("unsupported_factors_policy", "")).lower(),
          "UNKNOWN_HARM_FACTOR_DEFAULT")
    health = execution.get("health_transition", {})
    issue(errors, health.get("rule") != EXPECTED_HEALTH_TRANSITION, "HEALTH_TRANSITION_INVALID")
    zero_rule = str(health.get("at_zero", "")).lower()
    issue(errors, "incapacitated" not in zero_rule or "not inferred" not in zero_rule,
          "DEATH_IMPLIED_BY_HEALTH")
    issue(errors, "excluded" not in str(health.get("persistent_injuries_conditions_diagnosis_treatment", "")),
          "INJURY_SCOPE_UNCLEAR")
    body_init = health.get("body_initialization", {})
    mapping = body_init.get("profile_mapping", {})
    issue(errors, mapping.get("mapping_id") != "candidate.actor-base-attributes-identity-to-body-profile.v1"
          or mapping.get("mapping_version") != 1, "BODY_MAPPING_VERSION_INVALID")
    issue(errors, mapping.get("status") != "proposed_unapproved", "BODY_MAPPING_STATUS_INVALID")
    attrs = mapping.get("inputs", {}).get("actor_attributes", {})
    issue(errors, attrs.get("contract_version") != "actor_base_attributes_v1"
          or set(attrs.get("required_keys", [])) != {"strength", "dexterity", "endurance", "reason", "attention", "influence"},
          "BODY_MAPPING_ATTRIBUTE_INPUT_INVALID")
    issue(errors, set(attrs.get("required_snapshot_fields", [])) != {"contract_version", "values", "profile_ref", "generation", "trace"},
          "BODY_MAPPING_FULL_SNAPSHOT_REQUIRED")
    issue(errors, not mapping.get("identity_dimensions_used")
          or not mapping.get("identity_dimensions_not_used_as_metric_modifiers"),
          "BODY_MAPPING_IDENTITY_SCOPE_MISSING")
    issue(errors, mapping.get("output_profile", {}).get("profile_id") != "candidate.generic-npc-initial-body.v1"
          or mapping.get("output_profile", {}).get("version") != 1
          or mapping.get("output_profile", {}).get("schema") != "candidate.body_state.profile_authoring.v1",
          "BODY_PROFILE_VERSION_INVALID")
    metrics = mapping.get("output_profile", {}).get("metrics", {})
    issue(errors, set(metrics) != {"health", "energy", "satiety"}, "BODY_MAPPING_METRICS_INVALID")
    is_int = lambda x: isinstance(x, int) and not isinstance(x, bool)
    for metric, fact in metrics.items():
        if metric not in {"health", "energy", "satiety"}:
            continue
        value = fact.get("candidate_value")
        calibration = fact.get("calibration", {})
        bounds = fact.get("calibration_bounds")
        issue(errors, not is_int(value), "BODY_METRIC_VALUE_INVALID")
        issue(errors, fact.get("range") != [0, 100] or not isinstance(bounds, list) or len(bounds) != 2
              or not all(is_int(v) for v in bounds) or bounds[0] < 0 or bounds[1] > 100
              or bounds[0] > bounds[1] or (is_int(value) and not bounds[0] <= value <= bounds[1]),
              "BODY_METRIC_BOUNDS_INVALID")
        issue(errors, not fact.get("rule"), "BODY_METRIC_RULE_MISSING")
        issue(errors, calibration.get("kind") != "game_calibration"
              or calibration.get("label_internal_only") != "D71", "BODY_METRIC_D71_MISSING")
        issue(errors, not calibration.get("rationale") or not fact.get("source_refs"),
              "BODY_METRIC_RATIONALE_OR_SOURCE_MISSING")
        rule = fact.get("rule") or {}
        if rule.get("kind") == "constant":
            issue(errors, not is_int(rule.get("value")) or rule.get("value") != value,
                  "BODY_METRIC_RULE_VALUE_MISMATCH")
        elif metric == "energy" and rule.get("kind") == "affine_clamp":
            expected_rule = {"kind": "affine_clamp", "attribute": "endurance", "base_value": 80,
                             "center": 10, "slope": 2, "clamp_bounds": [60, 100],
                             "formula": "clamp(80 + 2 * (endurance - 10), 60, 100)"}
            issue(errors, rule != expected_rule or value != 80, "BODY_METRIC_RULE_VALUE_MISMATCH")
        else:
            errors.append("BODY_METRIC_RULE_INVALID")
    issue(errors, mapping.get("calibration_metadata", {}).get("label_internal_only") != "D71"
          or mapping.get("calibration_metadata", {}).get("status") != "proposed_unbenchmarked"
          or mapping.get("calibration_metadata", {}).get("candidate_variant") != "B",
          "BODY_MAPPING_D71_METADATA_INVALID")
    issue(errors, "D67" not in str(mapping.get("fail_closed", {}).get("approval_gate", ""))
          or "never use this unapproved candidate" not in str(mapping.get("fail_closed", {}).get("effect", "")),
          "BODY_MAPPING_FAIL_CLOSED_INVALID")
    adapter = body_init.get("owner_initialization_profile_adapter", {})
    target = adapter.get("target_dto_mapping", {})
    profile_ref = target.get("profile_ref", {})
    entity_ref = profile_ref.get("entity_ref", {})
    issue(errors, adapter.get("adapter_id") != "candidate.body-profile-authoring-to-owner-initialization.v1"
          or adapter.get("status") != "blocked_until_owner_and_D67_approval"
          or target.get("schema") != "rus.body_state.initialization_profile.v1"
          or target.get("status") != "approved"
          or target.get("emit_when") != "only when owner and independent D67 approvals are recorded for this exact profile version"
          or entity_ref.get("entity_kind") != "body_state_profile"
          or entity_ref.get("entity_id") != "profile_mapping.output_profile.profile_id"
          or profile_ref.get("authoring_version") != "String(profile_mapping.output_profile.version)"
          or set(target.get("initial_state", {})) != {"health", "satiety", "energy"}
          or adapter.get("candidate_emission") is not None
          or "cannot be sent to initializeBodyState until approval gate" not in adapter.get("candidate_emission_policy", ""),
          "BODY_OWNER_DTO_MAPPING_INVALID")
    subject_binding = adapter.get("subject_binding", {})
    issue(errors, not subject_binding.get("actor_ref") or not subject_binding.get("actor_attributes")
          or not subject_binding.get("identity") or not subject_binding.get("derived_initial_state_scope")
          or not adapter.get("fail_closed_preconditions"), "BODY_SUBJECT_BINDING_INVALID")
    test_dto = adapter.get("test_only_approved_dto_fixture", {})
    issue(errors, test_dto.get("approval_fixture_only") is not True
          or test_dto.get("schema") != "rus.body_state.initialization_profile.v1"
          or test_dto.get("status") != "approved"
          or set(test_dto.get("initial_state", {})) != {"health", "satiety", "energy"}
          or test_dto.get("profile_ref", {}).get("entity_ref", {}).get("entity_kind") != "body_state_profile"
          or not test_dto.get("profile_ref", {}).get("authoring_version")
          or any(not finite_number(value) or not 0 <= value <= 100 for value in test_dto.get("initial_state", {}).values()),
          "BODY_OWNER_DTO_FIXTURE_INVALID")
    check_binding = execution.get("check", {}).get("owner_request_binding", {})
    required_request_fields = {"attribute_value", "skill_bonus", "state_modifier", "equipment_modifier", "circumstance_modifier", "target_defense"}
    issue(errors, check_binding.get("schema") != "candidate.combat-check-request-binding.v1"
          or check_binding.get("status") != "owner_dto_and_applicability_pending"
          or check_binding.get("owner_request_field") != "combat_technical_step_proposal.check_request"
          or {entry.get("request_field") for entry in check_binding.get("inputs", [])} != required_request_fields
          or not check_binding.get("actor_ref") or not check_binding.get("target_ref")
          or not check_binding.get("code_owned_rng") or not check_binding.get("fail_closed"),
          "ACTOR_BOUND_CHECK_REQUEST_INVALID")
    alternatives = {item.get("id"): item for item in mapping.get("calibration_alternatives", [])}
    issue(errors, set(alternatives) != {"A", "C"}, "BODY_CALIBRATION_ALTERNATIVES_INVALID")
    for arm in alternatives.values():
        vals = arm.get("metrics", {})
        arm_cal = arm.get("calibration", {})
        bounds_map = arm.get("allowed_bounds", {})
        issue(errors, arm.get("label_internal_only") != "D71" or arm.get("status") != "comparison_only"
              or arm_cal.get("kind") != "game_calibration" or arm_cal.get("label_internal_only") != "D71"
              or not arm_cal.get("rationale") or set(vals) != {"health", "energy", "satiety"}
              or set(bounds_map) != {"health", "energy", "satiety"},
              "BODY_CALIBRATION_ALTERNATIVES_INVALID")
        for metric, val in vals.items():
            bounds = bounds_map.get(metric)
            issue(errors, not isinstance(bounds,list) or len(bounds)!=2 or not all(is_int(x) for x in bounds)
                  or (is_int(val) and isinstance(bounds,list) and len(bounds)==2 and not bounds[0] <= val <= bounds[1]),
                  "BODY_CALIBRATION_ALTERNATIVE_BOUNDS_INVALID")

    mappings = execution.get("weapon_capability_mapping", {}).get("rules", [])
    issue(errors, not any("bare-hand punch" in str(item.get("input", ""))
                          and item.get("result", {}).get("weapon_danger") == 1 for item in mappings),
          "FIST_MAPPING_MISSING")
    catalog_rows = execution.get("weapon_capability_mapping", {}).get("catalog_row_candidates", [])
    catalog_by_id = {row.get("wp_id"): row for row in catalog_rows}
    issue(errors, set(catalog_by_id) != set(EXPECTED_CATALOG_WEAPONS), "WEAPON_ROW_CANDIDATE_COVERAGE")
    row_source = next((entry for entry in source_entries if entry.get("id") == "src.game-base-weapons-rows.v1"), None)
    csv_rows = {}
    if row_source and Path(row_source["path"]).is_file():
        with Path(row_source["path"]).open(encoding="utf-8-sig", newline="") as stream:
            csv_rows = {row.get("wp_id"): row for row in csv.DictReader(stream)}
    for wp_id, expected in EXPECTED_CATALOG_WEAPONS.items():
        candidate_row = catalog_by_id.get(wp_id)
        data_row = csv_rows.get(wp_id)
        if not candidate_row or not data_row or data_row.get("kind") != "weapon":
            errors.append("WEAPON_ROW_UNRESOLVED")
            continue
        if (candidate_row.get("category_id") != expected[0]
                or candidate_row.get("weapon_danger") != expected[1]
                or data_row.get("category_id") != expected[0]
                or candidate_row.get("source_ref") != "src.game-base-weapons-rows.v1"
                or candidate_row.get("approval_status") not in (None, "candidate")):
            errors.append("WEAPON_DANGER_MISMATCH")
    action_map = next((item for item in mappings if item.get("source_ref") == "src.action-produced-weapon-mechanics.v1"), None)
    if not action_map:
        errors.append("D47_MAPPING_MISSING")
    else:
        result = action_map.get("result", {})
        typed_mappings = result.get("enum_mappings", []) if isinstance(result, dict) else []
        value_entries = [entry for entry in typed_mappings if isinstance(entry, dict)]
        well_typed_entries = all(isinstance(entry.get("d47_enum"), str)
                                 and isinstance(entry.get("weapon_danger"), int)
                                 and not isinstance(entry.get("weapon_danger"), bool)
                                 for entry in value_entries)
        values = ({entry.get("d47_enum"): entry.get("weapon_danger") for entry in value_entries}
                  if well_typed_entries else {})
        valid_values = len(value_entries) == len(typed_mappings) and well_typed_entries
        if (not isinstance(result, dict) or result.get("mapping_schema") != "weapon_danger_mapping.v1"
                or len(values) != len(typed_mappings)
                or values != EXPECTED_WEAPON_MAP or not valid_values):
            errors.append("D47_MAPPING_INVALID")

    durations = bundle.get("durations", {}).get("per_action_profiles", [])
    supported = set(app.get("supported_action_classes", []))
    seen_profiles = set()
    seen_actions = set()
    for profile in durations:
        profile_id = profile.get("profile_id")
        action = profile.get("action_class")
        issue(errors, not profile_id or profile_id in seen_profiles, "PROFILE_ID_DUPLICATE_OR_EMPTY")
        issue(errors, not action or action in seen_actions, "ACTION_PROFILE_DUPLICATE_OR_EMPTY")
        if profile_id:
            seen_profiles.add(profile_id)
        if action:
            seen_actions.add(action)
        elapsed = profile.get("duration_minutes", {})
        numerator, denominator = elapsed.get("numerator"), elapsed.get("denominator")
        is_int = lambda x: isinstance(x, int) and not isinstance(x, bool)
        issue(errors, not is_int(numerator) or not is_int(denominator), "DURATION_NOT_RATIONAL_INTEGER")
        if is_int(numerator) and is_int(denominator):
            issue(errors, numerator <= 0, "DURATION_NOT_POSITIVE")
            issue(errors, denominator <= 0, "DURATION_DENOMINATOR_INVALID")
            if numerator > 0 and denominator > 0:
                reduced = Fraction(numerator, denominator)
                issue(errors, reduced.numerator != numerator or reduced.denominator != denominator,
                      "DURATION_NOT_REDUCED")
                seconds = profile.get("equivalent_seconds")
                issue(errors, not is_int(seconds) or Fraction(numerator * 60, denominator) != seconds,
                      "DURATION_SECONDS_MISMATCH")
        calibration = profile.get("calibration", {})
        issue(errors, calibration.get("kind") != "game_calibration", "D71_LABEL_MISSING")
        issue(errors, calibration.get("label_internal_only") != "D71", "D71_INTERNAL_LABEL_INVALID")
        issue(errors, calibration.get("status") != "proposed_unbenchmarked", "CALIBRATION_STATUS_INVALID")
        bounds = calibration.get("allowed_bounds_seconds", {})
        proposed_seconds = calibration.get("candidate_value_seconds")
        lo, hi = bounds.get("min_inclusive"), bounds.get("max_inclusive")
        minute_bounds = calibration.get("allowed_bounds_minutes", {})
        issue(errors, minute_bounds != {"min":{"numerator":1,"denominator":12},
                                        "max":{"numerator":1,"denominator":6}},
              "DURATION_MINUTE_BOUNDS_INVALID")
        issue(errors, not is_int(proposed_seconds) or not is_int(lo) or not is_int(hi)
              or lo <= 0 or hi < lo or (is_int(proposed_seconds) and not lo <= proposed_seconds <= hi),
              "DURATION_CALIBRATION_BOUNDS_INVALID")
        issue(errors, not calibration.get("rationale") or not calibration.get("decision_rule"),
              "DURATION_CALIBRATION_RATIONALE_MISSING")
        if is_int(numerator) and is_int(denominator) and denominator > 0:
            exact_seconds = Fraction(numerator * 60, denominator)
            if is_int(lo) and is_int(hi):
                issue(errors, exact_seconds < lo or exact_seconds > hi, "DURATION_OUTSIDE_D71_BOUNDS")
            issue(errors, exact_seconds != proposed_seconds, "DURATION_PROPOSAL_VALUE_MISMATCH")
    issue(errors, seen_actions != supported or supported != EXPECTED_ACTION_PROFILES,
          "SUPPORTED_ACTION_PROFILE_COVERAGE")
    issue(errors, bundle.get("durations", {}).get("round_clock") is not False, "ROUND_CLOCK_ENABLED")
    event = bundle.get("durations", {}).get("npc_boundary_and_intent_events", {})
    delta = event.get("elapsed_delta", {})
    issue(errors, event.get("time_bearing") is not False or delta != {"numerator": 0, "denominator": 1},
          "CONTROL_EVENT_TIME_INVALID")

    npc = bundle.get("npc_decision", {})
    gaps_list = gaps.get("gaps", [])
    if not isinstance(gaps_list, list):
        errors.append("GAP_SCHEMA_INVALID")
        gaps_list = []
    issue(errors, npc.get("percentages_or_universal_hp_threshold") is not False,
          "UNIVERSAL_HP_THRESHOLD")
    issue(errors, not npc.get("meaningful_boundary", {}).get("rule"), "BOUNDARY_RULE_MISSING")
    issue(errors, not npc.get("decision_context_required"), "NPC_CONTEXT_MISSING")
    qualitative = npc.get("body_state_qualitative_context", {})
    issue(errors, qualitative.get("profile_id") != "candidate.npc-body-state-description.v1"
          or qualitative.get("version") != 1 or qualitative.get("status") != "candidate_not_approved",
          "BODY_QUALITATIVE_PROFILE_INVALID")
    issue(errors, set(qualitative.get("metrics", {})) != set(EXPECTED_BODY_STATE_PHRASES),
          "BODY_QUALITATIVE_METRICS_INVALID")
    input_policy = qualitative.get("input_policy", {})
    issue(errors, "authoritative body-state owner readback" not in input_policy.get("eligible_value", "")
          or "never substitute zero" not in input_policy.get("unavailable_or_unreadable", "")
          or "do not consume" not in input_policy.get("unapproved_initialization", ""),
          "BODY_QUALITATIVE_INPUT_POLICY_INVALID")
    for metric, phrases in EXPECTED_BODY_STATE_PHRASES.items():
        data = qualitative.get("metrics", {}).get(metric, {})
        calibration = data.get("threshold_calibration", {})
        issue(errors, data.get("input_range_inclusive") != [0, 100], "BODY_QUALITATIVE_RANGE_INVALID")
        issue(errors, calibration.get("kind") != "game_calibration"
              or calibration.get("label_internal_only") != "D71"
              or calibration.get("status") != "proposed_unbenchmarked"
              or len(calibration.get("source_refs", [])) < 2
              or not calibration.get("rationale"), "BODY_QUALITATIVE_D71_INVALID")
        points = calibration.get("cut_points", [])
        issue(errors, len(points) != 2 or [p.get("value") for p in points] != [30, 70],
              "BODY_QUALITATIVE_CUTPOINTS_INVALID")
        expected_cut_bounds = [[25, 35], [65, 75]]
        for index, point in enumerate(points[:2]):
            bounds = point.get("allowed_bounds_inclusive")
            valid_bounds = (isinstance(bounds, list) and len(bounds) == 2
                            and all(isinstance(value, int) and not isinstance(value, bool) for value in bounds))
            issue(errors, point.get("id") != ["low_to_moderate", "moderate_to_high"][index]
                  or bounds != expected_cut_bounds[index]
                  or point.get("value") != [30, 70][index]
                  or not valid_bounds or not isinstance(point.get("value"), int)
                  or isinstance(point.get("value"), bool)
                  or (valid_bounds and not bounds[0] <= point["value"] <= bounds[1])
                  or not point.get("rationale"), "BODY_QUALITATIVE_CUTPOINT_METADATA_INVALID")
        bands = data.get("bands", [])
        expected_partition = [("low", 0, True, 30, False), ("moderate", 30, True, 70, False), ("high", 70, True, 100, True)]
        issue(errors, len(bands) != 3, "BODY_QUALITATIVE_BANDS_INVALID")
        for index, expected in enumerate(expected_partition):
            if index >= len(bands):
                continue
            band = bands[index]
            actual = (band.get("band_id"), band.get("min_value"), band.get("min_inclusive"),
                      band.get("max_value"), band.get("max_inclusive"))
            issue(errors, actual != expected
                  or not finite_number(band.get("min_value")) or not finite_number(band.get("max_value")),
                  "BODY_QUALITATIVE_PARTITION_INVALID")
            phrase = band.get("npc_description")
            issue(errors, phrase != phrases[index], "BODY_QUALITATIVE_DESCRIPTION_INVALID")
            if isinstance(phrase, str):
                issue(errors, "D71" in phrase or bool(re.search(r"\d", phrase)),
                      "BODY_QUALITATIVE_INTERNAL_LEAK")
                issue(errors, bool(re.search(r"ран|травм|кров|ушиб|перелом|яд|болезн|из-за|потому что|bleed|wound|injur|poison|because", phrase, re.I)),
                      "BODY_QUALITATIVE_CAUSAL_OR_INJURY_CLAIM")
        issue(errors, not data.get("source_refs"), "BODY_QUALITATIVE_SOURCES_MISSING")
    projection = qualitative.get("context_projection", {})
    issue(errors, projection.get("field") != "body_state_descriptions"
          or projection.get("include_only") != ["metric", "npc_description"]
          or not {"numeric_value", "band_bounds", "thresholds", "calibration_metadata", "D71"}.issubset(set(projection.get("omit", [])))
          or "does not assert a wound" not in projection.get("interpretation_limit", ""),
          "BODY_QUALITATIVE_PROJECTION_INVALID")
    issue(errors, "does not select an action" not in qualitative.get("purpose", ""),
          "BODY_QUALITATIVE_ACTION_AUTHORITY_INVALID")
    issue(errors, not any(item.get("id") == "G-NPC-BODY-QUALITATIVE-BANDS"
                          and "npc_decision.body_state_qualitative_context" in item.get("field_paths", [])
                          for item in gaps_list),
          "BODY_QUALITATIVE_APPROVAL_GAP_MISSING")
    issue(errors, gaps.get("schema") != "novgorod.combat_data_typed_gaps.v1"
          or gaps.get("candidate_status") != "candidate_not_approved"
          or not isinstance(gaps.get("gaps"), list), "GAP_SCHEMA_INVALID")
    gap_ids = [item.get("id") for item in gaps_list if isinstance(item, dict)]
    issue(errors, len(gap_ids) != len(set(gap_ids)), "GAP_ID_DUPLICATE")
    issue(errors, not gaps_list, "TYPED_GAPS_EMPTY")
    for item in gaps_list:
        if not isinstance(item, dict):
            errors.append("GAP_INCOMPLETE")
            continue
        paths = item.get("field_paths")
        valid_paths = isinstance(paths, list) and bool(paths) and all(isinstance(path, str) and path.strip() for path in paths)
        issue(errors, not isinstance(item.get("id"), str) or not item.get("id", "").strip()
              or not isinstance(item.get("type"), str) or not item.get("type", "").strip()
              or any(not isinstance(item.get(key), str) or not item.get(key, "").strip()
                     for key in ("owner", "reason", "consumer", "closure"))
              or not valid_paths or (valid_paths and len(paths) != len(set(paths))), "GAP_INCOMPLETE")
    gap_by_id = {item.get("id"): item for item in gaps_list if isinstance(item, dict)}
    issue(errors, not set(EXPECTED_GAP_CONTRACTS).issubset(gap_by_id), "REQUIRED_GAP_MISSING")
    for gap_id, (expected_type, required_paths) in EXPECTED_GAP_CONTRACTS.items():
        entry = gap_by_id.get(gap_id)
        if entry is None:
            continue
        issue(errors, entry.get("type") != expected_type, "GAP_TYPE_INVALID")
        paths = entry.get("field_paths")
        issue(errors, not isinstance(paths, list) or not required_paths.issubset(set(paths)), "GAP_FIELD_PATH_INVALID")

    for item in bundle.get("provenance", {}).get("candidate_numeric_values", []):
        if item.get("kind") != "game_calibration":
            continue
        path = item.get("path", "")
        issue(errors, item.get("label_internal_only") != "D71" or not item.get("rationale")
              or not item.get("source_ref") and not item.get("source_refs"),
              "D71_PROVENANCE_INCOMPLETE")
        if path.endswith(".candidate_value"):
            bounds = item.get("allowed_bounds")
            issue(errors, not isinstance(bounds, list) or len(bounds) != 2
                  or not all(isinstance(v, int) and not isinstance(v, bool) for v in bounds),
                  "D71_PROVENANCE_BOUNDS_MISSING")
        elif path == "durations.per_action_profiles[0].duration_minutes":
            bounds = item.get("allowed_bounds_seconds")
            issue(errors, bounds != [5, 10], "D71_PROVENANCE_BOUNDS_MISSING")
        else:
            errors.append("D71_PROVENANCE_PATH_UNEXPECTED")

    # Internal D71 labels may exist in metadata, never inside a model/player projection.
    for projection_key in ("model_facing_projection", "player_facing_projection"):
        projection = bundle.get(projection_key)
        if projection is not None and "D71" in json.dumps(projection, ensure_ascii=False):
            errors.append("INTERNAL_LABEL_LEAK")
    return sorted(set(errors))


def run_self_test(bundle, source_map, gaps):
    base = validate_bundle(bundle, source_map, gaps)
    if base:
        return [f"BASE_CANDIDATE_INVALID:{','.join(base)}"]
    cases = []

    def expect(name, expected_code, mutate_bundle=lambda b: b, mutate_map=lambda m: m, mutate_gaps=lambda g: g):
        bad = copy.deepcopy(bundle)
        bad_map = copy.deepcopy(source_map)
        bad_gaps = copy.deepcopy(gaps)
        mutate_bundle(bad)
        mutate_map(bad_map)
        mutate_gaps(bad_gaps)
        actual = validate_bundle(bad, bad_map, bad_gaps)
        cases.append((name, expected_code in actual, expected_code, actual))

    expect("approved-as-production", "PRODUCTION_ENABLED",
           lambda b: b.update(production_usable=True))
    expect("scenario-fallback", "SCENARIO_FALLBACK",
           lambda b: b["applicability"].update(fallback_to_scenario_profile=True))
    expect("missing-duration", "SUPPORTED_ACTION_PROFILE_COVERAGE",
           lambda b: b["durations"].update(per_action_profiles=[]))
    expect("zero-duration", "DURATION_NOT_POSITIVE",
           lambda b: b["durations"]["per_action_profiles"][0]["duration_minutes"].update(numerator=0))
    expect("zero-denominator", "DURATION_DENOMINATOR_INVALID",
           lambda b: b["durations"]["per_action_profiles"][0]["duration_minutes"].update(denominator=0))
    expect("float-duration", "DURATION_NOT_RATIONAL_INTEGER",
           lambda b: b["durations"]["per_action_profiles"][0].update(duration_minutes={"numerator": 0.1, "denominator": 1}))
    expect("duplicate-profile-id", "PROFILE_ID_DUPLICATE_OR_EMPTY",
           lambda b: b["durations"]["per_action_profiles"].append(copy.deepcopy(b["durations"]["per_action_profiles"][0])))
    expect("universal-hp-threshold", "UNIVERSAL_HP_THRESHOLD",
           lambda b: b["npc_decision"].update(percentages_or_universal_hp_threshold=True))
    expect("unresolved-source", "SOURCE_REF_UNRESOLVED",
           lambda b: b["execution"]["check"].update(source_ref="src.missing"))
    expect("missing-owner", "OWNER_MISSING",
           lambda b: b["execution"]["check"].update(owner=None))
    expect("missing-field-source", "FIELD_SOURCE_UNRESOLVED",
           lambda b: b.update(),
           lambda m: m["field_sources"].pop("execution.check.normative_rule"))
    expect("duplicate-source-id", "SOURCE_ID_DUPLICATE",
           mutate_map=lambda m: m["sources"].append(copy.deepcopy(m["sources"][0])))
    expect("incomplete-gap", "GAP_INCOMPLETE",
           mutate_gaps=lambda g: g["gaps"][0].update(closure=""))
    expect("inferred-death", "DEATH_IMPLIED_BY_HEALTH",
           lambda b: b["execution"]["health_transition"].update(at_zero="death"))
    expect("broken-quality-boundary", "CHECK_BANDS_INVALID",
           lambda b: b["execution"]["check"]["normative_rule"]["quality_bands"].pop())
    expect("missing-catalog-row-map", "WEAPON_ROW_CANDIDATE_COVERAGE",
           lambda b: b["execution"]["weapon_capability_mapping"]["catalog_row_candidates"].pop())
    expect("wrong-catalog-danger", "WEAPON_DANGER_MISMATCH",
           lambda b: b["execution"]["weapon_capability_mapping"]["catalog_row_candidates"][0].update(weapon_danger=5))
    expect("unknown-catalog-row", "WEAPON_ROW_UNRESOLVED",
           lambda b: b["execution"]["weapon_capability_mapping"]["catalog_row_candidates"][0].update(wp_id="wp_missing"))
    metrics_path = lambda b: b["execution"]["health_transition"]["body_initialization"]["profile_mapping"]["output_profile"]["metrics"]
    expect("body-health-below-range", "BODY_METRIC_BOUNDS_INVALID",
           lambda b: metrics_path(b)["health"].update(candidate_value=-1))
    expect("body-energy-above-range", "BODY_METRIC_BOUNDS_INVALID",
           lambda b: metrics_path(b)["energy"].update(candidate_value=101))
    expect("body-float-value", "BODY_METRIC_VALUE_INVALID",
           lambda b: metrics_path(b)["satiety"].update(candidate_value=70.5))
    expect("body-value-missing", "BODY_METRIC_VALUE_INVALID",
           lambda b: metrics_path(b)["health"].update(candidate_value=None))
    expect("body-boolean-value", "BODY_METRIC_VALUE_INVALID",
           lambda b: metrics_path(b)["health"].update(candidate_value=True))
    expect("body-rule-missing", "BODY_METRIC_RULE_MISSING",
           lambda b: metrics_path(b)["energy"].update(rule=None))
    expect("body-d71-label-missing", "BODY_METRIC_D71_MISSING",
           lambda b: metrics_path(b)["health"]["calibration"].update(label_internal_only=None))
    expect("body-rationale-missing", "BODY_METRIC_RATIONALE_OR_SOURCE_MISSING",
           lambda b: metrics_path(b)["satiety"]["calibration"].update(rationale=""))
    expect("duration-outside-bounds", "DURATION_OUTSIDE_D71_BOUNDS",
           lambda b: b["durations"]["per_action_profiles"][0].update(equivalent_seconds=12, duration_minutes={"numerator":1,"denominator":5}))
    expect("duration-bounds-missing", "DURATION_CALIBRATION_BOUNDS_INVALID",
           lambda b: b["durations"]["per_action_profiles"][0]["calibration"].pop("allowed_bounds_seconds"))
    expect("duration-minute-bounds-invalid", "DURATION_MINUTE_BOUNDS_INVALID",
           lambda b: b["durations"]["per_action_profiles"][0]["calibration"]["allowed_bounds_minutes"]["min"].update(denominator=10))
    expect("duration-rationale-missing", "DURATION_CALIBRATION_RATIONALE_MISSING",
           lambda b: b["durations"]["per_action_profiles"][0]["calibration"].update(rationale=""))
    expect("duration-proposal-mismatch", "DURATION_PROPOSAL_VALUE_MISMATCH",
           lambda b: b["durations"]["per_action_profiles"][0]["calibration"].update(candidate_value_seconds=5))
    expect("body-alternative-out-of-range", "BODY_CALIBRATION_ALTERNATIVE_BOUNDS_INVALID",
           lambda b: b["execution"]["health_transition"]["body_initialization"]["profile_mapping"]["calibration_alternatives"][0]["metrics"].update(health=101))
    expect("d71-provenance-rationale-missing", "D71_PROVENANCE_INCOMPLETE",
           lambda b: next(x for x in b["provenance"]["candidate_numeric_values"] if x.get("kind")=="game_calibration").update(rationale=""))
    expect("hidden-label-leak", "INTERNAL_LABEL_LEAK",
           lambda b: b.update(model_facing_projection={"metadata": "D71"}))
    qualitative_path = lambda b: b["npc_decision"]["body_state_qualitative_context"]
    expect("qualitative-band-missing", "BODY_QUALITATIVE_BANDS_INVALID",
           lambda b: qualitative_path(b)["metrics"]["health"]["bands"].pop())
    expect("qualitative-band-gap", "BODY_QUALITATIVE_PARTITION_INVALID",
           lambda b: qualitative_path(b)["metrics"]["energy"]["bands"][1].update(min_value=31))
    expect("qualitative-fractional-overlap", "BODY_QUALITATIVE_PARTITION_INVALID",
           lambda b: qualitative_path(b)["metrics"]["satiety"]["bands"][1].update(max_inclusive=True))
    expect("qualitative-d71-label-missing", "BODY_QUALITATIVE_D71_INVALID",
           lambda b: qualitative_path(b)["metrics"]["satiety"]["threshold_calibration"].update(label_internal_only=None))
    expect("qualitative-injury-claim", "BODY_QUALITATIVE_CAUSAL_OR_INJURY_CLAIM",
           lambda b: qualitative_path(b)["metrics"]["health"]["bands"][0].update(npc_description="Здоровье низкое: есть рана."))
    expect("qualitative-zero-default", "BODY_QUALITATIVE_INPUT_POLICY_INVALID",
           lambda b: qualitative_path(b)["input_policy"].update(unavailable_or_unreadable="substitute zero"))
    expect("qualitative-approval-gap-missing", "BODY_QUALITATIVE_APPROVAL_GAP_MISSING",
           mutate_gaps=lambda g: g["gaps"].pop())
    expect("source-hash-tamper", "SOURCE_HASH_MISMATCH",
           mutate_map=lambda m: next(s for s in m["sources"] if s.get("sha256")).update(sha256="0" * 64))
    expect("truncated-attack-formula", "ATTACK_FORMULA_INVALID",
           lambda b: b["execution"]["check"]["normative_rule"].update(attack="d20 + floor((attribute_value - 10) / 2)"))
    expect("truncated-harm-formula", "HARM_FORMULA_INVALID",
           lambda b: b["execution"]["harm"].update(normative_rule="damage_score = target_vulnerability + target_protection"))
    expect("health-loss-added", "HEALTH_TRANSITION_INVALID",
           lambda b: b["execution"]["health_transition"].update(rule="next_health = max(0, current_health + committed_health_loss)"))
    expect("nested-source-ref-unresolved", "SOURCE_REF_UNRESOLVED",
           lambda b: qualitative_path(b)["metrics"]["health"]["source_refs"].append("src.not-present"))
    expect("d47-half-danger", "D47_MAPPING_INVALID",
           lambda b: next(r for r in b["execution"]["weapon_capability_mapping"]["rules"]
                          if r.get("source_ref") == "src.action-produced-weapon-mechanics.v1")
           ["result"]["enum_mappings"][0].update(weapon_danger=0.5))
    expect("external-source-hash-missing", "SOURCE_HASH_MISSING",
           mutate_map=lambda m: next(s for s in m["sources"] if s.get("pin_kind", "full_file") == "full_file").update(sha256=None))
    expect("typed-gap-schema-invalid", "GAP_SCHEMA_INVALID",
           mutate_gaps=lambda g: g.update(schema="wrong.schema"))
    expect("typed-gap-value-type-invalid", "GAP_INCOMPLETE",
           mutate_gaps=lambda g: g["gaps"][0].update(field_paths="applicability.values"))
    expect("target-vulnerability-gap-missing", "REQUIRED_GAP_MISSING",
           mutate_gaps=lambda g: g["gaps"].__delitem__(next(i for i,x in enumerate(g["gaps"]) if x["id"]=="G-TARGET-PROTECTION-VULNERABILITY")))
    expect("target-protection-gap-unrelated-path", "GAP_FIELD_PATH_INVALID",
           mutate_gaps=lambda g: next(x for x in g["gaps"] if x["id"]=="G-TARGET-PROTECTION-VULNERABILITY").update(field_paths=["unrelated.path"]))
    expect("owner-initializer-dto-mismatch", "BODY_OWNER_DTO_MAPPING_INVALID",
           lambda b: b["execution"]["health_transition"]["body_initialization"]["owner_initialization_profile_adapter"]
           ["target_dto_mapping"].update(schema="rus.body_state.profile.v1"))
    expect("actor-bound-check-request-missing-target", "ACTOR_BOUND_CHECK_REQUEST_INVALID",
           lambda b: b["execution"]["check"]["owner_request_binding"].update(target_ref=""))
    expect("append-only-excerpt-pin-tamper", "SOURCE_EXCERPT_HASH_MISMATCH",
           mutate_map=lambda m: next(s for s in m["sources"] if s.get("pin_kind")=="append_only_excerpt").update(excerpt_sha256="0"*64))
    failures = [f"{name}: expected {wanted}, received {actual}" for name, ok, wanted, actual in cases if not ok]
    return failures, len(cases)


def main(argv):
    try:
        bundle = load_json(CANDIDATE_PATH)
        source_map = load_json(SOURCE_MAP_PATH)
        gaps = load_json(GAPS_PATH)
    except (OSError, json.JSONDecodeError) as error:
        print(f"INPUT_ERROR: {error}", file=sys.stderr)
        return 2
    if argv == ["--self-test"]:
        result = run_self_test(bundle, source_map, gaps)
        if isinstance(result, list):
            failures, count = result, 0
        else:
            failures, count = result
        if failures:
            print("SELF-TEST FAIL")
            for failure in failures:
                print(failure)
            return 1
        print(f"SELF-TEST PASS ({count} negative cases)")
        return 0
    if argv not in ([], ["--check"]):
        print("usage: validate_combat_data.py [--check|--self-test]", file=sys.stderr)
        return 2
    errors = validate_bundle(bundle, source_map, gaps)
    if errors:
        print("CHECK FAIL: " + ", ".join(errors))
        return 1
    print("CHECK PASS: candidate structurally valid; status remains candidate_not_approved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
