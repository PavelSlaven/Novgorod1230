"""Byte-copy selected source files into sources/<dataset-id>/ and write PROVENANCE.md.

Zip datasets are read directly from the original zip (not from an unpacked copy),
so each copied file is byte-identical to its zip member. Folder datasets are
copied with shutil.copyfile. sha256 is recomputed from the written file and
compared with the source bytes; any mismatch aborts.

Usage: python copy_sources.py
"""
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[1]
COPY_DATE = "2026-09-26"
DL = Path("C:/Users/Slaven/Downloads")
RUS13 = Path("C:/Users/Slaven/Documents/Одним ПРОМТОМ/data/rus13-base-staging/nov_region_audit")
DRAW = Path("C:/Users/Slaven/Documents/РИСОВАЛКА ВЕБ")

M = "Novgorod1230_MASTER_ARCHIVE_v1/"
MN = M + "data/normalized_source_tables/"
MC = "Novgorod1230_material_culture_dataset_v1/"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


DATASETS = [
    {
        "id": "master-archive-v1",
        "zip": DL / "Novgorod1230_MASTER_ARCHIVE_v1.zip",
        "strip": M,
        "members": [
            M + "README.md",
            M + "docs/provenance.md",
            M + "docs/uncertainty.md",
            M + "docs/sources.md",
            M + "data/canonical/material_items.csv",
            *[MN + "material_entities/" + n for n in (
                "material_entities.csv", "item_location_links.csv", "spawn_profiles.csv",
                "inventory_profiles.csv", "state_variants.csv", "sources.csv", "validation_report.json")],
            *[MN + "occupations/" + n for n in (
                "professions.csv", "activities.csv", "profession_location_links.csv",
                "economic_links.csv", "sources.csv", "validation_report.json")],
            *[MN + "food_system/" + n for n in (
                "ingredients.csv", "recipes.csv", "food_seasonality.csv",
                "religious_food_rules.csv", "sources.csv", "validation_report.json")],
            M + "data/economy_social/currencies.csv",
            M + "data/economy_social/units_and_measures.csv",
            *[M + "source_snapshots/food_system/catalog/" + n for n in (
                "berries.md", "mushrooms.md", "wild_plants.md", "fish.md")],
            *[M + "source_snapshots/material_entities/catalog/" + n for n in (
                "wood_bark_plant_materials.md", "agriculture_fishing_hunting_consumables.md")],
        ],
        "limits": [
            "Model-assembled bulk tables (LLM-built archive, 2026-08-29/30); the repo archive-dispositions.json (2026-09-03) classifies most of the archive as superseded/unreliable for wholesale import. Rows are candidate inputs only.",
            "Item weights absent: all 3333 item rows carry 'not specified'.",
            "Prices deliberately NOT copied: model-derived and unreliable (200 items share one range).",
            "Frequency classes in item_location_links / spawn_profiles are the archive's own model assessments, not archaeological counts.",
            "docs/uncertainty.md: 32 explicit unresolved questions; confidence A-D is historical support, numeric confidence is number quality; model_only values must not be shown as documented.",
            "Per-domain validation_report.json records only structural checks (ids, refs resolve), not historical verification.",
            "Catalog .md files are source snapshots (prose catalogs), not normalized tables.",
        ],
    },
    {
        "id": "costume-dataset-v1",
        "zip": DL / "Novgorod1230_costume_dataset_v1.zip",
        "strip": "",
        "members": [
            "README.md",
            "docs/sources.md",
            "docs/methodology.md",
            "docs/anti_patterns.md",
            *["data/" + n for n in (
                "catalog_items.csv", "combinations.csv", "foreigner_profiles.csv",
                "materials_palette.csv", "anti_patterns.csv", "sources.csv", "validation_report.json")],
        ],
        "limits": [
            "LLM-assisted research dataset (2026-08-29); validation_report status PASS is structural. Confidence letters per row are the dataset's own; not re-verified.",
            "Working period 1180-1260, centred on 1230; some items are reconstructions from wider East Slavic / Baltic analogies.",
            "Image manifest, images and prompts excluded (not game data).",
            "Not present in repo, WK or MASTER; overlaps partly with WK clothing.json (13 concepts).",
        ],
    },
    {
        "id": "material-culture-scenes-v1",
        "zip": DL / "Novgorod1230_material_culture_dataset_v1.zip",
        "strip": MC,
        "members": [
            MC + "README.md",
            MC + "docs/sources.md",
            MC + "docs/data_dictionary.md",
            MC + "data/scenes.csv",
            MC + "data/sources.csv",
            MC + "data/validation_report.json",
        ],
        "limits": [
            "Only scenes are copied: the 1137 catalog items of this zip are already in master-archive-v1 (material_items).",
            "validation_report PASS is structural; its own warnings: source URLs structurally validated only; roofs, upper storeys, windows, wooden church forms, complete vessels and soft-organic mechanisms are reconstruction-heavy; the catalogue is an envelope, not an exhaustive whitelist.",
            "Scene quantities and placement rules are the dataset's own reconstruction.",
        ],
    },
    {
        "id": "nov-region-audit-v1",
        "dir": RUS13,
        "files": [
            "novgorod_historical_timeline_1230_1250_v1.json",
            "novgorod_region_generation_limits_v1.json",
            "novgorod_status_rules_v1.json",
            "novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_route_guidance.tsv",
            "novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_Sources.tsv",
        ],
        "limits": [
            "LLM-generated drafts (2026-07-05/06); timeline marked draft, confidence medium, requires_human_historical_audit=true; main source Novgorod First Chronicle (Michell & Forbes 1914 transl.).",
            "Timeline and generation limits bind to graph v6 node ids (world_db graph_nodes); generation limits are per-node materialization budgets, not historical data.",
            "status_rules: ~45 rules + 12 historical key NPC profiles; the 12 NPC overlap tools/rus13-novgorod-regional-templates/novgorod_key_npc_seeds_v1.json.",
            "route_guidance.tsv and Sources.tsv were not in ../ as the task assumed; they were found in novgorod_region_template_links_v1_full_pack_EXTRACTED/ and copied from there (flattened).",
        ],
    },
    {
        "id": "character-bible-1230",
        "dir": DRAW,
        "files": ["novgorod_character_1230.md", "data/items.json"],
        "limits": [
            "Author research draft for a character-drawing app (2026-08-28); sources cited (15 refs, A/B/C levels) but not approved.",
            "Male figure only; 8+1 social roles; items.json has 9 drawing-layer items (hair, beard, shirts, felt cap, helmet), not a game catalog.",
            "Input for WK claims after source check; do not import as-is.",
        ],
    },
]


