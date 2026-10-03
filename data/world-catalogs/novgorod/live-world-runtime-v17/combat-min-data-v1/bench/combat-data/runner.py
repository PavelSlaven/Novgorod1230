#!/usr/bin/env python3
"""Script-first synthetic candidate checks; no model, server, database, or network."""
import json
import math
import random
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1]
MANIFEST = HERE / "manifest.json"
RESULTS = HERE / "results.json"
ATTR_KEYS = {"strength", "dexterity", "endurance", "reason", "attention", "influence"}


def value_from_profile(profile, endurance):
    metrics = profile["metrics"]
    result = {}
    for metric, item in metrics.items():
        rule = item["rule"]
        if rule["kind"] == "constant":
            result[metric] = rule["value"]
        elif rule["kind"] == "affine_clamp":
            raw = rule["base_value"] + rule["slope"] * (endurance - rule["center"])
            result[metric] = min(rule["clamp_bounds"][1], max(rule["clamp_bounds"][0], raw))
        else:
            raise ValueError("unsupported synthetic rule " + str(rule.get("kind")))
    return result


def variant_bounds(mapping, arm_id, metric):
    if arm_id == "B":
        return mapping["output_profile"]["metrics"][metric]["calibration_bounds"]
    variant = next(x for x in mapping["calibration_alternatives"] if x["id"] == arm_id)
    return variant["allowed_bounds"][metric]


def variant_values(mapping, arm_id, endurance):
    if arm_id == "B":
        return value_from_profile(mapping["output_profile"], endurance)
    variant = next((x for x in mapping["calibration_alternatives"] if x["id"] == arm_id), None)
    if not variant:
        raise ValueError("unknown D71 comparison arm " + str(arm_id))
    return dict(variant["metrics"])


def validated_inputs(case):
    attrs = case.get("attributes", {})
    values = attrs.get("values", {})
    identity = case.get("identity", {})
    if (not case.get("actor_attributes_fixture_only")
            or case.get("actor_attributes_source_ref") != "src.actor-base-attributes.v1"
            or attrs.get("contract_version") != "actor_base_attributes_v1"
            or set(attrs) != {"contract_version", "values", "profile_ref", "generation", "trace"}
            or set(values) != ATTR_KEYS):
        return None
    numeric = list(values.values())
    if any(not isinstance(v, int) or isinstance(v, bool) for v in numeric):
        return None
    if sorted(numeric) != [8,9,10,11,12,13]:
        return None
    profile_ref = attrs.get("profile_ref", {})
    generation = attrs.get("generation", {})
    trace = attrs.get("trace", {})
    seed_basis = generation.get("seed_basis", {})
    digest_re = lambda value: isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)
    if (not profile_ref.get("id") or profile_ref.get("version") != 1
            or not digest_re(profile_ref.get("digest"))
            or generation.get("algorithm_version") != "actor_base_attributes_v1"
            or generation.get("rng_version") != "mulberry32_v1"
            or not digest_re(generation.get("seed_digest"))
            or not seed_basis.get("world_revision_id")
            or not digest_re(seed_basis.get("world_catalog_digest"))
            or not digest_re(seed_basis.get("parent_seed_digest"))
            or not seed_basis.get("actor_slot_ref")
            or seed_basis.get("profile_digest") != profile_ref.get("digest")
            or not generation.get("occupation_archetype_id")
            or not generation.get("priority_mapping_id")
            or not isinstance(generation.get("choices"), list)
            or trace.get("attribute_values") != values
            or trace.get("profile_ref") != profile_ref
            or trace.get("algorithm_version") != generation.get("algorithm_version")
            or trace.get("rng_version") != generation.get("rng_version")
            or trace.get("seed_basis") != seed_basis
            or trace.get("seed_digest") != generation.get("seed_digest")
            or trace.get("occupation_archetype_id") != generation.get("occupation_archetype_id")
            or trace.get("priority_mapping_id") != generation.get("priority_mapping_id")
            or trace.get("choices") != generation.get("choices")):
        return None
    if (not identity.get("identity_ref") or identity.get("schema_version") != 1
            or identity.get("actor_ref") != seed_basis.get("actor_slot_ref")
            or identity.get("fixture_only") is not True):
        return None
    digest = identity.get("digest")
    if not digest_re(digest):
        return None
    return values


