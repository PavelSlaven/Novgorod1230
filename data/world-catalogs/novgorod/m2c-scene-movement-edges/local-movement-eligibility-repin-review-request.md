# Independent M2c local movement eligibility repin review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

Current scene movement edge candidate: `candidate.json`, SHA-256 `c4742a5b9642638b7e2ca3c440ffe344e724549abfa788ed39b8627314957356`. Require its fresh independent exact-data approval under `review-request-repin.md` first. `m2c-sol-data-approval.json` still approves the previous scene candidate SHA-256 `34d653efa8f96f9ecb9e5a05447e9c5b24fecf4e10983ab8da80973f966880a9`.

Current local movement candidate: `local-movement-eligibility-candidate.json`, SHA-256 `e893a85d73c21a0384d63b57d279dfe7325c2d2b35e39a941ed21a9bda9f8f4e`. Its only edit replaces the scene candidate source SHA-256 above; all 68 records, other source refs, provenance, runtime requirements, exclusions and authority flags must be unchanged. Compare with the deterministic `buildLocalMovementEligibilityCandidate` output after the scene approval pin is updated. Review reciprocal authored edges, single-root transition limit and unchanged position capacity. If review passes, issue a fresh exact-data approval. Preserve earlier approvals as records of their reviewed bytes.

Only after that approval, repin mapped `local-movement-eligibility-v1/datasets/source_records.json`, its manifest dataset SHA-256 and a separate mapped-data approval. No import or runtime activation follows.
