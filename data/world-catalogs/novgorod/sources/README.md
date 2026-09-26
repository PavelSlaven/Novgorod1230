# Source datasets (inputs, not game data)

Byte-exact copies of external datasets used as **inputs** for building the Novgorod game base.

**Rule: everything under `sources/` is a source input, not approved game data.**
Nothing here is loaded by the game, by WK, or by world_db. A value from these files enters
the game base only through a domain build that cites it in `source_refs` (dataset id +
file + row id), assigns confidence A/B/C, and passes the normal approval pass.
Files here are never edited; a new upstream version gets a new dataset folder.

Each dataset folder has `PROVENANCE.md`: origin zip/folder, zip sha256, inner path, per-file
sha256 and size, copy date, status, known quality limits.

Rebuild / verify: `python scripts/copy_sources.py` (reads zip members directly, re-checks sha256).

| dataset id | origin | status | files | bytes | content |
|---|---|---|---|---|---|
| [master-archive-v1](master-archive-v1/PROVENANCE.md) | `Downloads/Novgorod1230_MASTER_ARCHIVE_v1.zip` | candidate (not approved) | 32 | 53 978 582 | material_items (3435), other material entities (2196), item-location links (12 997), spawn profiles (46), inventory profiles (26), state variants (90); professions (479), activities (2442), profession-location links (2138), economic links (1520); ingredients (191), recipes (268), food seasonality (5508), religious food rules (12); currencies (13), units and measures (19); catalog md: berries, mushrooms, wild plants, fish, wood/bark/plant materials, agriculture/fishing/hunting consumables. Prices, prompts, images excluded. |
| [costume-dataset-v1](costume-dataset-v1/PROVENANCE.md) | `Downloads/Novgorod1230_costume_dataset_v1.zip` | candidate (not approved) | 11 | 437 309 | costume items (180), role combinations (46), foreigner profiles (10), materials/palette (24), anti-patterns (20), sources (50). |
| [material-culture-scenes-v1](material-culture-scenes-v1/PROVENANCE.md) | `Downloads/Novgorod1230_material_culture_dataset_v1.zip` | candidate (not approved) | 6 | 249 383 | interior/scene templates (66), sources (90). |
| [nov-region-audit-v1](nov-region-audit-v1/PROVENANCE.md) | `Documents/Одним ПРОМТОМ/data/rus13-base-staging/nov_region_audit/` | candidate (not approved) | 5 | 15 211 990 | historical timeline 1230-1250 (175 phases), region generation limits (graph v6), status rules, route guidance (16), sources (12). |
| [character-bible-1230](character-bible-1230/PROVENANCE.md) | `Documents/РИСОВАЛКА ВЕБ/` | candidate (not approved) | 2 | 47 840 | character bible (clothing/footwear/headwear/arms by social role), items.json (9). |

Row counts above were computed by script from the copied files (header excluded).
