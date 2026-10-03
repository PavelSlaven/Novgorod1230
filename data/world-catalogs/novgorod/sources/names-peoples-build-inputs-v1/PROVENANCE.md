# Provenance: names-peoples-build-inputs-v1

- Status: **candidate/draft (not approved)**. Source input only, not approved game data.
- Origin folder: `/srv/novgorod-work/data/archives/rus13-nov-region-audit/nov_region_audit/`
- Origin file: `novgorod_neighbor_regions_v1.json` (loose source file; zip SHA-256 is not applicable).
- Snapshot date: 2026-10-02
- Method: byte copy; source and snapshot SHA-256 verified after copy.
- Files: 1, 389344 bytes

| origin path | snapshot path | bytes | SHA-256 | use |
|---|---|---:|---|---|
| `novgorod_neighbor_regions_v1.json` | `novgorod_neighbor_regions_v1.json` | 389344 | `0d3b8e3f6beb8f7772285a4b6f6fbd0e3bc6b1eff7c05578adca68c6438696da` | Candidate neighbor-region names and origins input |

## Known quality limits

- The source JSON marks this material `draft`, with `confidence=medium` and `requires_human_audit=true`; those source statuses are preserved.
- The six neighbor lands are a builder input, not an assertion that every entry is historically verified or approved for runtime use.
- This snapshot preserves source bytes and does not approve, upgrade, or otherwise change the source data's status.
