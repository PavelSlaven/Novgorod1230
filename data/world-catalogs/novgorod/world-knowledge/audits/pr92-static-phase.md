# PR92 — static coverage phase, 2026-09-04

## Final static snapshot

Audited exact HEAD: `06915b05046179dc944a4346ff4ec02e18d79e3c`.

The active production descriptor compiles 987 source-backed, independently
verified claims, 760 concepts, 356 sources and 661 evidence records. Its
category cartography has 142 supported families and deliberately retains 49
`partial` gaps. All 1,497 archive files retain their dispositions. None of
these inventory counts proves completeness.

The aligned vector package contains 3,494 × 1,024 float32 entries
(14,311,424 bytes), built with
`ai-sage/Giga-Embeddings-instruct-480M-0826` revision
`0c94f705aa35719324fb46f7e75b0a5c275da6e4`. The runtime bundle, vector index,
and authoring source refer to this same 987-claim corpus.

## Independent readiness verdict

**PASS_STATIC_V1_WITH_DECLARED_PARTIAL_LIMITS.** PR92 is a completed static
World Knowledge v1 phase: it has a coherent contract, an explicit need-first
cartography, source-backed facts with the existing per-claim independent
approval, and passing offline retrieval gates. The v5 increment has 15/15
exact independent approvals and preserves the source/date/scene limits of its
historical claims.

It is **not** ready to claim that the world is maximally covered, that the
cartography is exhaustive, or that gameplay is saturated. The current
cartography itself marks every broad domain rollup as partial. The external
macro pass now leaves no wholly missing discovered family, but its 49 partial
families remain real limits. A filled matrix, claim count, archive disposition
count, or benchmark recall cannot substitute for broader factual coverage.

The most material remaining P1 work is:

- historical spoken language/register; names, address and literacy remain
  corpus-level or document-bounded, not a generated 1230 speech model;
- weapons/armour and warfare organization/logistics;
- marriage/kinship and historically situated gender, age, dependency and
  status;
- medicine/care composition, poisoning and treatment limits;
- Novgorod institutions, external relations, crime and sanctions;
- education/apprenticeship and recreation beyond bounded later comparators.

The P2 backlog remains substantial but correctly bounded: cryosphere and local
winter conditions; daylight/night-sky orientation; wider food/animal-care
practice; and hospitality/travel/lodging. Claims must be added only when a
compact factual relation has a reliable source and existing independent
verification; this is a game corpus,
not an academic completeness exercise.

The former language, status and hospitality gaps have narrow partial support:
v5 corpus-language/document facts, one dated disputed-purchase context, and
universal sleep relations. None establishes a 1230 speech register, social
system, lodging custom, scene fact or actor state. Where broader support is
needed, runtime must remain honest `unresolved`; LLM pretraining is not
fallback factual authority.

## Boundaries preserved

This static phase covers architecture, need-first cartography, static factual
authoring, verification, indexes/vectors and retrieval benchmarks. It neither
starts live gameplay campaigns nor authorizes saturation, unseen acceptance
campaigns, replay, or repair of inventory, ownership, materialization,
persistence, body, combat, NPC, narration or spatial owners.

World Knowledge remains a read-only factual module. It does not materialize
world state, choose exact mechanics, prove scene facts, invent authorities,
or become a second gameplay resolver. Existing code owners retain current
actor/body state, inventory/access, time/weather, topology/navigation,
authority, relationships, exact calculations and committed outcomes.

The contract's Gameplay Gap Auditor remains target development/testing
architecture for a later expressly authorized phase. Its existence does not
turn this static snapshot into gameplay acceptance.

## Retrieval evidence

Both stored reports on this exact bundle pass their unchanged gates:

| Offline benchmark | Cases | Hybrid Recall@10 | Hybrid Recall@20 | Hard constraint | Applicability |
|---|---:|---:|---:|---:|---:|
| Gameplay coverage v3 | 132 | 0.996212 | 1.0 | 1.0 | 1.0 |
| Retrieval baseline v1 | 133 | 0.96992 | 0.96992 | 1.0 | 1.0 |

These benchmarks test retrieval of represented facts only. They do not prove
the remaining partial families, scene state, historical local practice, or
gameplay outcomes. No live campaign was run for this audit.

## Checks and release condition

The current artifacts report deterministic compilation, cartography/approval
validation and both offline benchmark gates as passing. Focused checks pass
62/62, `test:world-catalog` 224/224 and `test:knowledge-source` 54/54.
`git diff --check` is required for this documentation-only audit change. The
final exact-HEAD GitHub CI/full-suite result remains the separate merge gate; a
green run on an older commit does not certify this snapshot.

## Future-testing finding: unowned ordinary item → action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair
  scope.
- Prior trace: `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`.
  Local retained reports are not published evidence.
- Symptom: an unowned ordinary runtime item was excluded by the ownership join
  before action-production commit. No compression, shaping, placement or
  narration result committed.
- Correct owner: action-production / items-property and persistence handoff,
  not World Knowledge or retrieval. A later fix needs an explicit coherent
  no-ownership contract and tests through loading, admission, output authority
  and persistence.
- Disposition: retain for a separately authorized gameplay-testing task. Do
  not repair or replay it within this static phase.
