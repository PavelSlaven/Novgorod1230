"""Check candidate occupation artifacts and their source catalog references."""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT_DATA = HERE.parents[3]


def csv_rows(path, delimiter=","):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter=delimiter))


def main():
    pinned = csv_rows(ROOT_DATA / "novgorod-region/novgorod_occupations_v1_enriched.tsv", "\t")
    roles = {r["role_id"] for r in csv_rows(ROOT_DATA / "novgorod-region/novgorod_social_roles_v1_enriched.tsv", "\t")}
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
    assert len({p["profile_id"] for p in profiles}) == len(profiles) == 28
    assert occ_ids <= {p["occupation_ref"] for p in profiles}
    assert all(not p["executable"] and p["appearance"] and p["clothing"] and p["equipment"] for p in profiles)
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
