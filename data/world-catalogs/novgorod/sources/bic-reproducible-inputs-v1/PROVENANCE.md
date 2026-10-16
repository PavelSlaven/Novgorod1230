# BIC reproducible input snapshots

- Status: **candidate source inputs**, not approved game data.
- Snapshot date: 2026-10-02.
- These files are byte copies of upstream source tables/databases. They are not builder outputs.
- The BIC builder reads the material-culture catalogue, anti-pattern registry and SQLite tables; BIC validation resolves material-culture source IDs, MASTER workshop IDs and curated database IDs. The same SQLite snapshot also backs read-only exact source_refs validation for food/economy and bibliography labels for clothing. It remains a candidate source, not approved game data.
- Source copies checked with SHA-256 after copying.

| Origin | Snapshot path | Bytes | SHA-256 | Use |
|---|---|---:|---|---|
| `archives/downloads/Novgorod1230_material_culture_dataset_v1/Novgorod1230_material_culture_dataset_v1/data/catalog_items.csv` | `data/material-culture/catalog_items.csv` | 3480350 | `fde9f9b3ac786b707cce02e1755536845a23d0c085d8fd3c7dab23ddf11daa91` | Item lookup and archive inclusion |
| `archives/downloads/Novgorod1230_material_culture_dataset_v1/Novgorod1230_material_culture_dataset_v1/data/anti_patterns.json` | `data/material-culture/anti_patterns.json` | 25236 | `ffc6abd5bfd5846e87f09254baab37611342f39b18e62336c29769dad36dcf29` | Anti-pattern lookup |
| `archives/downloads/novgorod_1230_curated.sqlite` | `data/curated/novgorod_1230_curated.sqlite` | 163840 | `61f679a734aea087ccd9a9b34f6c0b76753f0856380b31b6735e603ff4efc94c` | Landmark/source input; read-only source_refs validation for food and economy; bibliography labels for clothing |
| `data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/technology_processes/workshop_profiles.csv` | `data/master/workshop_profiles.csv` | 5936 | `20a2887c81d3f0729cd9518fa37987f142a8aec9cb5d604a759eb4d7074bf988` | BIC validation of `master:workshop:*` refs |

The material-culture source registry is shared from `../material-culture-scenes-v1/data/sources.csv` (75,169 bytes; SHA-256 `31f425f579a2d633e304fd98e9bf72c650bca87afd17d63b64f90d1a52465d65`); it is not copied into this snapshot. The single curated SQLite at `data/curated/novgorod_1230_curated.sqlite` is shared by BIC and items-weapons-armour. The builder also reads the already tracked `sources/material-culture-scenes-v1/data/scenes.csv`, `sources/master-archive-v1/data/normalized_source_tables/material_entities/spawn_profiles.csv`, and v6 TSV files. Their source provenance remains with those inputs.
