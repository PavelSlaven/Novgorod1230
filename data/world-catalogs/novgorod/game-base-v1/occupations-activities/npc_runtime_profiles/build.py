"""Collect sourced candidate NPC profile bases; never authorize runtime use."""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OCC = HERE.parent / "occupations" / "occupations_additions.csv"
DATA = HERE.parents[2]
APPEARANCE = DATA / "spatial-v3/candidates/spatial-v3-production-v4/datasets/region_appearance_profile_entries.json"
DEMOGRAPHIC = DATA / "spatial-v3/candidates/spatial-v3-production-v4/datasets/region_demographic_profile_entries.json"
CLOTHING = DATA / "game-base-v1/clothing-appearance/outfits_by_role/outfits.csv"
ROLE_CLOTHING = DATA / "game-base-v1/clothing-appearance/outfits_by_role/role_clothing_map.csv"
EQUIPMENT = DATA / "game-base-v1/items-weapons-armour/authoring/equipment_profiles.json"
SOURCE = Path(r"C:\Users\Slaven\Documents\Novgorod-runtime\data\world-catalogs\novgorod\m2c-npc")
BASE = SOURCE / "candidate.json"
BINDINGS = SOURCE / "runtime-bindings.json"
OUT = HERE / "npc_runtime_profiles.json"
BASE_REF = "pr98:data/world-catalogs/novgorod/m2c-npc/candidate.json"
BINDING_REF = "pr98:data/world-catalogs/novgorod/m2c-npc/runtime-bindings.json"
APPEARANCE_REF = "data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/datasets/region_appearance_profile_entries.json"
DEMOGRAPHIC_REF = "data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/datasets/region_demographic_profile_entries.json"
CLOTHING_REF = "data/world-catalogs/novgorod/game-base-v1/clothing-appearance/outfits_by_role/outfits.csv"
ROLE_CLOTHING_REF = "data/world-catalogs/novgorod/game-base-v1/clothing-appearance/outfits_by_role/role_clothing_map.csv"
EQUIPMENT_REF = "data/world-catalogs/novgorod/game-base-v1/items-weapons-armour/authoring/equipment_profiles.json"


