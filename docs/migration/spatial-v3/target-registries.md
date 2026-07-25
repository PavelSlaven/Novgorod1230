# Target registries — spatial v3 (G0–G6)

## Status

All entries below have status `target`. They are implementation/migration
ownership records, not active runtime interfaces. The Novgorod P12 source
package and its exact target compilation are approved authoring inputs.
Historical P28 exact-head evidence did not switch production. The later
versioned production activation cutover release `spatial-v3-production-v1`
made v3 the sole production composition; no entry authorizes dual write, mixed
reads or fallback.

## Stable documentation IDs

| ID | Source | Owner/status |
|---|---|---|
| `spatial-architecture-standard-g0-g6` | `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md` | canonical target v4.2.0 |
| `world-generation-and-turns` | `data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt` | target v3 profile; archived v2 traceability |
| `interface-ux` | `data/knowledge-source/corpus/DOCUMENTS/interface_ux.md` | target player projection; archived v2 traceability |
| `novgorod-g1-semantic-catalog` | `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md` | approved P12 source-to-target authoring compilation; historical P28 evidence is accepted, and `spatial-v3-production-v1` activates only the exact approved/pinned records |
| `llm-documentation-navigation` | `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md` | navigation only; not normative activation |

The corpus manifest and generated RAG indexes derive stable IDs from these source documents through `npm run knowledge:generate`; generated artifacts are never edited manually.

## Contract and public-interface registry boundary

`docs/migration/spatial-v3/contract-implementation-matrix.json` is the generated target contract registry. Its source is Appendix B/C of the canonical standard and it is regenerated only by `npm run spatial-v3:matrix`. P08 adds the separate [`p08-public-interface-registry.json`](p08-public-interface-registry.json) and [`p08-interaction-map.md`](p08-interaction-map.md): the eight public factories are package subpath exports. Implemented v3 ports (including P18 traversal resolution and activation validation) are reachable only through those entries with all explicit collaborators supplied; unwired ports return a P07 typed fail-closed result. Active production composition invokes no v2 compatibility path.

## Controlled-vocabulary registry plan

The canonical inventory of `controlled_*` types is Appendix B of
`spatial_architecture_standard_g0_g6.md`; Appendix A defines their closed
state-machine vocabularies. B.0.1 pins all thirteen types to the approved
v1.0.0 `data/contracts/spatial-v3/controlled-vocabularies.v1.json` catalog.
The P07 check verifies path/version/digest and API fail-closed behavior.
`controlled_vocabulary_gap` remains a hard block for unknown values, missing
registry data or digest mismatch. This target registry does not authorize
fallback, dual write or partial activation after the completed versioned production activation cutover.

## Target module ownership map

| Future owner | Target responsibility | Status |
|---|---|---|
| `@rus/space-map` | typed spatial refs, containment, route topology, contexts and endpoints | target |
| `@rus/movement-routes` | path query, plans, method/time resolution, progress and navigation outcomes | target |
| `@rus/materialization` | deterministic stable topology materialization and traces | target |
| `@rus/contracts` | shared discriminated contracts and typed errors only | target |
| turn orchestrator | command sequence, locks, idempotency and commit composition | target |
| presentation/knowledge | player-safe projection only; never factual topology creation | target |
| `@rus/party-store` | P08 repository and combined write-plan commit port skeletons | target |
| `@rus/time-events-history` | target exact-clock/timer contracts; no topology ownership | target |
| `@rus/game-server` | active `spatial-v3-production-v1` composition; no duplicate spatial logic | production |

Duplicate route, endpoint or materialization ownership in applications and
compatibility paths remains prohibited. Production v2 is available only as the
explicit migration/rollback source.
