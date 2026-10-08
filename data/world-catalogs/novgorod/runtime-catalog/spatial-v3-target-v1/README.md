# Target runtime catalog successor requests

Status: pending independent compatibility approval. These files are review
inputs, not operational import requests, attestations or active runtime pins.

The requested release is `spatial-v3-production-v17`, world revision
`novgorod_spatial_v3_target_contract_approval_001`, catalog digest
`0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e`.
The item successor is `item_container_spatial_v3_target_001`; the actor
successor is `actor_base_attributes_spatial_v3_target_001`.

The item request binds the existing Gate1 approved catalog, readback and
authoring approval chain. The actor request preserves the approved profile
payload and binds the proposed target item parent. Its parent catalog digest
and readback remain null until that successor actually exists. Historical
v5/v6 approvals do not authorize target compatibility or production activation.

## Reproduce and check

Run from the repository root. `--write` replaces only these two pending
requests; it never opens a database connection. Use the explicit source commit
stored in each request when checking the current preparation.

```powershell
node tools/runtime-catalog-activation/src/spatial-v3-target-catalog-requests.js --subject-commit 821a1e10230fcedd6c846599868bf55521ad0233 --check
node --test tools/runtime-catalog-activation/test/spatial-v3-target-catalog-requests.test.js
```

## Operator prerequisites

1. Read the live target world tuple, approved item membership, schema state,
   current activation events and every existing party pin. Preserve historical
   demo revisions and all existing party pins.
2. Run operator mode `prepare-target-item` with an input containing exact
   `subject_commit`. It reads PostgreSQL through `prepareSpatialV3TargetItemCatalog`
   and returns an exact baseline and overlay with null attestations. The candidate must assert existing
   approved item/container rows. Obtain independent approval for the exact
   baseline, overlay and target compatibility.
3. Use the existing operator `register-baseline`, `import` and `readback`
   modes with those complete approved inputs. Bind their actual digests and
   readback in the successor requests; do not substitute the old Gate1 pin.
4. Build an operational actor request using
   `buildActorBaseAttributesSuccessorImportRequest` with the exact item parent
   revision, catalog digest, compatibility digest and actual readback reference/digest.
   Obtain the independent successor import attestation. Run
   `scripts/run-actor-base-attributes-import.mjs --input <approved-actor-import.json>`;
   the input contains `request` and `attestation`. Explicit input is required for
   the target successor; omitted input retains the historical v1 operation.
5. Obtain the actor import approval, import transactionally, and verify exact
   readback. Then prepare separate activation requests with the live predecessor
   event and current party preflight; obtain independent production approval.
6. Set item activation request `activation_scope` to `new_production_parties_only`.
   Its `runtime_release_id` is the existing canonical `digestEnvelope` of the
   string `spatial-v3-production-v17`; the preflight must use the same value.
   This scope is bound by the request digest and permits existing parties only
   when every party has a pin and there are no inflight commits. Actor activation
   uses `buildActorBaseAttributesSuccessorActivationRequest`, including the live
   predecessor and actor party preflight. Supply the reviewed request, attestation,
   import result and import approval to
   `scripts/run-actor-base-attributes-runtime-activation.mjs --input <approved-actor-activation.json>`
   as `request`, `attestation`, `importResult`, `importApproval`, and pass
   `--party-database-url` for the live preflight. Both actor runners accept
   `--database-url` and an explicit `--write-result` successor path; writing a
   successor result to the historical canonical path is rejected.
7. Verify activation readback before supplying runtime pins to v17. No existing
   party migration, rematerialization or mutation of historical catalog bytes
   belongs to this cutover.

`createSpatialV3TargetProductionRelease` is a separately callable read-only
factory. It accepts the two issued activation approval pairs and reads their
exact committed events, Spatial revision and catalog membership under the
existing activation lock. It is not the default selector and does not prove
complete M2c gameplay readiness, issue an approval or perform deployment.
An independently approved target start/scenario binding is still absent;
after catalog verification the factory fails with
`SPATIAL_V3_TARGET_START_BINDING_REQUIRED`. Historical Lower Dvina scenario
and phase-package pins are not inherited into the target candidate.

The operator entry point is `npm run runtime-catalog:operator -- <mode>`.
Available preparation modes include `prepare-target-item --input <subject.json>`,
`build-target-item-import --input <reviewed-preparation.json>` and
`compile-overlay --input <complete-input.json>`. Apply/readback modes are
`register-baseline --input <approved-input.json>`,
`import --input <approved-input.json>` and `readback --input <exact-pin.json>`.
Database modes require explicit `--world-db-url` and, when applicable,
`--party-db-url`; write modes are dry runs unless both `--confirm` and
`--expected-request-digest` are supplied. Input placeholders above are not
prepared artifacts. Production activation remains blocked until actual independent
approvals, readbacks and a supported operator endpoint exist. The PostgreSQL test
uses explicitly named test-only attestations and does not generate approval files.