def write(dest: Path, data: bytes):
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    if sha_file(dest) != sha(data):
        sys.exit(f"sha mismatch after write: {dest}")


def main():
    summary = []
    for ds in DATASETS:
        root = OUT / ds["id"]
        rows = []
        if "zip" in ds:
            zsha = sha_file(ds["zip"])
            origin = f"zip `{ds['zip'].as_posix()}` (sha256 `{zsha}`, {ds['zip'].stat().st_size} bytes)"
            with zipfile.ZipFile(ds["zip"]) as z:
                for m in ds["members"]:
                    data = z.read(m)
                    rel = m[len(ds["strip"]):]
                    write(root / rel, data)
                    rows.append((m, rel, len(data), sha(data)))
        else:
            origin = f"folder `{ds['dir'].as_posix()}`"
            for f in ds["files"]:
                src = ds["dir"] / f
                rel = Path(f).name if "EXTRACTED" in f else f
                dest = root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dest)
                h = sha_file(dest)
                if h != sha_file(src):
                    sys.exit(f"sha mismatch: {src}")
                rows.append((f, rel, dest.stat().st_size, h))
        total = sum(r[2] for r in rows)
        lines = [
            f"# Provenance: {ds['id']}",
            "",
            "- Status: **candidate (not approved)**. Source input only, not game data.",
            f"- Origin: {origin}",
            f"- Copy date: {COPY_DATE}",
            "- Method: byte copy by `../scripts/copy_sources.py` (zip members read from the zip itself); sha256 re-verified after write.",
            f"- Files: {len(rows)}, {total} bytes",
            "",
            "| inner/source path | copied as | bytes | sha256 |",
            "|---|---|---|---|",
            *[f"| `{a}` | `{b}` | {c} | `{d}` |" for a, b, c, d in rows],
            "",
            "## Known quality limits",
            "",
            *[f"- {x}" for x in ds["limits"]],
            "",
        ]
        (root / "PROVENANCE.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
        summary.append({"id": ds["id"], "files": len(rows), "bytes": total,
                        "rows": [{"from": a, "dest": f"{ds['id']}/{b}", "bytes": c} for a, b, c, _ in rows]})
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
