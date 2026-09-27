"""Check candidate occupation artifacts and their source catalog references."""
import csv
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "npc_runtime_profiles"))
from build import read_pinned
ROOT_DATA = HERE.parents[3]
ORIGINAL_CONTEXT = "m2c_npc_regional_novgorod_land_v1"
ORIGINAL_CONTEXT_SHA256 = "43399ce6523e58476339832b4bf8281838871f2ebc02c72c011e2968d2d87d72"
NEW_CONTEXT = "game_base_v1_npc_regional_occupations_candidate_v1"


def refs(value):
    return [part.strip() for part in value.split(";") if part.strip() and not part.strip().startswith("no_source")]


def csv_rows(path, delimiter=","):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter=delimiter))


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
