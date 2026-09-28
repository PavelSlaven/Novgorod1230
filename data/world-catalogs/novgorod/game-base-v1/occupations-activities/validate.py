"""Check candidate occupation artifacts and their source catalog references."""
import csv
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "npc_runtime_profiles"))
from build import AUTHORING, actor_applicability, read_pinned
ROOT_DATA = HERE.parents[3]
ORIGINAL_CONTEXT = "m2c_npc_regional_novgorod_land_v1"
ORIGINAL_CONTEXT_SHA256 = "43399ce6523e58476339832b4bf8281838871f2ebc02c72c011e2968d2d87d72"
NEW_CONTEXT = "game_base_v1_npc_regional_occupations_candidate_v1"


def refs(value):
    return [part.strip() for part in value.split(";") if part.strip() and not part.strip().startswith("no_source")]


def csv_rows(path, delimiter=","):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=delimiter))


def conflicts(rule, selected):
    condition = rule["if"]
    excluded = rule["incompatible_with"]
    return (all(selected.get(facet) == value for facet, value in condition.items())
            and all(selected.get(facet) is not None and
                    (values == "any" or selected[facet] in values)
            for facet, values in excluded.items()))


def option_applies(option, selected):
    return all(not allowed or selected.get(key) in allowed
               for key, allowed in option["applicability"].items())


def validate_conditional_appearance(option_sets):
    policy = AUTHORING["conditional_option_weight_policy"]
    assert policy["rule"].startswith("D33 editorial game assumption:")
    assert policy["no_source"] == "historical_distribution_of_baldness_and_hair_graying_by_sex_and_age_not_sourced"
    conditional = option_sets["hair_length"] + option_sets["hair_color"]
    assert all(option["rule"] == policy["rule"] and option["no_source"] == policy["no_source"]
               for option in conditional)
    assert all(set(option["applicability"]) <= {"sex_category", "age_category"}
               and all(isinstance(values, list) and values for values in option["applicability"].values())
               for option in conditional)
    bald = "nov_1200_1250_hair_length_bald"
    gray = "nov_1200_1250_hair_color_gray"
    white = "nov_1200_1250_hair_color_white"
    sexes = ("male", "female")
    ages = ("young_adult", "adult", "middle_aged", "old")
    gray_shares = {}
    bald_shares = {}
    for sex in sexes:
        for age in ages:
            selected = {"sex_category": sex, "age_category": age}
            lengths = [option for option in option_sets["hair_length"] if option_applies(option, selected)]
            colors = [option for option in option_sets["hair_color"] if option_applies(option, selected)]
            assert len({option["value"] for option in lengths}) == len(lengths)
            assert len({option["value"] for option in colors}) == len(colors)
            assert all(isinstance(option["weight"], int) and option["weight"] > 0 for option in lengths + colors)
            has_bald = any(option["value"] == bald for option in lengths)
            assert has_bald == (sex == "male" and age != "young_adult")
            total_length = sum(option["weight"] for option in lengths)
            bald_shares[sex, age] = sum(option["weight"] for option in lengths if option["value"] == bald) / total_length
            total_color = sum(option["weight"] for option in colors)
            gray_shares[age] = sum(option["weight"] for option in colors if option["value"] in (gray, white)) / total_color
    assert bald_shares["male", "young_adult"] == 0
    assert 0 < bald_shares["male", "adult"] < bald_shares["male", "middle_aged"] < bald_shares["male", "old"]
    assert all(bald_shares["female", age] == 0 for age in ages)
    assert gray_shares["young_adult"] == 0 < gray_shares["adult"] < gray_shares["middle_aged"] < gray_shares["old"]
    assert gray_shares["old"] > 0.5


