# PR92 final grounding audit

## Verdict: PASS

- **Exact audited HEAD:** `6709cb2e793515039ac45ffded2b9938ce9468af`
- **Method:** prior complete read-only grounding audit at
  `91ab74dd656328221fd9a7f0d3e62f12ecb2a50d`, then exact delta audit to this
  HEAD. Reviewed changed candidate-reference metadata and verified no change
  in grounding/runtime code, Core, production runtime bundle, vector metadata/
  bytes, embedding profile, or readiness script. Prior focused PASS remains
  applicable; no duplicate test run was needed.
- **Scope boundary:** `spatial-v3-production-v15` remains
  `validated_candidate_not_active`; this audit verifies its exact production
  composition behavior, not an external deployment activation.

## Evidence

1. Delta `91ab74d..6709cb2` changes only nine World Knowledge verification/
   research files. Production changes replace stale candidate references with
   promoted `production-v1` candidate references; claim refs/digests and the
   runtime bundle/vector inputs are unchanged. No changed file is a runtime
   grounding consumer or owner.
2. Active `world_knowledge_platform_implementation_contract.md` §§43--46,
   74 and acceptance items 13--43 require exact local Giga profile/revision,
   1024-dimensional hybrid retrieval, offline/local-files-only execution,
   typed fail-closed unavailability, no lexical fallback, no state/idempotency/
   narration failure mutation, and existing materialization owners.
3. `apps/game-server/src/composition/production-spatial-v3.js` loads WK with
   `requireEncoderReady: true` before bindings/runtime creation. Its loader
   validates bundle production status, exact pack/revision/profile, vector
   metadata and 1024 dimensions. V15 bindings recheck those exact pins.
4. `giga-query-encoder.js` starts a local Python worker with
   `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`. Worker uses
   `local_files_only=True`, exact revision, mean pooling and L2 normalization.
   Startup, exit, timeout, write, encode and malformed-vector paths produce
   `WORLD_KNOWLEDGE_UNAVAILABLE`.
5. `world-knowledge-grounding.js` encodes and flat-searches before Core. Any
   encoder/vector failure is converted to typed
   `WORLD_KNOWLEDGE_UNAVAILABLE`; Core is not called. Core receives vector
   scores plus its normal exact/structured/lexical ranking only after that
   mandatory vector path succeeds. No fallback branch exists.
6. Turn flow loads/replays state, performs semantic grounding before
   `runTurnWorkflow` commit/presentation persistence. Focused regression
   proves one failed WK attempt creates no turn state/commit/narration and the
   same key then commits once after recovery. HTTP maps the typed internal
   error to a safe 500 envelope and keeps server handling alive.
7. `packages/world-knowledge/MODULE.md` and Core source make WK a pure
   caller-supplied read-only premise resolver: no LLM, filesystem/network/DB,
   party state, presence/materialization, persistence, mechanics or narration
   ownership. Grounding closure explicitly says compatibility never proves
   current presence; existing owners retain it.

## Commands and results

```text
git rev-parse HEAD
# 6709cb2e793515039ac45ffded2b9938ce9468af

git diff --name-status 91ab74dd656328221fd9a7f0d3e62f12ecb2a50d \
  6709cb2e793515039ac45ffded2b9938ce9468af
# nine verification/research metadata files only

git diff --name-only 91ab74dd656328221fd9a7f0d3e62f12ecb2a50d \
  6709cb2e793515039ac45ffded2b9938ce9468af -- apps/game-server \
  packages/world-knowledge scripts/check-world-knowledge-giga.mjs \
  data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json \
  data/world-catalogs/novgorod/world-knowledge/production-v1/vector-index.json \
  data/world-catalogs/novgorod/world-knowledge/production-v1/vectors.f32 \
  data/world-catalogs/novgorod/world-knowledge/embedding-profiles/giga-480m-0826-v1.json
# no output

node --test packages/world-knowledge/test/world-knowledge.test.js \
  packages/world-knowledge/test/vector-index.test.js \
  apps/game-server/test/giga-query-encoder.test.js \
  apps/game-server/test/world-knowledge-grounding.test.js \
  apps/game-server/test/game-server.test.js \
  apps/game-server/test/lower-dvina-trace-phase-3.test.js
# prior exact-runtime test set: pass 60, fail 0; unchanged code/data inputs,
# therefore result remains applicable to this metadata-only delta

npm run world-knowledge:giga-readiness
# prior readiness: ready; offline: true; exact Giga revision; dimension: 1024;
# deterministic_max_delta: 0; Russian and English vector retrieval non-empty

git diff --check
# pass
```

The HTTP-focused test intentionally emits server-side error logs while
asserting the player-safe response; test run still passed.

## Findings

### P0

None.

### P1

None.

### P2

None.

### P3

- `spatial-v3-production-v15` is intentionally a validated, non-active
  candidate (`production_activation: false`). This is release status, not a
  grounding defect and does not weaken the audited fail-closed composition.
