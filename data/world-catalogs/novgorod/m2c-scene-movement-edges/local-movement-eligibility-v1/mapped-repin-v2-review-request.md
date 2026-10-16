# Independent M2c local movement eligibility mapped repin review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit artifacts or self-approve.

Source scene movement edge candidate SHA-256: `c4742a5b9642638b7e2ca3c440ffe344e724549abfa788ed39b8627314957356`, approved by `../repin-data-approval.json`. Source local movement eligibility candidate SHA-256: `e893a85d73c21a0384d63b57d279dfe7325c2d2b35e39a941ed21a9bda9f8f4e`, approved by `../local-movement-eligibility-repin-v2-data-approval.json`.

Mapped bundle: `manifest.json`, SHA-256 `58e95543deec824bfda31abcd16c33814ae03b069c889618b2dd32c342c5b2e8`. `datasets/source_records.json` SHA-256 `071bcc3db82014914fc9b0306c75d0821172ce3c04ed69a1566bc5ed32735529`; `datasets/spatial_v3_local_movement_eligibility_profiles.json` SHA-256 `3923773694dc364f8187eb81edddb2aefa14e6bd122e91e49c51cd4798f65c75`.

Verify the only mapped data change is the candidate SHA-256 in one source record, plus its manifest dataset SHA-256. Verify 68 exact approved adjunct rows and 68 matching authoring versions with canonical digests, unchanged 276 dependency nodes, all four dataset digests, and P12 validation with no errors or data gaps. Verify source candidate remains deterministic and retains all runtime requirements, exclusions, and approval flags. The earlier `mapped-data-approval.json` and `m2c-sol-data-approval.json` remain bound to earlier bytes; if review passes, issue a separate exact mapped-data approval. No import or activation authority follows.
