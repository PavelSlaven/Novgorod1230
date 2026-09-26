"""Collect sourced candidate NPC profile bases; never authorize runtime use."""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OCC = HERE.parent / "occupations" / "occupations_additions.csv"
SOURCE = Path(r"C:\Users\Slaven\Documents\Novgorod-runtime\data\world-catalogs\novgorod\m2c-npc")
BASE = SOURCE / "candidate.json"
BINDINGS = SOURCE / "runtime-bindings.json"
OUT = HERE / "npc_runtime_profiles.json"
BASE_REF = "pr98:data/world-catalogs/novgorod/m2c-npc/candidate.json"
BINDING_REF = "pr98:data/world-catalogs/novgorod/m2c-npc/runtime-bindings.json"


def main():
    baseline = json.loads(BASE.read_text(encoding="utf-8"))
    bindings = json.loads(BINDINGS.read_text(encoding="utf-8"))
    with OCC.open(encoding="utf-8", newline="") as f:
        occupations = list(csv.DictReader(f))
    bound = {p["profile_id"]: p for p in bindings["profiles"]}
    profiles = []
    for profile in baseline["profiles"]:
        pid = profile["profile_id"]
        binding = bound[pid]
        profiles.append({
            "profile_id": pid, "occupation_ref": profile["occupation_ref"],
            "role_ref": profile["role_ref"], "status": "candidate",
            "appearance": {"profile_ref": profile["appearance_profile_source_ref"],
                           "binding": profile["appearance_target_binding"],
                           "selection_rule": "select facets for concrete actor in code"},
            "clothing": binding.get("clothing_binding") or {"no_source": "individual_clothing_binding"},
            "equipment": {"authoring_source_ref": profile["equipment_authoring_source_ref"],
                          "binding": binding.get("property_binding") or {"no_source": "individual_equipment_binding"}},
            "routine": binding.get("routine_binding") or {"no_source": "individual_routine_binding"},
            "source_refs": [BASE_REF + "#profiles." + pid,
                            BINDING_REF + "#profiles." + pid], "executable": False,
            "typed_gaps": profile["typed_gaps"],
        })
    for occupation in occupations:
        oid = occupation["occupation_id"]
        profiles.append({
            "profile_id": "profile_" + oid, "occupation_ref": oid,
            "role_ref": occupation["allowed_social_role_ids"].split(";")[0].strip(),
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
    result = {
        "artifact_type": "npc_runtime_profiles_candidate", "status": "candidate",
        "approved": False, "activation_authorized": False,
        "policy": "Code selects facts and checks actor/role/season/property; LLM describes selected facts only.",
        "appearance_policy_source": baseline["appearance_policy"],
        "g4_composition_source": {"path": BASE_REF, "count": len(baseline["g4_compositions"]),
                                  "rule": "source candidate only; no new presence bindings"},
        "profiles": profiles,
    }
    assert len({p["profile_id"] for p in profiles}) == len(profiles)
    assert all(p["appearance"] and p["clothing"] and p["equipment"] for p in profiles)
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(profiles)} candidate profiles")


if __name__ == "__main__":
    main()
