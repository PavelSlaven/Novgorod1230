"""Read the pinned archive rows selected for occupation import."""
import csv
import json
from pathlib import Path

GROUP = Path(__file__).resolve().parents[2]
AUTHORING = GROUP / "occupations" / "archive-professions.authoring.json"
ARCHIVE = GROUP.parents[1] / "sources" / "master-archive-v1" / "data" / "normalized_source_tables" / "occupations" / "professions.csv"
ARCHIVE_REF = "sources/master-archive-v1/data/normalized_source_tables/occupations/professions.csv"
DERIVATION_REF = "data/normalized_source_tables/occupations/professions.csv"
LOGICAL_NECESSITY_PROFESSIONS = {
    "PRO0096", "PRO0105", "PRO0106", "PRO0108", "PRO0114", "PRO0115",
    "PRO0085", "PRO0099", "PRO0450", "PRO0451",
}
SOURCED_PROFESSIONS = {"PRO0448", "PRO0107", "PRO0109", "PRO0111", "PRO0119"}


def read_archive():
    with ARCHIVE.open(encoding="utf-8-sig", newline="") as stream:
        return {row["profession_id"]: row for row in csv.DictReader(stream)}


def read_authoring():
    return json.loads(AUTHORING.read_text(encoding="utf-8"))


def row_ref(profession_id):
    return f"gb:{ARCHIVE_REF}#{profession_id}"


def derivation_ref(profession_id):
    return f"{DERIVATION_REF}#{profession_id}"


def confidence_basis(row):
    profession_id = row["profession_id"]
    if profession_id in LOGICAL_NECESSITY_PROFESSIONS:
        return "logical_necessity"
    if row["profession_id"] in {"PRO0020", "PRO0021", "PRO0078", "PRO0082"}:
        return "analogy"
    if profession_id in SOURCED_PROFESSIONS:
        return "sourced"
    return "logical_necessity"


def archive_period(row):
    return f"{row['period_from']}-{row['period_to']}"


def provenance_token(row):
    authoring = read_authoring()
    region = row["region_scope"].replace(";", ",")
    policy = ("|policy=context_only_not_mass_default"
              if row["profession_id"] in authoring.get("context_only_variant_profession_ids", [])
              else "")
    return (f"archive_variant:{row_ref(row['profession_id'])}|name={row['name_ru']}|"
            f"basis={confidence_basis(row)}|confidence={row['historical_confidence']}|"
            f"period={archive_period(row)}|region={region}{policy}")
