# Gate1 owner data

`parent-import-request.json` and the three authoring attestations bind the historical approved Gate1 source and its exact seed closure. `import-readback-result.json` is historical readback, not a v17 import record.

The historical [v17 bootstrap request](v17-bootstrap-import-request.json) and [review notes](v17-bootstrap-approval-request.md) seal the completed Gate1 import into `novgorod_world_v17` (runner then used `local-play`). New installs use [request v2](v17-bootstrap-import-request-v2.json) and [review notes v2](v17-bootstrap-approval-request-v2.md) with mode `v17-local-play`; they require a separate independent [attestation v2](v17-bootstrap-import-approval-attestation-v2.json) before write. Gate1 import precedes P12. An independent high decision and actual v17 readback are required before the later P12 successor request. No file in this directory authorizes a production write by itself.
