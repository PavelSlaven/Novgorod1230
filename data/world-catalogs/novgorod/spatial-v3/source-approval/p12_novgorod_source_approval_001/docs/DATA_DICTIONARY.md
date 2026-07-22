# Data dictionary

## `data/g4-host-sectors.json`

Thirty-two target G4 sector scopes, one for each retained G3. They are migration grouping records and do not assert a new place, owner, structure or exact geometry.

## `data/canonical-g5-inventory.json`

Exactly 195 canonical G5 parcels. Every record preserves its legacy ID, source/claim references, evidence status, reconstruction method and route-availability distinction.

## `data/legacy-edge-mapping-bindings.json`

Exactly 600 one-to-one mappings of the approved-local edge source. The `physical` flag and `target_mapping_kind` prevent containment edges from being treated as traversals.

## `data/physical-exit-source-pairs.json`

Exactly 358 bidirectional physical source connections. Each record contains two explicit direction IDs. These are source pairs for importer compilation, not a claim that one directed target record represents both directions.

## Scene files

- `approved-scene-profile-families.json`: 17 reviewed reusable source families.
- `approved-scene-template-families.json`: 17 topological-only template families.
- `scene-materialization-profiles.json`: 195 canonical-G5-bound profiles.
- `scene-materialization-candidates.json`: one deterministic candidate per profile.
- `scene-profile-assignments.json`: complete one-to-one coverage and separate route-availability state.

## Evidence files

Files under `evidence/` are templates only. They are not activation inputs until generated and signed for the exact integration commit.