def owner_initialization_profile_fixture(body_initialization, initial_state):
    """Test-only output DTO after an explicit fixture approval gate."""
    adapter = body_initialization["owner_initialization_profile_adapter"]
    mapping = body_initialization["profile_mapping"]
    target = adapter["target_dto_mapping"]
    if adapter["candidate_emission"] is not None or adapter["status"] != "blocked_until_owner_and_D67_approval":
        raise ValueError("candidate adapter must remain blocked")
    return {
        "schema": target["schema"], "status": "approved",
        "profile_ref": {
            "entity_ref": {"entity_kind": "body_state_profile",
                           "entity_id": mapping["output_profile"]["profile_id"]},
            "authoring_version": str(mapping["output_profile"]["version"])
        },
        "initial_state": {key: initial_state[key] for key in ("health", "satiety", "energy")}
    }


def resolve_body_case(case, mapping):
    if case.get("persisted_body") is not None:
        return "read_persisted", case["persisted_body"]
    if case.get("readback_error"):
        return "typed_gap_for_actor", None
    if not case.get("approval_fixture"):
        return "typed_gap_for_actor", None
    attrs = validated_inputs(case)
    if attrs is None:
        return "typed_gap_for_actor", None
    # Test-only approval fixture opens arithmetic for comparison; production candidate remains unapproved.
    arm = case.get("arms", ["B"])[0]
    return "candidate_profile", variant_values(mapping, arm, attrs["endurance"])


def margin_quality(margin, bands):
    for band in bands:
        low, high = band["min_margin"], band["max_margin"]
        if low == "-infinity":
            low = None
        if high == "infinity":
            high = None
        if (low is None or margin >= low) and (high is None or margin <= high):
            return band["quality"]
    raise ValueError("quality bands do not cover margin " + str(margin))


def harm_loss(score, bands):
    for band in bands:
        if band["damage_score_min"] <= score and (band["damage_score_max"] is None or score <= band["damage_score_max"]):
            return band["health_loss"]
    raise ValueError("harm bands do not cover score " + str(score))


def qualitative_match(metric, value, profile):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0 <= value <= 100:
        raise ValueError("body value is outside finite [0,100]: " + metric + "/" + str(value))
    bands = profile["metrics"][metric]["bands"]
    matches = [band for band in bands
               if (value > band["min_value"] or (band["min_inclusive"] and value == band["min_value"]))
               and (value < band["max_value"] or (band["max_inclusive"] and value == band["max_value"]))]
    if len(matches) != 1:
        raise ValueError("qualitative value must match exactly one band: " + metric + "/" + str(value))
    band = matches[0]
    return band["band_id"], band["npc_description"]


