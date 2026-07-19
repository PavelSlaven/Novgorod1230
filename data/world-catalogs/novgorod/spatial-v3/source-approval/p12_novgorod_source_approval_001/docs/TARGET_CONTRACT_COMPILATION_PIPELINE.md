# Target-contract compilation pipeline

This package is an approved source bundle. It does not collapse unlike source relations into one target table. The branch importer must compile the records through the following pure stages.

## Stage P12-C1 — source verification

**Input:** immutable package manifest, source snapshots and approval record.  
**Output:** verified source snapshot and exact count report.  
**Typed errors:** `p12_source_digest_mismatch`, `p12_source_count_mismatch`, `p12_source_approval_missing`.  
**Side effects:** none.

## Stage P12-C2 — hierarchy reclassification

**Input:** 32 retained G3 records, 195 legacy local G4 records and 242 hierarchy edges.  
**Output:** 32 target G4 sectors, 195 canonical G5 parcels and exact authoring dependency mappings.  
**Typed errors:** `p12_unmapped_g3_type`, `p12_missing_g5_parent`, `p12_compound_without_structure_proof`, `p12_hierarchy_ambiguity`.  
**Rule:** no target G5 is created from a name alone; every record has an exact legacy ID and provenance.

## Stage P12-C3 — physical-connection classification

**Input:** 358 physical source pairs.  
**Output:** one of the following typed compilation inputs per source pair:

- `intra_g4_site_connection_source` — 227;
- `cross_g4_world_route_source` — 43;
- `host_entry_site_connection_source` — 32;
- `corridor_to_host_route_context_source` — 32;
- `world_route_segment_context_source` — 24.

Every source pair expands to two directional identities. A branch importer may create target rows only after resolving the exact target contract, endpoint slots, environment/orientation profiles and route chain. It may not insert all 358 pairs into `g4_directional_exit` or `world_route` indiscriminately.

**Typed errors:** `p12_connection_classification_gap`, `p12_missing_reverse_direction`, `p12_endpoint_resolution_gap`, `p12_route_chain_ambiguity`.

## Stage P12-C4 — scene-profile compilation

**Input:** 17 approved source families, 17 topological scene-template families, 195 profile assignments.  
**Output:** exactly 195 `scene_materialization_profile` records and 195 single-candidate relations, each bound to one canonical G5.  
**Typed errors:** `p12_scene_profile_gap`, `p12_scene_profile_ambiguity`, `p12_scene_candidate_empty`, `p12_scene_template_unresolved`.

Four boundary sites still receive local scene profiles. Their outward route remains blocked by route availability and boundary-contract validation.

## Stage P12-C5 — branch-contract validation

**Input:** compiled target records and the exact P00–P27 branch schemas/contracts.  
**Output:** validated proposed write set or hard block.  
**Typed errors:** branch-defined P12 contract errors plus `p12_branch_contract_mismatch`.  
**Side effects:** none.

## Stage P12-C6 — isolated database import

**Input:** validated write set, isolated staging database and immutable revision pins.  
**Output:** transactional import/readback report or rollback.  
**Typed errors:** FK, uniqueness, continuity, candidate-set, digest and readiness errors.  
**Side effects:** one explicit staging transaction only.

No stage reads hidden global state, mutates its input, invokes a neighbouring stage or invents a missing endpoint/profile.
