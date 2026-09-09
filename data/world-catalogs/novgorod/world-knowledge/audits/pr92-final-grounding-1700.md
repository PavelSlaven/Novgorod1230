# PR92 final grounding audit — 1700 claims

## Verdict: PASS_WITH_P2_LIMITS

- **Exact runtime/factual candidate:** `003bda998813c7b17f0dbd175e40af09cb3e4181`
- **Exact audited HEAD:** `844e1baee3ea814fcec08aa5ae0ca2e9bfa22657`
- **Scope:** read-only static audit of production World Knowledge grounding and
  retrieval. No live gameplay, external research, production mutation, full CI
  repetition, or activation assessment was performed.

## Evidence

1. The active WK contract §§35.1, 43--46, 74, 76 and acceptance items 13--43
   require independently approved, source/evidence-bound claims; bounded
   applicability/authority; exact offline Giga; and fail-closed operational
   retrieval. `world-knowledge-population.test.js` passed for the assembled
   production pack: every one of 1,700 claims has exactly one applicable
   `APPROVE` verification binding and source/evidence lineage. The compiler
   rejects stale, missing, duplicate, non-approving, or incomplete bindings.
2. The compiled bundle contains 1,700 claims, 1,015 concepts, 641 sources and
   1,189 evidence records. All claims carry a `verification_ref`; the direct
   runtime projection contains facts and limits, not authoring verification
   records. The R4 repair adds eight narrowly limited claims, independently
   approved against the exact committed payload `ea7d5014`; its report records
   limits against inferred availability, present objects, diagnosis, safety,
   quantity and outcome assertions.
3. `@rus/world-knowledge` remains a pure read-only factual module. Its
   deterministic retrieval keeps hard constraints, exact focus, applicability,
   actor-access facets, coverage and conflicts ahead of relevance. It neither
   asserts current presence nor owns materialization, mechanics, party state,
   persistence, narration, LLM calls, filesystem, network or DB. Grounding
   closure explicitly keeps current committed state and existing domain owners
   authoritative.
4. The server validates the exact production bundle/profile/index tuple before
   composition. The pinned profile is
   `wk-embedding:giga-480m-0826:v1` / `ai-sage/Giga-Embeddings-instruct-480M-0826`
   revision `0c94f705aa35719324fb46f7e75b0a5c275da6e4`, 1024 dimensions, mean
   pooling and L2 normalization. The vector index has 5,430 bilingual entries
   and the float32 payload is exactly 22,241,280 bytes (5,430 × 1,024 × 4).
5. The encoder starts a local Python worker with `HF_HUB_OFFLINE=1` and
   `TRANSFORMERS_OFFLINE=1`; model/tokenizer loading uses
   `local_files_only=True`. Startup, timeout, worker exit, malformed-vector,
   write and scan failures become `WORLD_KNOWLEDGE_UNAVAILABLE`.
   `createProductionWorldKnowledgeGrounder` encodes and flat-searches before
   calling Core; its catch path throws before Core. Thus there is no lexical or
   Core fallback on encoder/vector failure. Successful vector scores only add
   candidates; Core still enforces applicability and authority.
6. `003bda99..844e1ba` changes only frozen R5 static-acceptance input/review
   artifacts. It changes no runtime, vector, authoring, source, evidence,
   profile or grounding file. Therefore the runtime-focused checks below apply
   to the exact audited HEAD.

## Executed checks

```text
node --test packages/world-knowledge/test/*.test.js \
  tools/world-catalog-workflow/test/world-knowledge-pack.test.js \
  tools/world-catalog-workflow/test/world-knowledge-population.test.js \
  tools/world-catalog-workflow/test/world-knowledge-category-cartography.test.js \
  apps/game-server/test/giga-query-encoder.test.js \
  apps/game-server/test/world-knowledge-grounding.test.js \
  apps/game-server/test/game-server.test.js \
  apps/game-server/test/lower-dvina-trace-phase-3.test.js
# 126 pass, 0 fail

npm run world-knowledge:giga-readiness
# ready; offline: true; exact pinned revision; dimension: 1024;
# deterministic_max_delta: 0; non-empty RU and EN vector retrieval

git diff --check
# pass
```

The grounding tests include encoder and flat-index failure with no Core call,
no turn-state/commit/narration on failure, and one normal idempotent retry after
recovery. Logged HTTP errors in the server tests are expected assertions of the
safe public error boundary, not test failures.

## Findings

### P0/P1

None found in this scope.

### P2

- Static source-backed approval demonstrates bounded factual premises, not
  literal completeness of the world or any current scene. A retrieved claim is
  never evidence that an object, actor skill, price, legal outcome, hidden fact
  or state exists in this party.
- `spatial-v3-production-v15` remains a validated, non-active candidate. This
  audit verifies the composition contract and artifacts, not deployment
  activation.

### P3

- This audit intentionally does not rerun full CI; the required exact-HEAD CI
  merge gate remains a separate final check.
