# Migration and count semantics

## Source authority

The counts are not estimates. They are the metrics of approved-local `content_revision_002` for `gn_nov_g1_xp017_yp026`: 195 G4 records, 600 graph edges and 358 physical edges. The production candidate supplies 17 profile families and 195 assignments.

## Level mapping

- retained legacy G1/G2/G3 keep their spatial identity;
- one target G4 sector is created for each retained G3 as the scope owner of its local sites;
- every legacy G4 local record is reclassified to canonical G5;
- no record is classified as `compound`, because every source record has an empty `interior_spaces` set;
- exact geometry is not asserted; reconstruction status and source/claim references are preserved.

## Edge mapping

The 600 source records are classified before target import:

- 242 non-physical `contains` records become hierarchy/dependency mappings;
- 358 physical bidirectional records become physical traversal sources;
- each physical pair has two explicit directed identities, producing 716 directed traversal directions;
- intra-host G5↔G5 connections are site-connection sources;
- cross-host and corridor relations are world-route/context sources;
- the importer must not force every source edge into one target contract kind.

This distinction removes the contradiction between source-pair counts and directed target contracts.

## Boundary sites

Four source assignments were previously marked `materialization_allowed=false` only because the external boundary was pending. Spatial v3 separates these concerns: the local canonical G5 scene is valid, while the outward route remains unavailable. The package therefore approves the scene profile and keeps `external_route_availability=blocked_pending_external_boundary`.
