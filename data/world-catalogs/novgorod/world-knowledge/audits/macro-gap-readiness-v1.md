# Macro-gap static readiness — PR92

Snapshot: `06915b05046179dc944a4346ff4ec02e18d79e3c` (2026-09-05). This is an
independent static corpus/cartography audit. It runs no live gameplay,
campaign, replay or saturation check.

## Verdict

**PASS_STATIC_V1_WITH_DECLARED_PARTIAL_LIMITS.** The static phase is a sound,
broadly useful v1 checkpoint: the current claims are source-backed,
independently verified, classified and retrievable. The v5 macro pass leaves
no wholly missing discovered family: all 49 are explicitly `partial`. It is
**not** a proof that the world is maximally covered, and it must not be
described as static completeness or gameplay saturation.

This verdict completes the current static v1 phase with declared limits. It
does not close the factual-coverage programme.

## Observed static state

- `authoring.json` resolves to 987 production claims, 760 concepts, 356 sources
  and 661 evidence records. Every promoted claim has the existing independent
  production verification binding; no separate approval mechanism is added.
- v5 contributes 15 claims with 15/15 exact independent `APPROVE` bindings,
  each tied to candidate `87ef4ba6d6969d29457bcbaf28e03ae300863363` and its
  reviewed evidence inputs.
- `category-cartography.json` classifies the supported corpus into 142 families
  and keeps 49 discovered gaps visible, all `partial`.
- The current vector index has 3,494 entries × 1,024 dimensions, using
  `ai-sage/Giga-Embeddings-instruct-480M-0826` at revision
  `0c94f705aa35719324fb46f7e75b0a5c275da6e4`.
- The cartography uses external classifications only to find blind spots. They
  are not treated as evidence for a historical fact, local scene, actor status
  or gameplay outcome.

## Macro-family assessment

| Need family | Static assessment |
|---|---|
| Language, names, literacy | The v5 corpus-level Old Russian/dialect premises and named records give narrow support; they do not reconstruct a 1230 utterance, register, intelligibility or naming system. |
| Warfare and military material culture | Hunting/civic-defence and a later helmet comparator are not a 1230 weapon, armour or organization map; remains P1 partial. |
| Marriage, kinship, gender and status | Narrow household/letter/care premises plus one early disputed-purchase record give context only; no marriage, status or stratification system follows. |
| Reproduction and lifecycle | Pregnancy, labour, newborn adjustment, lactation, development, puberty and aging have useful universal premises; postpartum care, functional variation and individual state remain partial/code-owned. |
| Medicine, sickness and disability | Infection, injury, dehydration, fracture/dislocation, oral health and disability context are useful, but symptom/care composition, poisoning and treatment limits remain partial. |
| Government, external relations, crime | Isolated documents, assembly/office/conflict context and legal fragments do not form a 1230 institutional, diplomatic or sanctions model; P1 partial. |
| Education, apprenticeship, recreation | Later-XIII comparators and gusli archaeological context are bounded support, not a 1230 school, skill system or recreation scene; partial. |
| Winter / cryosphere | Slip, ice-strength, freeze-thaw, snowmelt and ice-jam premises are useful; crust, openings, snow load and local route safety remain partial/code-owned. |
| Sky, daylight and navigation | Still partial: no adequate human daylight, night illumination or celestial-orientation premise. |
| Food, hospitality and travel | Food processing and transport compose useful support; universal sleep premises add a bodily-rest limit, not lodging, invitation, host duty or travel custom. |

The formerly missing language, status and hospitality families are now narrow
`partial` support, not closure. Their limits must still produce an honest
unresolved result where a broader factual premise is needed; they are not
permission to use LLM pretraining as factual authority. Exact body state,
combat, inventory, access, time, weather, navigation, authority, relationship
and committed outcomes stay with their existing code/state owners.

## Retrieval and consistency evidence

Stored reports on this exact bundle pass their unchanged gates:

- gameplay coverage: 132 cases, hybrid Recall@10 0.996212, Recall@20 1.0,
  hard-constraint recall 1.0, applicability precision 1.0;
- baseline retrieval: 133 cases, hybrid Recall@10/20 0.96992,
  hard-constraint recall 1.0, applicability precision 1.0.

These are offline retrieval benchmarks, not gameplay acceptance. They show
that the represented claims can be retrieved under the tested predicates; they
do not prove that every partial family or its unrepresented facets are covered.

## Follow-on authoring

Continue source-backed, independently verified additions for the P1 partial
families: language/naming/literacy, weapons/warfare, marriage/status,
medicine/care, government/external relations, crime/sanctions, and
education/recreation. Continue with P2 winter, sky/navigation, food-system and
hospitality/travel detail only where a compact factual premise is gameplay-useful.
Do not launch live gameplay exploration or repair another gameplay owner as
part of that work.
