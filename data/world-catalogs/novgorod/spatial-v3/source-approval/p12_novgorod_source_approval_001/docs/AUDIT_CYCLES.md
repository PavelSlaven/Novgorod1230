# Iterative audit record

## Cycle 1 — findings and fixes

1. **Ambiguous count 358.** The request called the records directional exits, while the source contains 358 bidirectional physical edges. Fixed by defining 358 physical source pairs and 716 derived directions.
2. **Ambiguous count 600.** The source contains 242 hierarchy edges and 358 physical edges, not 600 routes. Fixed by creating a typed edge-mapping catalogue and explicit classification.
3. **Missing target parent for migrated G5.** Legacy local records were children of G3, but target canonical G5 requires a G4 parent. Fixed by creating exactly one non-semantic host G4 sector per retained G3.
4. **Unproved compound classification.** Fixed by proving all 195 source records have zero interior spaces and classifying all as parcels.
5. **Boundary/profile conflation.** Four external-boundary blocks incorrectly disabled local scene materialization. Fixed by approving the scene profile while separately blocking the outward route.
6. **Evidence forgery risk.** Fixed by creating explicit templates that are structurally marked non-evidence and fail the verifier.

## Cycle 2 — findings and fixes

1. **Profile family was not enough for target uniqueness.** Fixed by creating 195 source-bound scene profiles and 195 single deterministic candidates.
2. **Possible geometry overclaim.** Fixed by declaring every new scene family topological-only and preserving original reconstruction limits.
3. **Implicit shape fallback.** Fixed by adding a closed mapping for every G3 place type; unknown types hard-fail generation.
4. **Potential edge loss.** Fixed by enforcing one mapping record for every one of the 600 source edges and separate 358/242 totals.

## Cycle 3 — findings and fixes

1. **Four blocked boundary assignments could still appear as missing coverage.** Fixed by requiring one scene assignment for every canonical G5 and separately counting exactly four route-blocked scenes.
2. **Templates could leak placeholders into activation data.** Fixed by isolating templates under `evidence/` and scanning all `data/*.json` for placeholder markers.
3. **Package could be misread as production activation.** Fixed by requiring `production_activation_allowed=false` in the catalogue and manifest.

## Final audit

Automated and manual consistency audit: **PASS, zero unresolved findings** for the package itself. External evidence and repository integration are intentionally not represented as completed facts.
