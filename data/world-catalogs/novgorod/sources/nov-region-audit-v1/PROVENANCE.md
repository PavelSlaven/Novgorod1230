# Provenance: nov-region-audit-v1

- Status: **candidate (not approved)**. Source input only, not game data.
- Origin: folder `C:/Users/Slaven/Documents/Одним ПРОМТОМ/data/rus13-base-staging/nov_region_audit`
- Copy date: 2026-09-26
- Method: byte copy by `../scripts/copy_sources.py` (zip members read from the zip itself); sha256 re-verified after write.
- Files: 5, 15211990 bytes

| inner/source path | copied as | bytes | sha256 |
|---|---|---|---|
| `novgorod_historical_timeline_1230_1250_v1.json` | `novgorod_historical_timeline_1230_1250_v1.json` | 2008930 | `08319a3d2746b28bc37f56eebd525df3b15dff9f1e67746e5c75d72d24650046` |
| `novgorod_region_generation_limits_v1.json` | `novgorod_region_generation_limits_v1.json` | 13089389 | `2f7476a2fe83570a16a9d85411686ceaca97ddf51587a9e6d748985300a4e6c9` |
| `novgorod_status_rules_v1.json` | `novgorod_status_rules_v1.json` | 94557 | `97416992b76c8f0e268958474dc28a55ff7cb8bd83c8858695d2174557369ab6` |
| `novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_route_guidance.tsv` | `novgorod_region_route_guidance.tsv` | 14229 | `888f6714d081b255c66ecff65e78de22de0495d5833e5fa578b5c977eb7205ba` |
| `novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_Sources.tsv` | `novgorod_Sources.tsv` | 4885 | `170a5d8d36f9ee7ce18da89f45acd33b6f35bbadfed68d794a799e3545224ee2` |

## Known quality limits

- LLM-generated drafts (2026-07-05/06); timeline marked draft, confidence medium, requires_human_historical_audit=true; main source Novgorod First Chronicle (Michell & Forbes 1914 transl.).
- Timeline and generation limits bind to graph v6 node ids (world_db graph_nodes); generation limits are per-node materialization budgets, not historical data.
- status_rules: ~45 rules + 12 historical key NPC profiles; the 12 NPC overlap tools/rus13-novgorod-regional-templates/novgorod_key_npc_seeds_v1.json.
- route_guidance.tsv and Sources.tsv were not in ../ as the task assumed; they were found in novgorod_region_template_links_v1_full_pack_EXTRACTED/ and copied from there (flattened).
