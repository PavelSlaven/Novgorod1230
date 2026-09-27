# Provenance: costume-dataset-v1

- Status: **candidate (not approved)**. Source input only, not game data.
- Origin: zip `C:/Users/Slaven/Downloads/Novgorod1230_costume_dataset_v1.zip` (sha256 `dd9f6c3fa0d2348db43129f122968f851ed64b4d4699b340a4c472a0f399703a`, 983971 bytes)
- Copy date: 2026-09-26
- Method: byte copy by `../scripts/copy_sources.py` (zip members read from the zip itself); sha256 re-verified after write.
- Files: 11, 437309 bytes

| inner/source path | copied as | bytes | sha256 |
|---|---|---|---|
| `README.md` | `README.md` | 5735 | `610d39adec0aefc567080d6843850ea3e04fd8d67fdb5b352125424a7a9ccc20` |
| `docs/sources.md` | `docs/sources.md` | 48216 | `aa7e32509b8551d53f837e277483238d1733e9625df6a6473c64e269e24a4038` |
| `docs/methodology.md` | `docs/methodology.md` | 6808 | `a1955984e6aba913b1465ca9158b1571d8390176a26a15945064bf9cbb281eb6` |
| `docs/anti_patterns.md` | `docs/anti_patterns.md` | 7970 | `3394f98b0cb98422554d99daf0522116112657d1d7d9c3b4fdc4ccf428fbc12e` |
| `data/catalog_items.csv` | `data/catalog_items.csv` | 269144 | `621e9f9955aa491f87e98e33f501f1915163ac59dd2ffce6dfc35ff8df4d9f02` |
| `data/combinations.csv` | `data/combinations.csv` | 32227 | `00028140c0c9369be8688ad1a303281107fb6499d7eb78c8446ab17df7355974` |
| `data/foreigner_profiles.csv` | `data/foreigner_profiles.csv` | 9315 | `10b9f3d480544f1bf0a612d53c5e796d26ba47116bcb7d3a42caa1c1ac2daff2` |
| `data/materials_palette.csv` | `data/materials_palette.csv` | 10674 | `6c2a36b7f71a90e2cef734d5c0216ec927f657856a35fc12344babdb4a111968` |
| `data/anti_patterns.csv` | `data/anti_patterns.csv` | 6279 | `65df00938946024e107c8fa2ec79f45f54e837023527243cdb22155cbbfec221` |
| `data/sources.csv` | `data/sources.csv` | 39667 | `da64b85ee4a9ded8b455d99a1ed4d3cceb71bcea12456e0a2d1e867383a68c99` |
| `data/validation_report.json` | `data/validation_report.json` | 1274 | `76352a94a680f66c33bd46e674ae3ae390774d234d2fceecbc0aa593a2cea0d5` |

## Known quality limits

- LLM-assisted research dataset (2026-08-29); validation_report status PASS is structural. Confidence letters per row are the dataset's own; not re-verified.
- Working period 1180-1260, centred on 1230; some items are reconstructions from wider East Slavic / Baltic analogies.
- Image manifest, images and prompts excluded (not game data).
- Not present in repo, WK or MASTER; overlaps partly with WK clothing.json (13 concepts).
