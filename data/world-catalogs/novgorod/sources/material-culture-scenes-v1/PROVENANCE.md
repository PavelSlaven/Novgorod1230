# Provenance: material-culture-scenes-v1

- Status: **candidate (not approved)**. Source input only, not game data.
- Origin: zip `C:/Users/Slaven/Downloads/Novgorod1230_material_culture_dataset_v1.zip` (sha256 `18c04c4ef9e891ec0ed9bc9aebc6f1ef12eb7804bcee894464c220579a327be6`, 6174767 bytes)
- Copy date: 2026-09-26
- Method: byte copy by `../scripts/copy_sources.py` (zip members read from the zip itself); sha256 re-verified after write.
- Files: 6, 249383 bytes

| inner/source path | copied as | bytes | sha256 |
|---|---|---|---|
| `Novgorod1230_material_culture_dataset_v1/README.md` | `README.md` | 4101 | `34791f09a1947b0297c5f51facf2d7fcbc8d0089789cea39a7c120a772d96986` |
| `Novgorod1230_material_culture_dataset_v1/docs/sources.md` | `docs/sources.md` | 46724 | `0dc083e3b5e40db24666bed92882298a14700ee4e2d8adfe0dc807d06c6885bd` |
| `Novgorod1230_material_culture_dataset_v1/docs/data_dictionary.md` | `docs/data_dictionary.md` | 896 | `1c0480a96b64f5d78874506c6832ba42f530d047e7ed9f82e88d3b81523f8981` |
| `Novgorod1230_material_culture_dataset_v1/data/scenes.csv` | `data/scenes.csv` | 119739 | `bb53caf2094c99d5ca5adda3c0ad0f1872b04fa0e44efd948358bf13057cc7aa` |
| `Novgorod1230_material_culture_dataset_v1/data/sources.csv` | `data/sources.csv` | 75169 | `31f425f579a2d633e304fd98e9bf72c650bca87afd17d63b64f90d1a52465d65` |
| `Novgorod1230_material_culture_dataset_v1/data/validation_report.json` | `data/validation_report.json` | 2754 | `0c0eb2939c4186c68459d9ea7f5f6a06c00ad6b82e690ffcb720853b57948edf` |

## Known quality limits

- Only scenes are copied: the 1137 catalog items of this zip are already in master-archive-v1 (material_items).
- validation_report PASS is structural; its own warnings: source URLs structurally validated only; roofs, upper storeys, windows, wooden church forms, complete vessels and soft-organic mechanisms are reconstruction-heavy; the catalogue is an envelope, not an exhaustive whitelist.
- Scene quantities and placement rules are the dataset's own reconstruction.
