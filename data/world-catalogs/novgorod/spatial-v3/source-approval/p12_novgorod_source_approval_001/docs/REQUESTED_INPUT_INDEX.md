# Requested input index

| Requested gate input | Package file | Exact package semantics |
|---|---|---|
| canonical G5 inventory — 195 | `data/canonical-g5-inventory.json` | 195 approved canonical `spatial.g5.parcel` records, each mapped one-to-one from a reviewed legacy G4 record and attached to one of 32 target G4 host sectors. |
| directional physical exits — 358 | `data/physical-exit-source-pairs.json` | 358 approved bidirectional physical source pairs. Each contains two explicit directional identities, so target compilation sees 716 directions. |
| route bindings — 600 | `data/legacy-edge-mapping-bindings.json` | 600 approved source edge mappings: 242 hierarchy and 358 physical. `target_mapping_kind` prevents invalid one-table import. |
| approved scene profiles | `data/approved-scene-profile-families.json`, `data/approved-scene-template-families.json`, `data/scene-materialization-profiles.json`, `data/scene-materialization-candidates.json`, `data/scene-profile-assignments.json` | 17 source families and exactly one approved single-candidate profile for each of 195 canonical G5 records. |
| signed P27 audit evidence | `evidence/P27_SIGNED_AUDIT_EVIDENCE.template.json` | Structure only; deliberately invalid until signed for the exact integration commit. |
| fresh-checkout evidence | `evidence/FRESH_CHECKOUT_EVIDENCE.template.json` | Structure only; deliberately invalid until produced in a real clean checkout. |

`data/gap-status.json` is the machine-readable gate summary. Source-data gaps are resolved in this package; the two evidence gaps remain hard blocks until real evidence exists.