def evaluate_qualitative_cases(manifest, profile):
    evaluation = manifest.get("npc_state_description_eval", {})
    cases = evaluation.get("cases", [])
    ids = [case.get("id") for case in cases]
    if (evaluation.get("schema") != "novgorod.npc_state_description_eval.v1"
            or evaluation.get("scorer_version") != "exact-candidate-mapping.v1"
            or evaluation.get("model_call") is not False
            or evaluation.get("naturalness_assessed") is not False
            or len(cases) != 15 or len(set(ids)) != 15):
        raise SystemExit("FAIL: qualitative context evaluation must have 15 unique script-first cases")
    results = []
    for case in cases:
        metric = case.get("metric")
        if metric not in {"health", "energy", "satiety"}:
            raise ValueError("unknown qualitative metric in " + str(case.get("id")))
        if case.get("availability") == "unavailable":
            if case.get("value") is not None or case.get("expected_disposition") != "omitted_typed_gap":
                raise ValueError("invalid unknown-state fixture " + case["id"])
            observed = {"disposition": "omitted_typed_gap", "description": None}
            if observed["disposition"] != case["expected_disposition"]:
                raise ValueError("unknown state was not omitted: " + case["id"])
        elif case.get("availability") == "current_authoritative_readback":
            value = case.get("value")
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0 <= value <= 100:
                raise ValueError("invalid current body fixture " + case["id"])
            band_id, description = qualitative_match(metric, value, profile)
            observed = {"disposition": "description", "band_id": band_id, "description": description}
            expected = {"band_id": case.get("expected_band_id"), "description": case.get("expected_description")}
            if {"band_id": band_id, "description": description} != expected:
                raise ValueError("qualitative output mismatch: " + case["id"])
        else:
            raise ValueError("unrecognized qualitative fixture availability " + str(case.get("id")))
        results.append({"id": case["id"], **observed})

    exhaustive_values = 0
    for metric in ("health", "energy", "satiety"):
        for value in range(101):
            qualitative_match(metric, value, profile)
            exhaustive_values += 1
    probes = evaluation.get("fractional_boundary_probes", {})
    fractional_values = probes.get("values", [])
    if not probes.get("per_metric") or probes.get("preserve_input_value_without_rounding") is not True:
        raise ValueError("fractional boundary probe policy missing")
    fractional_checks = 0
    for metric in ("health", "energy", "satiety"):
        for value in fractional_values:
            qualitative_match(metric, value, profile)
            fractional_checks += 1
        for value in probes.get("out_of_range_values", []):
            try:
                qualitative_match(metric, value, profile)
            except ValueError:
                pass
            else:
                raise ValueError("out of range value was accepted")
        for value in (float("nan"), float("inf"), float("-inf")):
            try:
                qualitative_match(metric, value, profile)
            except ValueError:
                pass
            else:
                raise ValueError("non-finite value was accepted")
    return {
        "case_count": len(cases), "case_results": results,
        "exhaustive_integer_values_checked": exhaustive_values,
        "fractional_boundary_checks": fractional_checks,
        "fractional_values_checked_per_metric": fractional_values,
        "out_of_range_and_non_finite_rejected": True,
        "scorer_version": evaluation["scorer_version"], "model_called": False,
        "naturalness_assessed": False,
        "interpretation_limit": evaluation["interpretation_limit"]
    }


