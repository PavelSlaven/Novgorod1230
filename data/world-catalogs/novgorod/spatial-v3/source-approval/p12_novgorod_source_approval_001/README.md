# P12 Novgorod source approval package

## Purpose

This package supplies reviewed, finite and digest-pinned source data for the four P12 typed gaps of spatial v3 for `gn_nov_g1_xp017_yp026`. It does not activate production and does not fabricate P27 signatures or fresh-checkout evidence.

## Approved integration inputs

| Input | Approved count | Meaning |
|---|---:|---|
| Canonical G5 inventory | 195 | One-to-one reclassification of the 195 approved-local legacy G4 local parcels into canonical G5. |
| Physical exit source pairs | 358 | The 358 approved bidirectional physical connections. Each expands to two directed traversal records; derived directional count is 716. |
| Legacy edge mapping bindings | 600 | Every approved legacy graph edge: 242 hierarchy bindings plus 358 physical connections. This file is not incorrectly treated as 600 physical routes. |
| Scene profiles | 17 families, 195 profiles, 195 candidates | Every canonical G5 has exactly one approved single-candidate scene materialization profile. |

## Key decisions

1. The 32 retained G3 places receive one target `spatial.g4.sector` host each. This is a migration grouping, not a new historical place.
2. All 195 source local records have zero interior spaces; they are therefore `spatial.g5.parcel`, never `compound` without proof.
3. Four external-boundary sites retain approved scene coverage while their outward route remains blocked pending a separate external boundary contract.
4. The source count 358 is not confused with the directed target-row count 716.
5. The source count 600 is decomposed into hierarchy and physical semantics before target import.

## Status

`APPROVED_FOR_P12_INTEGRATION`, not approved for production activation. P28 remains blocked until actual signed P27 evidence, actual fresh-checkout evidence and branch-specific importer/database/runtime checks pass.

## Verification

```bash
python scripts/validate_bundle.py
python scripts/validate_source_reproduction.py
python scripts/verify_manifest.py
python scripts/verify_evidence.py evidence/P27_SIGNED_AUDIT_EVIDENCE.template.json evidence/FRESH_CHECKOUT_EVIDENCE.template.json
```

The first three commands must pass. The evidence command must fail for the templates; a passing result is allowed only with real evidence bound to the exact integration commit.

See `docs/TARGET_CONTRACT_COMPILATION_PIPELINE.md` for the required branch importer stages and `data/gap-status.json` for the explicit separation between resolved source gaps and pending activation evidence.
