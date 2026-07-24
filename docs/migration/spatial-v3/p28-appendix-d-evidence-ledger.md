# P28 candidate `2ec109c` — Appendix D evidence ledger

## Scope

This ledger binds Appendix D acceptance to exact candidate
`2ec109c99c5e2b33f43dc5f89735e6e72686299b`, PR #19 and the independent
critic `PASS`. It is committed with `release-evidence.v1.json` in the
candidate's single strict direct evidence child.

The candidate passed an isolated clean-clone acceptance: 42,577 staged/imported
rows with zero errors or warnings, PostgreSQL 16 with 190 tables and 190
read-only grants, reproducible generated artifacts, current Graphify/Repository
Intelligence, the full root wrapper and a real-browser test.

Every row below is passed by the final independent audit over candidate-bound
evidence. The manifest raw-byte SHA-256 binds this complete ledger for every
item. Exact-head CI and GitHub completion proof remain separate live P28
requirements.

| Appendix group | Passed items | Candidate evidence |
|---|---:|---|
| D1 — repository and normative readiness | 7 | fixed canonical base, both AGENTS files, mandatory/profile documents, RAG/Graphify record, empty unresolved normative conflicts |
| D2 — contracts, data and DDL | 11 | single contract declarations, resolved types, versioned refs, normalized relations, exact 190-table schema/reference, G5/exits/capacity and hard-block behavior |
| D3 — runtime ownership and execution | 16 | one production owner, preparation-only target, exact time/frontier/boundaries, carrier/mode/journey/portal/knowledge behavior |
| D4 — persistence and concurrency | 9 | partial uniqueness, global lock order, idempotency, clock/result equality, capacity concurrency and reload pinning |
| D5 — migration and compatibility | 7 | full inventory mapping, ambiguity hard-block, no dual write, PostgreSQL lifecycle, new/existing saves, synchronized docs and audit journal |
| D6 — final validation | 8 | contract, negative/property, package, full-project, PostgreSQL, generated-artifact and independent-critic acceptance |

The manifest retains all 58 canonical item identifiers individually; the
grouped presentation above avoids duplicating identical evidence prose.

## P12 and Temporal continuity

- P12 approved authoring projection remains 37 datasets with `data_gaps: []`,
  195 canonical G5 records, 358 physical pairs, 600 typed mappings, 17 scene
  families, 195 profiles and 195 candidates.
- Temporal approved authoring data is complete for all 13 required families:
  21 records, 21 normalized references, 13 provenance records and 46 source
  history records.
- World schema has 18 ordered SQL parts and 190 tables; expanded DDL SHA-256 is
  `6e60005176cd22816887f3c82e1de866ba627728b673a8b3cb7667fd41906d4e`.

## Non-authority boundary

This ledger changes no runtime code, data, DDL, production profile, database or
composition. It contains no standalone activation authority. The P28 gate must
validate the committed bytes, direct candidate-child lineage, exact PR head,
required GitHub check and merge completion:

```text
production_writes: 0
composition_changed: false
```
