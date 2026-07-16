# Stage 3B-1 — activation proposal (no activation)

## Decision

This is a non-executable proposal. Activation is prohibited without a separate explicit user instruction and completed editorial approvals.

## Candidate revision

- Revision: `world_revision_novgorod_1230_item_catalogue_001`
- Catalog digest: `662d262090079f0b9ecfdebca084b77fb230f0b0bc1eb123ff34f291d2218c4c`
- Revision status: `draft`
- Approved records proposed: 0
- Draft templates retained: 120
- Runtime candidate sets changed: none
- Existing party instances changed: none

## Blocking gates

- 105 templates have no individual historical-presence source binding; 15 bindings remain `draft/needs_review`.
- Material and physical-parameter reviews are incomplete.
- Bulk quantity and general container-compatibility reviews remain incomplete.
- Legacy migration input has not been supplied.
- All dependent profiles, permissions and templates remain draft; an approved record must not depend on them.

## Required future approval and rollback plan

Before any activation, produce a reviewed approved subset, prove its approved dependency closure and rerun Stage 8/16 tests against that subset. Activation must be a separate transactional revision-status change with a pre-change catalog digest, readback audit and rollback to the previous approved revision. It must not rematerialize existing parties.
