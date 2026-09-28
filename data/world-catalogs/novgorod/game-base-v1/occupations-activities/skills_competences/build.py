"""Build candidate occupation competences from approved world-base seed rows."""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[4] / "world-base-seeds"
OCC = HERE.parent / "occupations" / "occupations_additions.csv"
OUT = HERE / "skills_competences.json"
LEARNING = "data/world-catalogs/novgorod/world-knowledge/production-v1/category-cartography.json#reconstructed-learning-and-apprenticeship"


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main():
    catalog = read_csv(DATA / "skill_catalog_v1.csv")
    defaults = read_csv(DATA / "occupation_skill_defaults_v1.csv")
    occupations = read_csv(OCC)
    skills = {row["id"]: row for row in catalog}
    archetypes = {row["occupation_archetype_id"]: row for row in defaults}
    rows = []
    for occupation in occupations:
        if occupation["runtime_basis_analog_ref"] == "no_source:no_domain_occupation_analog":
            primary = secondary = gate = forbidden = []
            level_rule = "no_source:occupation_specific_skill_mapping"
            skill_source = "no_source:domain_archetype_does_not_attest_occupation_skills"
        else:
            archetype = archetypes[occupation["occupation_archetype_id"]]
            primary = json.loads(archetype["primary_skill_ids"])
            secondary = json.loads(archetype["secondary_skill_ids"])
            gate = json.loads(archetype["gate_skill_ids"])
            forbidden = json.loads(archetype["forbidden_skill_ids"])
            assert all(s in skills for s in primary + secondary + gate + forbidden)
            assert archetype["default_level_logic"] == "primary +2 typical, secondary +1 if biography supports"
            level_rule = archetype["default_level_logic"]
            skill_source = "world-base-seeds/occupation_skill_defaults_v1.csv#" + archetype["occupation_archetype_id"]
        oid = occupation["occupation_id"]
        rows.append({
            "competence_id": "competence_" + oid,
            "occupation_ref": oid,
            "name_ru": occupation["occupation_title_ru"] + ": практика занятия",
            "parent_skill_ids": primary,
            "secondary_skill_ids": secondary,
            "gate_skill_ids": gate,
            "forbidden_skill_ids": forbidden,
            "default_level_rule": level_rule,
            "age_modifier": "no_source",
            "sex_modifier": "no_source",
            "learning_modes": ["observation", "tasks_matching_capacity_and_risk",
                               "practice_with_feedback"],
            "learning_gates": ["time", "task", "material_access"],
            "source_refs": ["world-base-seeds/skill_catalog_v1.csv",
                            skill_source,
                            LEARNING, "occupations/occupations_additions.csv#" + oid],
            "status": "candidate",
        })
    result = {"artifact_type": "skills_competences_candidate", "status": "candidate",
              "parent_skills": [{"id": s["id"], "title": s["title"], "status": s["status"]} for s in catalog],
              "competences": rows,
              "rule": "Seed level modifiers are conditional; never assign an individual level without biography and code validation."}
    assert len({r["competence_id"] for r in rows}) == len(rows)
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(rows)} candidate competences, {len(skills)} parent skills")


if __name__ == "__main__":
    main()
