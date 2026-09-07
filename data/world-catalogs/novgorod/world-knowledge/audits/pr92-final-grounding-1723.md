# PR92 final grounding — 1723 claims

- Audited checkpoint: `88920ab23bd2c0361f1f35373d116a59dc09fc23`.
- Factual candidate/runtime basis: `db1f8984a3b36838992b9a0c5911d6d2c735a951`.
- Verdict: **PASS_WITH_P2_LIMITS**.

## Evidence and checks run

- Loaded `production-v1/authoring.json`, compiled it with the existing loader/compiler, and compared result exactly with committed `runtime-bundle.json`: 1,723 claims, 3,446 RU/EN claim localizations, 1,723 verification records, 1,723 `APPROVE` verdicts, current digest and exact `evidence_checked` match for every claim, and 1,723 runtime `verification_ref` projections.
- Existing population test dereferenced every `candidate_ref` through `git show`; it checked all candidate claim payloads and both localizations against current authoring records. `node --test` for authoring/compiler, population, vector, encoder and grounding tests: 80 pass, 0 fail.
- Pinned offline profile/readiness passed: `wk-embedding:giga-480m-0826:v1`, `ai-sage/Giga-Embeddings-instruct-480M-0826`, revision `0c94f705aa35719324fb46f7e75b0a5c275da6e4`, dimension 1024, deterministic delta 0. Encoder code uses `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and local-only model loading.
- Runtime code and failure tests establish that encoder or vector-scan failure throws `WORLD_KNOWLEDGE_UNAVAILABLE` before Core; no lexical/Core fallback is used. Successful vector candidates remain subject to Core applicability/authority filtering.
- Vector artifact: 5,510 × 1,024 float32 entries; `vectors.f32` is 22,568,960 bytes.

## Findings

- P0: none.
- P1: none.
- P2: static grounding/approval is not whole-world completeness, current party/scene state, or gameplay saturation. This audit did not run live gameplay or assess activation/deployment state.

