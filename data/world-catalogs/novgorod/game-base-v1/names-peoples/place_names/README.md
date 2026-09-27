# place_names — candidate

Status: candidate.

## Method

`../scripts/build-place-names.mjs` reads the v6 naming register:
`DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_naming_register.tsv`
(911 rows) and writes `place_names.csv` (911 rows) 1:1, mapping
`name_status`/`evidence_status` to a confidence band:
`attested` → A, `fictional_historicized_name` → C, everything else → B.

## Counts (from script output)

- 911 rows total.
- `fictional_historicized_name`: 878 rows (confidence C — the source file's
  own `rationale` column says these are "historically plausible
  constructs", explicitly not attested toponyms).
- `historical_or_functional_label`: 33 rows (confidence B).
- 0 rows carry the source file's own `attested` status — the brief's "911
  names with status" turns out to be almost entirely reconstructed/
  fictional-but-plausible, not archival attestation. This is the single
  biggest correction to the brief's framing for this domain.

## Gaps

- **v6→v17 node mapping not done.** `node_ref` in the CSV is the v6
  `region_cell_code` (`nov_g1_xx_xx`), which is NOT the v17
  `spatial_v3` node id the brief's `target_tables` names. Per the brief's
  own gap note ("Имена v6 не перенесены на узлы v17"), this join needs the
  v17 spatial owner and was out of scope for this collector (no v17 node
  table was in the read-only areas this collector was given).
- **`first_attestation` is empty for every row** — the v6 register has no
  date field; the acceptance rule's confidence-C requirement is met, but
  first-attestation dates would need per-name archival research (a real
  gap, not filled here).
- No деduplication against `graph_nodes` (rus13, world_db) was run —
  flagged, not fixed, per token budget for this pass.

## Sources

- `game-base:DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_naming_register.tsv`
  (911 rows, v6, with its own name_status/evidence_status/rationale
  columns used as-is).
