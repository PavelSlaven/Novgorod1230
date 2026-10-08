# Independent M2c lighting applicability repin review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

Current entity perception candidate: `candidate-v2.json`, SHA-256 `4500e2864f3e49cf116560d6c4552b4b3e3700c6f6c768dcf58dd49ac576c9ae`. Its previous SHA-256 was `5c8ec5864343d38f7e3f9a9e3f7645f50b10eea4f88bf1d2f1b8c22faa151730`. The only candidate change is the target-start source pin; review `review-request-repin-v2.md` and require a fresh exact-data approval for the current candidate before issuing a new lighting applicability attestation.

Compare the current candidate's unchanged applicability with `lighting-applicability-approval.json`, the approved natural placement policy, active Spatial §7.1, G6 physical pins and current visibility owner. Confirm that shared ambient lighting and weather apply only within the same exact committed G6 and do not establish an observation or identity. If review passes, issue a fresh attestation pinned to both the new entity perception candidate SHA-256 and its new independent approval SHA-256. Preserve the old attestation as a record of its reviewed bytes. No import or runtime activation follows.
