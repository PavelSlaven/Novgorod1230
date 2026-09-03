# PR92: повторный Contract + retrieval/latency audit

**Verdict: PASS.** P0: 0; P1: 0; P2: 1. Проверены только прежние findings в текущем worktree. P2 не блокирует versioned cutover, но ограничивает силу утверждения о независимой source verification.

## P1 findings rechecked

| Previous finding | Current verdict | Exact evidence |
|---|---|---|
| Encoder outage made vector retrieval a single point of failure | **RESOLVED** | [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:86) catches encoder/index failure, records `structured_lexical_fallback`, then calls Core without vector scores. Regression test covers worker-exit code `WK_VECTOR_WORKER_EXIT`: [`world-knowledge-grounding.test.js`](../../../../../apps/game-server/test/world-knowledge-grounding.test.js:54). |
| Runtime could fetch model/code from network | **RESOLVED** | Runtime worker uses `local_files_only=True` for tokenizer and model: [`giga-query-worker.py`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-worker.py:26); parent process also forces `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`: [`giga-query-encoder.js`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-encoder.js:41). Missing local weights now fail worker startup rather than downloading. Authoring encoder remains network-capable; it is not gameplay runtime. |
| Contract active status conflicted with production wiring | **RESOLVED** | Contract now states `ACTIVE` for `4.13.0-world-knowledge.1` / spatial-v3 production v15: [`world_knowledge_platform_implementation_contract.md`](../../../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md:4). Contract index names same active cutover: [`CONTRACT_INDEX.md`](../../../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md:86). Release pins pack/profile and remains `validated_candidate_not_active` until existing activation readback: [`production-spatial-v3-release.js`](../../../../../apps/game-server/src/composition/production-spatial-v3-release.js:19), [`production-spatial-v3.js`](../../../../../apps/game-server/src/composition/production-spatial-v3.js:128). |
| No held-out three-mode pipeline evidence | **RESOLVED** | Nine held-out RU/EN domain probes and accepted answer classes: [`pipeline-v1.json`](../benchmarks/pipeline-v1.json). Report compares `without_wk`, `structured_lexical`, `hybrid`, records factual correctness, unsupported-premise rate, cold/warm embedding, planner/retrieval/semantic/total latency and provider token usage: [`pipeline-v1-report.json`](../benchmarks/pipeline-v1-report.json). Reported hybrid: correctness 1, unsupported premise rate 0, cold embedding 15,588.56 ms, warm embedding 92.06 ms, total pipeline mean 4,174.69 ms. Method is executable: [`world-knowledge-pipeline-eval.js`](../../../../../tools/world-catalog-workflow/src/world-knowledge-pipeline-eval.js:1). Monetary estimate is correctly `null` because no project-owned immutable price schedule exists. |
| Vector metadata bound only partially | **RESOLVED** | Loader validates metadata schema, pack/revision/profile, model ID/revision, dimension, normalization and pooling; `validEntries()` requires every concept/claim × locale exactly once with matching domain and nonempty retrieval text: [`world-knowledge-production.js`](../../../../../apps/game-server/src/internal/world-knowledge-production.js:41). Core still treats vectors only as retrieval candidates. |
| Planner had independent token cap / no cost telemetry | **RESOLVED** | Planner override now contains only deterministic temperature: [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:173). Diagnostic records `planner_ms` and provider usage per planner call: [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:110). Pipeline report carries planner and semantic token totals. |

## P2 finding

### WK-CR-01 — independent source-verification verdict is not linked to production records

Compiler/Core correctly require approved source, evidence, concept and claim statuses, source/evidence lineage, anchors and nonempty notes: [`world-knowledge-pack.js`](../../../../../tools/world-catalog-workflow/src/world-knowledge-pack.js:107), [`world-knowledge.js`](../../../../../packages/world-knowledge/src/world-knowledge.js:152). Production evidence notes name independently reopened URLs. Separate domain-verification reports exist under `data/world-catalogs/novgorod/world-knowledge/verification/`.

However, `production-v1/authoring.json` has no `verification_ref` (or equivalent reviewed-decision reference), and compiler does not consume such a link. Therefore this audit can verify the strict declared approval chain and cited anchor shape, but cannot mechanically establish that every production source/evidence record was covered by a separate verifier verdict. This is a traceability limit, not evidence that any of the 54 production claims is false or unsafe.

## Other checked invariants

- **Strict schema/Core: PASS.** Query/bundle validation is exact; applicability and knowledge access filter candidates before slice packing. [`world-knowledge.js`](../../../../../packages/world-knowledge/src/world-knowledge.js:152).
- **Bilingual identity: PASS.** Localizations retain canonical refs; production test confirms RU/EN surface resolves the same claim. [`world-knowledge-pack.test.js`](../../../../../tools/world-catalog-workflow/test/world-knowledge-pack.test.js:48).
- **Giga exact profile: PASS.** Runtime loader and worker pin profile/ref/revision/dimension/pooling/normalization. [`world-knowledge-production.js`](../../../../../apps/game-server/src/internal/world-knowledge-production.js:28), [`giga-query-worker.py`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-worker.py:14).
- **Noise/applicability: PASS with bounded evidence.** Retrieval report has hybrid Recall@10 0.963, hard-constraint recall 1 and applicability precision 1; pipeline report has zero unsupported premise refs. Its 27 retrieval and nine pipeline probes are regression evidence, not a claim of exhaustive domain coverage.

## Checks run

`node --test packages/world-knowledge/test/*.test.js apps/game-server/test/world-knowledge-grounding.test.js tools/world-catalog-workflow/test/world-knowledge-pack.test.js test/spatial-v3/pr8-production-v3-composition.test.js` — 43 pass, 0 fail.

`git diff --check` — pass.