def check_boundaries(candidate):
    check_bands = candidate["execution"]["check"]["normative_rule"]["quality_bands"]
    expected_quality = {-10:0,-9:0,-5:0,-4:0,-1:0,0:1,4:1,5:2,9:2,10:3,14:3,15:4}
    for margin, expected in expected_quality.items():
        if margin_quality(margin, check_bands) != expected:
            raise ValueError("check boundary mismatch at " + str(margin))
    harm_bands = candidate["execution"]["harm"]["health_loss_bands"]
    expected_harm = {0:0,1:0,2:5,3:5,4:12,5:12,6:25,7:25,8:45,12:45}
    for score, expected in expected_harm.items():
        if harm_loss(score, harm_bands) != expected:
            raise ValueError("harm boundary mismatch at " + str(score))
    return len(expected_quality), len(expected_harm)


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    candidate_path = OUT / "minimal-combat-bundle.candidate.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    source_map = json.loads((OUT / "source-map.json").read_text(encoding="utf-8"))
    gaps = json.loads((OUT / "typed-gaps.json").read_text(encoding="utf-8"))
    if manifest.get("model_call") is not False or manifest.get("historical_claim") is not False:
        raise SystemExit("FAIL: live/model or historical claim must remain disabled")
    cases = manifest.get("cases", [])
    ids = [case.get("id") for case in cases]
    if len(cases) != 15 or len(set(ids)) != 15 or any(not c.get("assertions") for c in cases):
        raise SystemExit("FAIL: manifest must contain 15 unique combat cases with assertions")
    body_cases = manifest.get("body_mapping_cases", [])
    body_ids = [case.get("id") for case in body_cases]
    if len(body_cases) != 15 or len(set(body_ids)) != 15:
        raise SystemExit("FAIL: manifest must contain 15 unique executable body cases")

    sys.path.insert(0, str(OUT))
    import validate_combat_data
    errors = validate_combat_data.validate_bundle(candidate, source_map, gaps)
    if errors:
        raise SystemExit("FAIL: candidate validation: " + ", ".join(errors))
    body_initialization = candidate["execution"]["health_transition"]["body_initialization"]
    mapping = body_initialization["profile_mapping"]
    qualitative_evaluation = evaluate_qualitative_cases(
        manifest, candidate["npc_decision"]["body_state_qualitative_context"])
    if candidate["status"] != "candidate_not_approved" or candidate["production_usable"] is not False:
        raise SystemExit("FAIL: synthetic bench must not promote candidate")
    variants = manifest.get("body_mapping_calibration", {}).get("variants", [])
    if {v.get("id") for v in variants} != {"A", "B", "C"} or manifest["body_mapping_calibration"].get("selected_proposal") != "B":
        raise SystemExit("FAIL: body calibration arms must define A/B/C with B as unapproved proposal")
    alt_ids = {v["id"] for v in mapping["calibration_alternatives"]}
    for arm in variants:
        if arm.get("label_internal_only") != "D71" or not arm.get("calibration_rationale") or set(arm.get("allowed_bounds", {})) != {"health", "energy", "satiety"}:
            raise SystemExit("FAIL: D71 arm needs bounds and rationale: " + str(arm.get("id")))
        arm_id=arm["id"]
        declared=arm.get("metrics") or arm.get("metrics_at_endurance_10")
        actual=variant_values(mapping,arm_id,10)
        if declared != actual:
            raise SystemExit("FAIL: manifest arm differs from candidate profile: " + arm_id)
        for metric in ("health","energy","satiety"):
            if arm["allowed_bounds"][metric] != variant_bounds(mapping,arm_id,metric):
                raise SystemExit("FAIL: manifest arm bounds differ from candidate profile: " + arm_id + "/" + metric)
        if arm_id in {"A","C"} and arm_id not in alt_ids:
            raise SystemExit("FAIL: comparison arm missing from candidate: " + arm_id)

    case_results = []
    variant_aggregate = {arm: {metric: [] for metric in ("health", "energy", "satiety")} for arm in ("A", "B", "C")}
    for case in body_cases:
        if case.get("kind") in {"valid", "determinism", "identity_variance_not_used"} and case.get("approval_fixture"):
            attrs = validated_inputs(case)
            if attrs is None:
                raise ValueError("valid body case has invalid source fixture: " + case["id"])
            observed = {}
            for arm in case["arms"]:
                observed[arm] = variant_values(mapping, arm, attrs["endurance"])
                if arm == "B":
                    for metric, value in observed[arm].items():
                        bounds = variant_bounds(mapping, arm, metric)
                        if not bounds[0] <= value <= bounds[1]:
                            raise ValueError("body candidate output outside D71 bounds: " + case["id"] + "/" + metric)
                for metric, value in observed[arm].items():
                    variant_aggregate[arm][metric].append(value)
            if case.get("kind") == "identity_variance_not_used":
                values = []
                for index, identity_value in enumerate(case.get("identity_values", []), start=1):
                    identity_case = dict(case)
                    identity_case["identity"] = {"identity_ref":f"fixture:identity:{index}","schema_version":1,
                        "digest":f"{index:064x}","semantic_value":identity_value,
                        "actor_ref":case["attributes"]["generation"]["seed_basis"]["actor_slot_ref"],"fixture_only":True}
                    if validated_inputs(identity_case) is None:
                        raise ValueError("identity test fixture failed its versioned binding")
                    values.append(variant_values(mapping, "B", attrs["endurance"]))
                if not values or any(value != values[0] for value in values[1:]):
                    raise ValueError("identity candidate changed metrics without a rule")
            if case.get("repeat", 1) > 1 and any(variant_values(mapping, "B", attrs["endurance"]) != observed["B"] for _ in range(case["repeat"] - 1)):
                raise ValueError("body mapping is not deterministic")
            if observed != case.get("expected"):
                raise ValueError("body case output mismatch: " + case["id"] + " actual=" + json.dumps(observed,sort_keys=True))
            owner_dto = owner_initialization_profile_fixture(body_initialization, observed["B"])
            if (owner_dto.get("schema") != "rus.body_state.initialization_profile.v1"
                    or owner_dto.get("status") != "approved"
                    or owner_dto.get("initial_state") != observed["B"]
                    or owner_dto.get("profile_ref", {}).get("entity_ref", {}).get("entity_id") != mapping["output_profile"]["profile_id"]):
                raise ValueError("owner initialization DTO mapping mismatch: " + case["id"])
            disposition = "candidate_profile"
        else:
            disposition, value = resolve_body_case(case, mapping)
            expected = case.get("expected_disposition")
            if disposition != expected or (disposition == "read_persisted" and value != case["persisted_body"]):
                raise ValueError("body disposition mismatch: " + case["id"])
            observed = value
        case_results.append({"id": case["id"], "disposition": disposition, "observed": observed,
                             **({"owner_dto_fixture": owner_dto} if disposition == "candidate_profile" else {})})

    check_boundary_count, harm_boundary_count = check_boundaries(candidate)
    # Fixed deterministic arithmetic sample, with explicit test-only neutral inputs.
    rng = random.Random(224_6701)
    rows = []
    for _ in range(1000):
        margin = rng.randint(-19, 10)
        quality = margin_quality(margin, candidate["execution"]["check"]["normative_rule"]["quality_bands"])
        score = max(0, quality + 1)  # weapon danger=1, vulnerability=protection=0 are test fixture values only
        rows.append((quality, score, harm_loss(score, candidate["execution"]["harm"]["health_loss_bands"])))
    quality_counts = {str(q): sum(1 for row in rows if row[0] == q) for q in range(5)}
    harm_counts = {str(h): sum(1 for row in rows if row[2] == h) for h in (0, 5, 12, 25, 45)}

    duration = candidate["durations"]["per_action_profiles"][0]
    allowed = duration["calibration"]["allowed_bounds_seconds"]
    duration_comparison = {}
    for seconds in (5, 6, 10):
        if not allowed["min_inclusive"] <= seconds <= allowed["max_inclusive"]:
            raise ValueError("duration variant outside candidate bounds")
        elapsed = Fraction(seconds, 60)
        if Fraction(elapsed.numerator, elapsed.denominator) != elapsed:
            raise ValueError("duration is not exact")
        duration_comparison[str(seconds)] = {
            "one_step_minutes":{"numerator":elapsed.numerator,"denominator":elapsed.denominator},
            "ten_step_minutes":{"numerator":(elapsed*10).numerator,"denominator":(elapsed*10).denominator},
            "ten_step_seconds":seconds*10
        }

    result = {
        "status":"synthetic_script_dry_run_pass","model_called":False,"game_server_or_database_used":False,
        "combat_case_count":len(cases),"body_mapping_case_count":len(body_cases),"body_mapping_cases":case_results,
        "body_variant_outputs":{arm:{metric:{"min":min(values),"max":max(values),"values":values} for metric,values in metrics.items() if values} for arm,metrics in variant_aggregate.items()},
        "check_boundary_assertions":check_boundary_count,"harm_boundary_assertions":harm_boundary_count,
        "npc_state_description_eval":qualitative_evaluation,
        "candidate_status_after_run":candidate["status"],"seed":2246701,"synthetic_sample_size":len(rows),
        "synthetic_quality_counts":quality_counts,"synthetic_health_loss_counts":harm_counts,
        "duration_comparison":duration_comparison,"typed_gap_count":len(gaps["gaps"]),
        "interpretation":"Synthetic arithmetic and D71 candidate comparison only; no gameplay winner, historical result, D41, D67, or production approval."
    }
    RESULTS.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