def rows(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def option(value, weight, source_ref=None, rule=None, no_source=None, **conditions):
    return {"value": value, "weight": weight, "source_ref": source_ref,
            "rule": rule, "no_source": no_source, "applicability": conditions}


def regional_options(profile, role, regions, outfits, clothing_by_role, equipment):
    occupation = profile["occupation_ref"]
    clothing_profile = clothing_by_role.get(role)
    clothing = [option(row["of_id"], 1, CLOTHING_REF + "#" + row["of_id"],
                       "equal gameplay weight; filter by sex, age, season and marital status",
                       None, sex_categories=row["sex_categories"].split("|"),
                       age_categories=row["age_categories"].split("|"),
                       seasons=row["seasons"].split("|"), marital_status=row["marital_status"])
                for row in outfits if row["clothing_profile_id"] == clothing_profile
                and row["runtime_selectable"] == "true"]
    if not clothing:
        clothing = [option(None, 1, no_source="no_applicable_clothing_outfit")]
    matching = [entry for entry in equipment if
                entry.get("occupation_id") == occupation or
                (entry.get("role_id") == role and entry.get("occupation_id") is None)]
    equip_options = [option(entry["id"], 1, EQUIPMENT_REF + "#" + entry["id"],
                            "candidate equipment profile; context and property must be checked in code",
                            None, context=entry["context"])
                     for entry in matching]
    if not equip_options and profile["equipment"].get("occupation_source_field"):
        equip_options = [option(profile["equipment"]["value"], 1,
                                "occupations/occupations_additions.csv#" + occupation + ":typical_tools",
                                "work-context tools only; resolve item and ownership before actor binding",
                                "exact_item_and_property_binding")]
    if not equip_options and profile["equipment"].get("authoring_source_ref"):
        equip_options = [option(profile["equipment"]["authoring_source_ref"], 1,
                                BASE_REF + "#profiles." + profile["profile_id"] + ".equipment_authoring_source_ref",
                                "authoring reference only; resolve source and actor property before binding",
                                "exact_item_and_property_binding")]
    if not equip_options:
        equip_options = [option(None, 1, no_source="equipment_options_not_authored")]
    return [{"region_ref": region, "role_ref": role, "occupation_ref": occupation,
             "status": "candidate", "appearance_option_set_ref": "novgorod_shared_facets_v1",
             "clothing_profile_ref": clothing_profile,
             "clothing_profile_source_ref": ROLE_CLOTHING_REF + "#" + role if clothing_profile else None,
             "clothing_options": clothing, "equipment_options": equip_options,
             "selection_rule": "code filters applicability and selects by positive gameplay weights; LLM describes committed facts only",
             "no_source": "regional_frequency_weights_not_authored"}
            for region in regions]


def main():
    baseline = json.loads(BASE.read_text(encoding="utf-8"))
    bindings = json.loads(BINDINGS.read_text(encoding="utf-8"))
    regional_contexts = [{"id": r["id"],
                          "allowed_role_refs": r["allowed_role_refs"].copy(),
                          "allowed_occupation_refs": r["allowed_occupation_refs"].copy(),
                          "source_ref": BASE_REF + "#regional_context_profiles." + r["id"]}
                         for r in baseline["regional_context_profiles"]]
    region_ids = {r["id"] for r in regional_contexts}
    occupations = rows(OCC)
    outfit_rows = rows(CLOTHING)
    role_clothing = {row["role_ref"]: row["clothing_profile_id"] for row in rows(ROLE_CLOTHING)}
    equipment = json.loads(EQUIPMENT.read_text(encoding="utf-8"))["profiles"]
    local_context = next(r for r in regional_contexts if r["id"] == "m2c_npc_regional_novgorod_land_v1")
    local_context["allowed_role_refs"] = sorted(set(local_context["allowed_role_refs"]) |
                                                {role.strip() for row in occupations for role in row["allowed_social_role_ids"].split(";")})
    local_context["allowed_occupation_refs"] = sorted(set(local_context["allowed_occupation_refs"]) |
                                                      {row["occupation_id"] for row in occupations})
    local_context["additional_source_ref"] = "occupations/occupations_additions.csv"
    appearance = [(DEMOGRAPHIC_REF, json.loads(DEMOGRAPHIC.read_text(encoding="utf-8"))),
                  (APPEARANCE_REF, json.loads(APPEARANCE.read_text(encoding="utf-8")))]
    appearance_sets = {facet: [option(row["option_id"], row["weight"],
                                      source + "#" + row["id"],
                                      "filter source applicability against previously selected facets in code",
                                      None, **row["applicability"])
                                for source, rows_for_source in appearance for row in rows_for_source
                                if row["facet"] == facet]
                       for facet in baseline["appearance_policy"]["required_facets"]}
    bound = {p["profile_id"]: p for p in bindings["profiles"]}
    profiles = []
    for profile in baseline["profiles"]:
        pid = profile["profile_id"]
        binding = bound[pid]
        profiles.append({
            "profile_id": pid, "occupation_ref": profile["occupation_ref"],
            "role_ref": profile["role_ref"], "status": "candidate",
            "source_status": profile["status"],
            "appearance": {"profile_ref": profile["appearance_profile_source_ref"],
                           "binding": profile["appearance_target_binding"],
                           "selection_rule": "select facets for concrete actor in code"},
            "clothing": binding.get("clothing_binding") or {"no_source": "individual_clothing_binding"},
            "equipment": {"authoring_source_ref": profile["equipment_authoring_source_ref"],
                          "scope": profile.get("equipment_scope"),
                          "binding": binding.get("property_binding") or {"no_source": "individual_equipment_binding"}},
            "routine": binding.get("routine_binding") or {"no_source": "individual_routine_binding"},
            "source_refs": [BASE_REF + "#profiles." + pid,
                            BINDING_REF + "#profiles." + pid], "executable": False,
            "typed_gaps": profile["typed_gaps"],
        })
        profiles[-1]["required_facets"] = baseline["appearance_policy"]["required_facets"]
        profiles[-1]["allowed_role_refs"] = [profile["role_ref"]]
        profiles[-1]["regional_option_sets"] = regional_options(
            profiles[-1], profile["role_ref"], [r["id"] for r in profile["regional_context_candidate_refs"]],
            outfit_rows, role_clothing, equipment)
    for occupation in occupations:
        oid = occupation["occupation_id"]
        profiles.append({
            "profile_id": "profile_" + oid, "occupation_ref": oid,
            "role_ref": occupation["allowed_social_role_ids"].split(";")[0].strip(),
            "role_selection_rule": "first explicitly listed candidate role is the profile default; concrete NPC role must be selected from allowed_role_refs with scene/status evidence",
            "status": "candidate",
            "appearance": {"profile_ref": baseline["appearance_policy"]["source_appearance_profile_ref"],
                           "binding": None, "selection_rule": "select demographic and appearance facets for concrete actor in code; no origin inference"},
            "clothing": {"occupation_source_field": "typical_clothing",
                         "value": occupation["typical_clothing"],
                         "no_source": "individual_clothing_items_and_variant"},
            "equipment": {"occupation_source_field": "typical_tools",
                          "value": occupation["typical_tools"],
                          "no_source": "individual_owned_item_binding"},
            "routine": {season: occupation[field] for season, field in (
                ("winter", "daily_schedule_winter"),
                ("spring", "daily_schedule_spring_rasputitsa"),
                ("summer", "daily_schedule_summer"),
                ("autumn", "daily_schedule_autumn"))},
            "source_refs": ["occupations/occupations_additions.csv#" + oid,
                            BASE_REF + "#appearance_policy"],
            "executable": False,
            "typed_gaps": ["individual_appearance_binding", "individual_clothing_binding",
                           "individual_equipment_property_binding", "candidate_occupation_not_approved"],
        })
        profiles[-1]["required_facets"] = baseline["appearance_policy"]["required_facets"]
        profiles[-1]["allowed_role_refs"] = [role.strip() for role in occupation["allowed_social_role_ids"].split(";")]
        if oid == "occ_wetnurse":
            profiles[-1]["actor_applicability"] = {
                "sex_category": ["nov_1200_1250_sex_category_female"],
                "age_category": ["nov_1200_1250_age_category_young_adult",
                                 "nov_1200_1250_age_category_adult",
                                 "nov_1200_1250_age_category_middle_aged"],
                "rule": "select an eligible actor before choosing appearance, clothing, or equipment"}
        profiles[-1]["regional_option_sets"] = [regional for role in profiles[-1]["allowed_role_refs"]
            for regional in regional_options(profiles[-1], role, ["m2c_npc_regional_novgorod_land_v1"],
                                            outfit_rows, role_clothing, equipment)]
    result = {
        "artifact_type": "npc_runtime_profiles_candidate", "status": "candidate",
        "approved": False, "activation_authorized": False,
        "policy": "Code selects facts and checks actor/role/season/property; LLM describes selected facts only.",
        "appearance_option_sets": {"novgorod_shared_facets_v1": appearance_sets},
        "regional_context_profiles": regional_contexts,
        "appearance_policy_source": baseline["appearance_policy"],
        "g4_composition_source": {"path": BASE_REF, "count": len(baseline["g4_compositions"]),
                                  "rule": "source candidate only; no new presence bindings"},
        "profiles": profiles,
    }
    assert len({p["profile_id"] for p in profiles}) == len(profiles)
    assert all(p["appearance"] and p["clothing"] and p["equipment"] for p in profiles)
    assert all(s["region_ref"] in region_ids for p in profiles for s in p["regional_option_sets"])
    context_by_id = {r["id"]: r for r in regional_contexts}
    assert all(s["role_ref"] in context_by_id[s["region_ref"]]["allowed_role_refs"] and
               s["occupation_ref"] in context_by_id[s["region_ref"]]["allowed_occupation_refs"]
               for p in profiles for s in p["regional_option_sets"])
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(profiles)} candidate profiles")


if __name__ == "__main__":
    main()