def main():
    pinned = csv_rows(ROOT_DATA / "novgorod-region/novgorod_occupations_v1_enriched.tsv", "\t")
    role_rows = {r["role_id"]: r for r in csv_rows(ROOT_DATA / "novgorod-region/novgorod_social_roles_v1_enriched.tsv", "\t")}
    roles = set(role_rows)
    occupations = csv_rows(HERE / "occupations/occupations_additions.csv")
    activities = csv_rows(HERE / "activities_observable/activities_new_occupations.csv")
    npc = json.loads((HERE / "npc_runtime_profiles/npc_runtime_profiles.json").read_text(encoding="utf-8"))
    skill = json.loads((HERE / "skills_competences/skills_competences.json").read_text(encoding="utf-8"))
    fields = set(pinned[0])
    occ_ids = {r["occupation_id"] for r in occupations}
    assert len(occ_ids) == len(occupations) == 19
    for row in occupations:
        assert fields <= row.keys()
        assert row["status"] == "candidate" and row["region_id"] == "region_novgorod_land"
        assert row["occupation_title"] == row["occupation_title_ru"]
        assert row["allowed_social_role_ids"]
        assert {v.strip() for v in row["allowed_social_role_ids"].split(";")} <= roles, (row["occupation_id"], row["allowed_social_role_ids"])
        assert row["runtime_basis_analog_ref"] in {p["occupation_id"] for p in pinned}
        for field in ("daily_schedule_winter", "daily_schedule_spring_rasputitsa",
                      "daily_schedule_summer", "daily_schedule_autumn",
                      "how_to_materialize_as_background_npc", "how_to_materialize_as_scene_npc",
                      "how_to_materialize_as_key_npc", "typical_property", "typical_tools",
                      "typical_clothing", "typical_containers", "typical_local_knowledge",
                      "typical_route_knowledge", "common_relationships", "common_fears",
                      "common_goals", "llm_adaptation_rules", "llm_forbidden_uses"):
            assert row[field] and row[field] != "no_source", (row["occupation_id"], field)
        assert any(s in row["source_refs"] for s in ("book:", "wk:", "no_source:direct_book_or_wk_occupation_attestation"))
    families = {r["pf_id"] for r in csv_rows(HERE.parent / "places-binding/places/place_families.csv")}
    items = {r["it_id"] for kind in ("household", "personal") for r in csv_rows(HERE.parent / f"items-household-personal/items/{kind}.csv")}
    materials = {r["mt_id"] for r in csv_rows(HERE.parent / "crafts-tools-processes/materials_registry/materials.csv")}
    ac = {r["ac_id"]: r for r in activities}
    assert len(ac) == len(activities) == 20
    assert {r["occupation_ref"] for r in activities} == occ_ids
    for row in activities:
        assert row["status"] == "candidate" and row["pf_id"] in families
        assert row["observable_text_ru"] and row["source_refs"]
        for field in ("inputs", "outputs"):
            assert not row[field] or set(row[field].split(";")) <= items | materials
        for field in ("previous_ac_id", "next_ac_id"):
            assert not row[field] or row[field] in ac
    for row in activities:
        if row["next_ac_id"]:
            other = ac[row["next_ac_id"]]
            assert other["previous_ac_id"] == row["ac_id"]
            assert other["inputs"] == row["outputs"]
    assert any(r["next_ac_id"] for r in activities)
    assert npc["status"] == skill["status"] == "candidate"
    profiles = npc["profiles"]
    contexts = {r["id"]: r for r in npc["regional_context_profiles"]}
    assert len(contexts) == len(npc["regional_context_profiles"])
    pinned_contexts = read_pinned()["candidate"]["regional_context_profiles"]
    assert npc["regional_context_profiles"][:-1] == pinned_contexts, "PR98 contexts changed"
    assert npc["regional_context_profiles"][-1]["id"] == NEW_CONTEXT
    original = contexts[ORIGINAL_CONTEXT]
    original_digest = hashlib.sha256(json.dumps(original, sort_keys=True, ensure_ascii=False,
                                                separators=(",", ":")).encode()).hexdigest()
    assert original_digest == ORIGINAL_CONTEXT_SHA256, "original PR98 context changed"
    candidate = contexts[NEW_CONTEXT]
    assert candidate["status"] == "candidate" and candidate["world_revision_id"] is None
    assert candidate["no_source"] == "world_revision_and_concrete_g4_applicability"
    assert candidate["origin"] == {"no_source": "individual_regional_origin_not_derived_from_occupation_or_role"}
    assert candidate["source_refs"] == ["occupations/occupations_additions.csv",
                                        "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv"]
    assert candidate["rule"]
    expected_pairs = {(row["occupation_id"], role) for row in occupations for role in refs(row["allowed_social_role_ids"])}
    assert set(candidate["allowed_occupation_refs"]) == occ_ids
    assert set(candidate["allowed_role_refs"]) == {role for _, role in expected_pairs}
    applicability = {(a["occupation_ref"], a["role_ref"]): a for a in candidate["applicability"]}
    assert len(applicability) == len(candidate["applicability"]) == len(expected_pairs)
    assert set(applicability) == expected_pairs
    for row in occupations:
        for role in refs(row["allowed_social_role_ids"]):
            entry = applicability[row["occupation_id"], role]
            assert entry["g3_place_types"] == refs(row["typical_g3_place_types"])
            assert entry["g4_location_types"] == refs(row["typical_g4_location_types"])
            assert entry["g3_no_source"] == (row["typical_g3_place_types"] if row["typical_g3_place_types"].startswith("no_source:") else None)
            assert entry["g4_no_source"] == (row["typical_g4_location_types"] if row["typical_g4_location_types"].startswith("no_source:") else None)
            assert entry["role_g3_place_types"] == refs(role_rows[role]["typical_g3_place_types"])
            assert entry["role_g4_location_types"] == refs(role_rows[role]["typical_g4_location_types"])
            assert entry["source_refs"] == ["occupations/occupations_additions.csv#" + row["occupation_id"],
                                            "data/novgorod-region/novgorod_social_roles_v1_enriched.tsv#" + role]
            assert entry["rule"]
            assert entry["no_source"] == "concrete_g4_and_generation_template_binding"
    assert len({p["profile_id"] for p in profiles}) == len(profiles) == 28
    assert occ_ids <= {p["occupation_ref"] for p in profiles}
    assert all(not p["executable"] and p["appearance"] and p["clothing"] and p["equipment"] for p in profiles)
    appearance_rows = [r for name in ("region_demographic_profile_entries", "region_appearance_profile_entries")
                       for r in json.loads((HERE.parent.parent / f"spatial-v3/candidates/spatial-v3-production-v4/datasets/{name}.json").read_text(encoding="utf-8"))]
    assert all(r["status"] == "approved" for r in appearance_rows)
    appearance_ids = {r["id"] for r in appearance_rows}
    option_sets = npc["appearance_option_sets"]["novgorod_shared_facets_v1"]
    validate_conditional_appearance(option_sets)
    option_ids = {o["value"] for options in option_sets.values() for o in options}
    names = AUTHORING["option_names_ru"]
    assert len(option_ids) == len(names) == 42 and set(names) == option_ids
    assert len(set(names.values())) == 42
    assert all(isinstance(name, str) and name.strip() == name and re.search(r"[А-Яа-яЁё]", name)
               for name in names.values())
    assert all(option["name_ru"] == names[option["value"]]
               for options in option_sets.values() for option in options)
    rules = npc["appearance_incompatibility_rules"]
    assert rules == AUTHORING["incompatibility_rules"]
    presentation = npc["appearance_presentation_rules"]
    assert presentation == AUTHORING["presentation_rules"]
    assert presentation == [{"id": "hair_visible_only_when_head_uncovered", "scope": "player_facing_appearance",
                             "facets": ["hair_color", "hair_length", "hair_style"],
                             "visible_if": {"equipped_items": {"all_covers_hair": "no",
                                                               "coverage_ref": "clothing-appearance/garments/garments.csv#covers_hair"}},
                             "otherwise": "omit_from_player_facing_projection", "internal_traits": "preserve"}]
    compositions = json.loads((HERE.parent / "places-binding/presence/people_composition_authoring.json").read_text(encoding="utf-8"))["compositions"]
    expected_slot_facts = {(composition["pf_id"], group_id, related_id)
                           for composition in compositions for link in composition.get("slot_relationships", [])
                           if link["relationship_kind"] == "spouse"
                           for group_id, related_id in ((link["from_group_id"], link["to_group_id"]),
                                                        (link["to_group_id"], link["from_group_id"]))}
    slot_facts = npc["composition_slot_facts"]
    assert {(fact["pf_id"], fact["group_id"], fact["related_group_id"]) for fact in slot_facts} == expected_slot_facts
    assert len(slot_facts) == len(expected_slot_facts)
    assert all(fact["marital_status"] == "married" and fact["relationship_kind"] == "spouse" and
               fact["confidence"] == "C" and fact["source_ref"].endswith("#" + fact["pf_id"])
               for fact in slot_facts)
    assert not any(fact["pf_id"] != "pf_peasant_homestead" for fact in slot_facts)
    role_clothing = {row["role_ref"]: row["clothing_profile_id"] for row in csv_rows(HERE.parent / "clothing-appearance/outfits_by_role/role_clothing_map.csv")}
    outfits = {row["of_id"]: row for row in csv_rows(HERE.parent / "clothing-appearance/outfits_by_role/outfits.csv")}
    slot_overrides = AUTHORING["composition_slot_clothing_profile_overrides"]
    assert set(slot_overrides) == {"pf_peasant_homestead.mistress"}
    assert slot_overrides["pf_peasant_homestead.mistress"] == "nov_clothing_rural_v1"
    for fact in slot_facts:
        group = next(group for composition in compositions if composition["pf_id"] == fact["pf_id"]
                     for group in composition["population_groups"] if group["group_id"] == fact["group_id"])
        assert fact["role_ref"] == group["weighted_subjects"][0]["subject_ref"]
        clothing_profile = slot_overrides.get(fact["group_id"], role_clothing[fact["role_ref"]])
        assert fact["clothing_option_refs"] and all(outfits[option]["clothing_profile_id"] == clothing_profile
               and outfits[option]["marital_status"] in ("any", "married") and outfits[option]["runtime_selectable"] == "true"
               for option in fact["clothing_option_refs"])
    mistress = next(fact for fact in slot_facts if fact["group_id"] == "pf_peasant_homestead.mistress")
    assert mistress["clothing_option_refs"] == ["of_rural_female_warm_married", "of_rural_female_cool_married", "of_rural_female_cold_married"]
    householder = next(fact for fact in slot_facts if fact["group_id"] == "pf_peasant_homestead.householder")
    assert householder["clothing_option_refs"] == ["of_rural_male_warm_any", "of_rural_male_cool_any", "of_rural_male_cold_any"]
    assert role_clothing[mistress["role_ref"]] == "nov_clothing_urban_middle_v1"
    for profile in profiles:
        for regional in profile["regional_option_sets"]:
            if regional["role_ref"] == mistress["role_ref"]:
                assert regional["clothing_profile_ref"] == "nov_clothing_urban_middle_v1"
                assert {"of_urban_middle_female_warm_married", "of_urban_middle_female_cool_married",
                        "of_urban_middle_female_cold_married"} <= {option["value"] for option in regional["clothing_options"]}
    assert any(outfits[option]["marital_status"] == "married" and outfits[option]["slot_headwear"] and outfits[option]["slot_head_under"]
               for option in mistress["clothing_option_refs"])
    garments = {row["gm_id"]: row for row in csv_rows(HERE.parent / "clothing-appearance/garments/garments.csv")}
    visible_value = presentation[0]["visible_if"]["equipped_items"]["all_covers_hair"]
    assert visible_value == "no"
    def hair_visible(equipped):
        return all(garments.get(item, {}).get("covers_hair") == visible_value for item in equipped)
    married_outfit = next(outfits[option] for option in mistress["clothing_option_refs"]
                          if outfits[option]["marital_status"] == "married" and
                          outfits[option]["slot_headwear"] == "gm_hw007" and
                          outfits[option]["slot_head_under"] == "gm_hw006")
    base_equipment = [value for slot, value in married_outfit.items()
                      if slot.startswith("slot_") and value and slot not in ("slot_headwear", "slot_head_under")]
    assert garments["gm_hw006"]["covers_hair"] == garments["gm_hw007"]["covers_hair"] == "yes"
    assert hair_visible(base_equipment)
    assert not hair_visible(base_equipment + ["gm_hw006"])
    assert not hair_visible(base_equipment + ["gm_hw007"])
    assert not hair_visible(base_equipment + ["gm_hw011"])
    assert garments["gm_hw011"]["covers_hair"] == "unknown"
    assert not hair_visible(base_equipment + ["unresolved_headwear"])
    rule_by_id = {rule["id"]: rule for rule in rules}
    assert set(rule_by_id) == {"bald_has_no_hair_color", "bald_has_no_hair_style",
                               "young_adult_has_no_gray_or_white_hair"}
    assert len(rules) == len(rule_by_id) == 3
    for rule in rules:
        for facet, value in rule["if"].items():
            assert value in {option["value"] for option in option_sets[facet]}
        for facet, values in rule["incompatible_with"].items():
            assert values == "any" or (isinstance(values, list) and values and
                                       set(values) <= {option["value"] for option in option_sets[facet]})
    bald = rule_by_id["bald_has_no_hair_color"]
    bald_style = rule_by_id["bald_has_no_hair_style"]
    young = rule_by_id["young_adult_has_no_gray_or_white_hair"]
    blond = "nov_1200_1250_hair_color_blond"
    straight = "nov_1200_1250_hair_style_straight"
    gray = "nov_1200_1250_hair_color_gray"
    white = "nov_1200_1250_hair_color_white"
    assert bald["if"] == {"hair_length": "nov_1200_1250_hair_length_bald"}
    assert bald["incompatible_with"] == {"hair_color": "any"} and bald["note"]
    assert conflicts(bald, {"hair_length": bald["if"]["hair_length"], "hair_color": blond})
    assert not conflicts(bald, {"hair_length": "nov_1200_1250_hair_length_short", "hair_color": blond})
    assert not conflicts(bald, {"hair_length": bald["if"]["hair_length"]})
    assert bald_style["if"] == {"hair_length": "nov_1200_1250_hair_length_bald"}
    assert bald_style["incompatible_with"] == {"hair_style": "any"}
    assert conflicts(bald_style, {"hair_length": bald_style["if"]["hair_length"], "hair_style": straight})
    assert not conflicts(bald_style, {"hair_length": "nov_1200_1250_hair_length_short", "hair_style": straight})
    assert not conflicts(bald_style, {"hair_length": bald_style["if"]["hair_length"]})
    assert young["if"] == {"age_category": "nov_1200_1250_age_category_young_adult"}
    assert young["incompatible_with"] == {"hair_color": [gray, white]}
    assert all(conflicts(young, {"age_category": young["if"]["age_category"], "hair_color": color})
               for color in (gray, white))
    assert not conflicts(young, {"age_category": young["if"]["age_category"], "hair_color": blond})
    assert not conflicts(young, {"age_category": "nov_1200_1250_age_category_adult", "hair_color": gray})
    if "--self-test" in sys.argv:
        bad = copy.deepcopy(option_sets)
        next(option for option in bad["hair_length"] if option["value"] == "nov_1200_1250_hair_length_bald")["applicability"].pop("sex_category")
        try:
            validate_conditional_appearance(bad)
        except AssertionError:
            pass
        else:
            raise AssertionError("baldness sex-applicability negative probe passed")
        bad = copy.deepcopy(option_sets)
        for option in bad["hair_color"]:
            if option["value"] in (gray, white) and option["applicability"].get("age_category") == ["old"]:
                option["weight"] = 1
        try:
            validate_conditional_appearance(bad)
        except AssertionError:
            pass
        else:
            raise AssertionError("elderly-gray-weight negative probe passed")
    subjects = npc["subject_applicability"]
    expected_subjects = {
        ("occupation", "nov_occ_ferryman"),
        ("occupation", "nov_occ_crossing_guard"),
        ("occupation", "nov_occ_fisher"),
        ("role", "nov_role_smerd_householder"),
        ("role", "nov_role_household_mistress"),
        ("occupation", "nov_occ_household_servant"),
    }
    assert len(subjects) == len(AUTHORING["subject_applicability"]) == len(expected_subjects)
    assert {(item["subject_kind"], item["subject_id"]) for item in subjects} == expected_subjects
    assert len({(item["subject_kind"], item["subject_id"]) for item in subjects}) == len(subjects)
    assert all(set(item) == {"subject_id", "subject_kind", "actor_applicability"} for item in subjects)
    for item in subjects:
        subject = item["subject_id"]
        kind = item["subject_kind"]
        eligibility = item["actor_applicability"]
        assert kind in ("occupation", "role")
        assert eligibility == actor_applicability(subject if kind == "role" else None,
                                                 subject if kind == "occupation" else None)
        assert set(eligibility["sex_category"]) <= {o["value"] for o in option_sets["sex_category"]}
        assert not any("weight" in key or "probability" in key for key in eligibility)
        assert eligibility["source_refs"] and eligibility["rule"] and eligibility["no_source"]
        for ref in eligibility["source_refs"]:
            path, row_id = ref.split("#", 1)
            assert path.startswith("data/") and row_id
            rows = csv_rows(ROOT_DATA.parent / path, "\t" if path.endswith(".tsv") else ",")
            id_column = ("role_id" if kind == "role" else "occupation_id") if path.endswith(".tsv") else "profession_id"
            assert row_id in {row[id_column] for row in rows}, ref
            if row_id == "PRO0421":
                source = next(row for row in rows if row[id_column] == row_id)
                assert source["gender_scope"] == "female" and source["historical_confidence"] == "B"
        if subject == "nov_occ_household_servant":
            assert set(eligibility["sex_category"]) == {"nov_1200_1250_sex_category_male", "nov_1200_1250_sex_category_female"}
            assert eligibility["source_refs"] == [
                "data/novgorod-region/novgorod_occupations_v1_enriched.tsv#nov_occ_household_servant",
                "data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/occupations/professions.csv#PRO0421"]
            assert "individual" in eligibility["rule"] or "конкретн" in eligibility["rule"]
            assert "female_headwear" in eligibility["no_source"]
        else:
            assert eligibility["sex_category"] == ["nov_1200_1250_sex_category_" +
                                                    ("female" if subject == "nov_role_household_mistress" else "male")]
            assert eligibility["sex_basis"] == "editorial" and eligibility["confidence"] == "C"
        matching = [p for p in profiles if (p["occupation_ref"] if kind == "occupation" else p["role_ref"]) == subject]
        for profile in matching:
            assert profile["actor_applicability"] == eligibility
            for regional in profile["regional_option_sets"]:
                assert regional["actor_applicability"] == eligibility
                if subject == "nov_occ_household_servant":
                    assert "no weighted sex selection" in regional["selection_rule"]
                if subject != "nov_occ_household_servant":
                    assert all(("female" if subject == "nov_role_household_mistress" else "male")
                               in option["applicability"]["sex_categories"]
                               for option in regional["clothing_options"] if option["value"] is not None)
                    assert all(option["applicability"]["marital_status"] == "any"
                               for option in regional["clothing_options"] if option["value"] is not None)
    outfit_rows = csv_rows(HERE.parent / "clothing-appearance/outfits_by_role/outfits.csv")
    assert all(r["status"] == "candidate" for r in outfit_rows)
    outfit_ids = {r["of_id"] for r in outfit_rows if r["runtime_selectable"] == "true"}
    equipment_ids = {r["id"] for r in json.loads((HERE.parent / "items-weapons-armour/authoring/equipment_profiles.json").read_text(encoding="utf-8"))["profiles"]}
    assert npc["approved"] is False and npc["activation_authorized"] is False
    for profile in profiles:
        assert profile["status"] == "candidate" and profile["regional_option_sets"]
        assert {s["role_ref"] for s in profile["regional_option_sets"]} == set(profile["allowed_role_refs"])
        assert len({(s["role_ref"], s["region_ref"]) for s in profile["regional_option_sets"]}) == len(profile["regional_option_sets"])
        for regional in profile["regional_option_sets"]:
            assert regional["status"] == "candidate"
            assert regional["role_ref"] in profile["allowed_role_refs"] and regional["occupation_ref"] == profile["occupation_ref"]
            context = contexts[regional["region_ref"]]
            if profile["occupation_ref"] in occ_ids:
                assert regional["region_ref"] == NEW_CONTEXT
            else:
                assert regional["region_ref"] != NEW_CONTEXT
            if regional["region_ref"] == NEW_CONTEXT:
                assert (regional["occupation_ref"], regional["role_ref"]) in applicability
            else:
                assert context["status"] == "draft" and regional["region_ref"] != NEW_CONTEXT
            assert regional["role_ref"] in context["allowed_role_refs"], (profile["profile_id"], regional["region_ref"], regional["role_ref"])
            assert regional["occupation_ref"] in context["allowed_occupation_refs"], (profile["profile_id"], regional["region_ref"], regional["occupation_ref"])
            appearance_options = npc["appearance_option_sets"][regional["appearance_option_set_ref"]]
            assert set(appearance_options) == set(profile["required_facets"])
            for options in [*appearance_options.values(), regional["clothing_options"], regional["equipment_options"]]:
                assert options and all(isinstance(o["weight"], int) and o["weight"] > 0 for o in options)
                assert all(o["source_ref"] or o["rule"] or o["no_source"] for o in options)
            for options in appearance_options.values():
                assert all(o["source_ref"].split("#", 1)[1] in appearance_ids for o in options)
            assert all(o["value"] is None or o["value"] in outfit_ids for o in regional["clothing_options"])
            assert all(o["value"] is None or o["value"] in equipment_ids or o["source_ref"].startswith(("occupations/", "pr98:"))
                       for o in regional["equipment_options"])
            eligibility = regional["actor_applicability"]
            role = regional["role_ref"]
            occupation = regional["occupation_ref"]
            if occupation == "occ_wetnurse" or role == "nov_role_household_mistress":
                assert eligibility["sex_category"] == ["nov_1200_1250_sex_category_female"]
                assert eligibility["source_refs"]
            if role == "nov_role_apprentice":
                assert eligibility["age_category"] == ["nov_1200_1250_age_category_young_adult"]
                assert eligibility["source_refs"] == ["data/novgorod-region/novgorod_social_roles_v1_enriched.tsv#" + role]
                assert eligibility["no_source"] == "adolescent_age_category_not_in_approved_demographic_enum"
            if occupation == "occ_wetnurse":
                assert eligibility["age_basis"] == "editorial"
                assert eligibility["no_source"] == "individual_marital_status_not_derived_from_occupation"
            if eligibility:
                for facet, column in (("sex_category", "sex_categories"), ("age_category", "age_categories")):
                    if eligibility.get(facet):
                        assert set(eligibility[facet]) <= {option["value"] for option in appearance_options[facet]}
                        valid = {value.removeprefix("nov_1200_1250_" + facet + "_") for value in eligibility[facet]}
                        assert all(valid.intersection(option["applicability"][column]) for option in regional["clothing_options"] if option["value"] is not None)
    wet_nurse = next(p for p in profiles if p["occupation_ref"] == "occ_wetnurse")
    eligibility = wet_nurse["actor_applicability"]
    assert eligibility["sex_category"] == ["nov_1200_1250_sex_category_female"]
    assert set(eligibility["age_category"]) == {
        "nov_1200_1250_age_category_young_adult", "nov_1200_1250_age_category_adult",
        "nov_1200_1250_age_category_middle_aged"}
    for facet in ("sex_category", "age_category"):
        options = npc["appearance_option_sets"]["novgorod_shared_facets_v1"][facet]
        assert set(eligibility[facet]) <= {option["value"] for option in options}
    seed_skills = {r["id"] for r in csv_rows(ROOT_DATA / "world-base-seeds/skill_catalog_v1.csv")}
    defaults = {r["occupation_archetype_id"]: r for r in csv_rows(ROOT_DATA / "world-base-seeds/occupation_skill_defaults_v1.csv")}
    assert {s["id"] for s in skill["parent_skills"]} == seed_skills
    assert {s["occupation_ref"] for s in skill["competences"]} == occ_ids
    for competence in skill["competences"]:
        assert competence["status"] == "candidate"
        assert set(competence["parent_skill_ids"] + competence["secondary_skill_ids"] + competence["gate_skill_ids"] + competence["forbidden_skill_ids"]) <= seed_skills
        archetype = next(o["occupation_archetype_id"] for o in occupations if o["occupation_id"] == competence["occupation_ref"])
        assert competence["parent_skill_ids"] == json.loads(defaults[archetype]["primary_skill_ids"])
        assert competence["default_level_rule"] == defaults[archetype]["default_level_logic"]
    print("OK: 19 occupations, 20 activities, 28 NPC profiles, 19 competences / 12 parent skills")


if __name__ == "__main__":
    main()
