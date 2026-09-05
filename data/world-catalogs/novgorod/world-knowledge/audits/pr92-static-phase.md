# PR92 — static coverage checkpoint, 2026-09-05

## Status: integration checked; offline context acceptance pending

The user's clarified requirement permits plausible reconstruction from
neighbouring periods/settings and practical reasoning. WK contract §0.2
requires useful context about work, clothing, tools, household, means,
status and behaviour, not direct attestation of every ordinary detail.
Reviewed reconstruction remains distinguishable from attested knowledge.

The integrated corpus contains **1,222 approved claims, 814 concepts,
392 sources and 852 evidence records**. This includes 115 independently
reviewed editorial premises for ordinary, human, practical and public life.
Their committed candidates are `9e59d01` (ordinary/human), `6210be8`
(practical) and `6dff36d` (public). Existing per-claim verification bindings
validate against the full assembled authoring input. No new approval system
or runtime owner was introduced.

Cartography has **175 supported families and 49 retained partial need
records**. The latter contain earlier direct-source-oriented limitations
and newly linked reconstruction support. They are not 49 independently
confirmed current P1 blockers, nor automatically closed P2 details: their
game-useful significance is being reassessed. Counts and a filled matrix
do not prove completeness of the map or world.

All 1,497 archive files retain their dispositions. The aligned vector
package contains **4,072 x 1,024 float32 entries (16,678,912 bytes)**, using
the existing `wk-embedding:giga-480m-0826:v1` profile. No model or dependency
version changed.

## Checks actually completed on this integrated corpus

- Compiler: all 1,222 claims and independent approval bindings validate.
- Focused authoring, runtime, population, foundation and cartography tests:
  **85/85 pass**, including runtime/vector alignment.
- Gameplay retrieval benchmark: **211 cases**, hybrid Recall@10
  **0.994471**, Recall@20 **0.996840**, gate PASS.
- Unchanged retrieval baseline: **133 cases**, hybrid Recall@10/20
  **0.969925**, gate PASS.
- Both benchmarks retain hard-constraint recall and applicability precision
  **1.0**. Existing gates were not weakened.

The mixed ordinary-dispute probe still misses two relevant soft premises in
top 20; the passed aggregate gate is not perfect recall. A kinship probe's
incorrect widow-claim expectation was corrected to the actual kin-help
premise after reading the claim text; neither corpus nor gate was changed
to force that result.

These are local integration checks, not exact-HEAD CI certification.
Final publication, exact-HEAD full green CI and current readiness audit
remain mandatory before claiming merge readiness.

## Offline context acceptance — not live gameplay

Two independent generators supplied 50 unseen situations each for batch 01,
covering diverse people, work, places, relations and circumstances. This is
stochastic LLM sampling, not a seeded uniform statistical world sample.

The first 100-case reviewer report is **rejected as acceptance evidence**:
sampled answers repeated a generic template instead of reconstructing each
situation. Its four reported role/authority gaps are leads, not validated
findings. The same cases are being independently re-read in four 25-case
parts, with concrete contextual answers and checked WK references.

No clean acceptance batch has yet been counted. Contract §0.3 requires
three consecutive independent batches of at least 100 cases without a
substantial new gap; a substantial gap resets that streak. Replayed cases
can check repairs but cannot count as unseen samples. Missing exact names,
figures, legal powers or equally plausible ordinary variants are not by
themselves substantial gaps.

## Boundaries preserved

This work is static authoring, verification, cartography and offline WK
retrieval/context evaluation. It starts no live gameplay campaign and
repairs no inventory, ownership, materialization, persistence, body, combat,
NPC, narration or spatial owner. WK remains read-only grounding; it does
not create current state, canonical authority or exact mechanics.

The Gameplay Gap Auditor remains the target architecture for a separately
authorized gameplay-testing phase. Offline context sampling is not gameplay
saturation and cannot certify it. Earlier readiness snapshots and verdicts
are superseded; their history remains in Git.

## Future-testing finding: unowned ordinary item -> action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair
  scope.
- Prior trace: `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`.
  Local retained reports are not published evidence.
- Symptom: an unowned ordinary runtime item was excluded by the ownership
  join before action-production commit. No compression, shaping, placement
  or narration result committed.
- Correct owner: action-production / items-property and persistence
  handoff, not World Knowledge or retrieval.
- Disposition: retain for a separately authorized gameplay-testing task;
  do not repair or replay it within this static phase.
