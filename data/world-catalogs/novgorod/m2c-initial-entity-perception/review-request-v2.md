# Independent M2c initial entity perception data review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

Exact candidate: `data/world-catalogs/novgorod/m2c-initial-entity-perception/candidate-v2.json`, SHA-256 `5c8ec5864343d38f7e3f9a9e3f7645f50b10eea4f88bf1d2f1b8c22faa151730`.

Immutable predecessor: `data/world-catalogs/novgorod/m2c-initial-entity-perception/candidate.json`, SHA-256 `770f1bed777d3e42bf41baeb149558ff6bd7d6cf391c0172a32bbb241e6e6076`. Existing `m2c-sol-data-approval.json` entry `initial_entity_perception_boundary_approval` approves only its gap analysis and explicitly excludes runtime use. Candidate v2 has no inherited approval.

Check exact canonical binding and pinned source bytes. Check active Spatial §7.1 and `createSpatialV3VisibilityResolver`: same G6 `default_clear` supplies clear base; same G6 `explicit` and cross-G6 need a directed `visibility_link`; portal state and actual Temporal lighting/weather and current active committed modifiers constrain the result. Confirm that a complete empty modifier set contributes clear, while missing or incomplete state stays a typed gap. Check NPC existence from committed placement, exterior appearance and equipment from committed Stage 16 state, identity only from committed player knowledge; ground items from committed placement and exterior; exits from visible current position/anchor with approved label and hidden factual destination.

Reject any invented current observation, per-entity cover value, character recognition, item instance, route label, or destination disclosure. Decide data applicability only. A `PASS` does not authorize import, runtime use, or release activation; those require separate owner gates.
