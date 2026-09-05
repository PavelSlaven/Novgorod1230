# PR92 — static coverage phase, 2026-09-05

## Current status — static coverage reopened

**BLOCK_STATIC_COVERAGE (2026-09-05).** The prior P1-free verdict is
withdrawn after a requirement-by-requirement review of the 49 residual
families. Core historical, cultural and natural-world premises remain
missing. Filling them is required by potential RPG needs already identified,
without waiting for a live gameplay case. See the current verdict in
`macro-gap-readiness-v1.md`; the snapshot and verdict below describe the
superseded acceptance baseline only.

## Previous static snapshot

Audited corpus commit: `39b891c17855b1cd8b650e2f758e1ef8b0162e06`.

The active descriptor compiles 1,024 source-backed, independently verified
claims, 774 concepts, 366 sources and 698 evidence records. Every compiled
claim has exactly one approved verification binding. Category cartography has
147 supported families and retains 49 bounded P2 families as `partial`. All
1,497 archive files retain their dispositions. None of these counts proves
world completeness.

The aligned vector package contains 3,596 x 1,024 float32 entries
(14,729,216 bytes), built with
`ai-sage/Giga-Embeddings-instruct-480M-0826` revision
`0c94f705aa35719324fb46f7e75b0a5c275da6e4`. Runtime bundle, vector index and
authoring source describe the same corpus.

## Superseded independent readiness verdict

**PASS_STATIC_V1_WITH_DECLARED_P2_LIMITS.** A reality-first audit checked
physical/Earth systems, living world, body/lifecycle/health,
cognition/communication, kinship/status, institutions/law/economy/politics/
war, subsistence, craft/materials, settlement/sanitation,
mobility/navigation and religion/culture/education/recreation.

Result: P0 `0`, known P1 `0`, unknown or unregistered P1 `0`. The previously
open weapon maintenance, status, government and crime families now have a
small cumulative factual envelope and remain bounded P2. Their sources do not
create a present weapon, historical maintenance custom, current status,
officeholder, jurisdiction, law, guilt, sanction or outcome.

This verdict means the broad static v1 corpus is ready for the game-facing WK
phase. It does **not** mean the world is exhaustive, the cartography is
mathematically complete, or gameplay is saturated. All 49 residual families
remain explicit P2 `partial` limits. More generic static filling is deferred
until a concrete game need or reliable source supports a sharper premise;
adding weak encyclopedia filler would reduce correctness rather than improve
coverage.

## Boundaries preserved

This phase covers the WK architecture contract, need-first cartography,
static factual authoring, independent claim verification, indexes/vectors and
offline retrieval benchmarks. It starts no live gameplay campaign, replay,
unseen acceptance campaign or saturation loop, and it repairs no inventory,
ownership, materialization, persistence, body, combat, NPC, narration or
spatial owner.

World Knowledge remains read-only factual grounding. It neither materializes
world state nor chooses exact mechanics. Actor/body state, inventory/access,
time/weather, topology/navigation, authority, relationships, calculations and
committed outcomes remain with existing code owners. LLM pretraining is not a
fallback factual authority.

The contract's Gameplay Gap Auditor remains future testing architecture for a
separately authorized gameplay phase.

## Retrieval evidence

| Offline benchmark | Cases | Hybrid Recall@10 | Hybrid Recall@20 | Hard constraint | Applicability |
|---|---:|---:|---:|---:|---:|
| Gameplay coverage v3 | 174 | 0.997126 | 1.0 | 1.0 | 1.0 |
| Retrieval baseline v1 | 133 | 0.969925 | 0.969925 | 1.0 | 1.0 |

The five v9 claims pass independent verification. Their ten positive probes
retrieve the relevant claim in hybrid top 10, and four time-exclusion probes
exclude it outside applicability. These are offline retrieval checks, not
gameplay acceptance.

## Checks and release condition

Focused integration checks pass: `test:world-catalog` 224/224,
`test:knowledge-source` 54/54, both stored retrieval gates PASS, and
`git diff --check` is required for this documentation-only audit update. A
green GitHub CI run on the final exact HEAD remains the merge gate; an older
green run does not certify it.

## Future-testing finding: unowned ordinary item -> action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair
  scope.
- Prior trace: `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`.
  Local retained reports are not published evidence.
- Symptom: an unowned ordinary runtime item was excluded by the ownership join
  before action-production commit. No compression, shaping, placement or
  narration result committed.
- Correct owner: action-production / items-property and persistence handoff,
  not World Knowledge or retrieval.
- Disposition: retain for a separately authorized gameplay-testing task. Do
  not repair or replay it within this static phase.
