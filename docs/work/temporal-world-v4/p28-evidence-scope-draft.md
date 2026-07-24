# Temporal World v4 — P28 evidence scope draft

Status: `draft_until_final_candidate`

This draft extends the existing Spatial v3 P28 authority; it does not create a
second activation path and does not change production composition.

The final exact-HEAD evidence must bind:

- the active Temporal World norm, ADR-002 through ADR-006 and the normative freeze;
- Spatial contract `4.3.0-target.1`, temporal vocabularies, typed errors, schemas,
  validators and generated contract matrix;
- exact-time, activity, boundary, domain, NPC, carrier, remote-world and
  presentation implementations and tests;
- PostgreSQL DDL, clean migrations, committer/lock/idempotency tests and generated
  schema reference;
- the exact fixed-family manifest
  `docs/work/temporal-world-v4/data-readiness.v1.json`, its validator and tests;
- approved readiness evidence for all 13 required families and zero unresolved
  `temporal_required_data_gap` blockers;
- owner `MODULE.md` documents and generated `MODULE_INDEX.md`, the Temporal
  advance/turn pipelines, ownership and architecture rules, the Temporal
  contract/public-interface registries, and regenerated documentation artifacts;
- regenerated RAG and Graphify artifacts for the candidate HEAD;
- the independent critic verdict for the same candidate content;
- exact PR head, required GitHub checks and existing P28 merge/release proof.

The evidence child remains constrained by
`docs/migration/spatial-v3/p28-evidence-scope.v1.json`. Runtime, contract, DDL,
data and generated implementation artifacts belong to the immutable candidate
parent and may not be introduced through the evidence child.

Before successful P28, required invariants are:

```text
production_writes = 0
production_profile = production_v2
composition_changed = false
temporal_partial_activation = false
```

Only the existing successful P28 activation authority may change those
invariants atomically. No later status-only or evidence-repair commit may be
required to make the accepted candidate semantically complete.
