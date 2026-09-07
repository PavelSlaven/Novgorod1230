# PR92 final verification — 1723 claims

- Audited checkpoint: `88920ab23bd2c0361f1f35373d116a59dc09fc23`.
- Factual candidate/runtime basis: `db1f8984a3b36838992b9a0c5911d6d2c735a951`.
- Verdict: **PASS**.

## Machine-count-specific checks run

| Check | Observed |
| --- | ---: |
| Production claims | 1,723 |
| RU/EN claim localizations | 3,446 (2 per claim) |
| Verification records / exact `APPROVE` | 1,723 / 1,723 |
| Current digests / exact evidence sets / runtime refs | 1,723 / 1,723 / 1,723 |
| Candidate refs dereferenced and matched through existing population test | 1,723 |
| Vector index | 5,510 × 1,024 float32 |
| `vectors.f32` | 22,568,960 bytes |
| Relevant tests | 80 pass, 0 fail |

Existing loader/compiler comparison reproduced the committed runtime bundle exactly. The population test verified each `git:<commit>:<path>#<claim>` candidate against current claim plus both localizations; compiler validation covered one `APPROVE`, digest, evidence, candidate path and runtime projection per claim.

Both updated reports pass against this 1,723-claim production bundle: `retrieval-v1-report.json` (174 cases) and `gameplay-coverage-v3-report.json` (389 cases). Each records `runtime_bundle_bytes=11,364,064`, the generator's compact `JSON.stringify(bundle)` size; committed pretty-printed file size is 14,115,105 bytes. Both record `vector_bundle_bytes=22,568,960`, matching `vectors.f32`.

`npm run world-knowledge:giga-readiness` passed offline with exact Giga pin and 1024 dimensions. Encoder/grounder tests passed failure paths that return `WORLD_KNOWLEDGE_UNAVAILABLE` before Core, confirming no lexical/Core fallback semantics.

## Findings

- P0: none.
- P1: none.
- P2: static machine verification only; not whole-world completeness, current party/scene state, gameplay saturation, or deployment/activation proof.

