# NPC identity v17 import: review request

Attest [import-request.json](import-request.json) (request digest `3e20cfa12aa946cd6e0da642f8ef3f92308c41bf9cf56e32b6f0072875f59d01`, sources at
`fe38ecb1b81df04a9a7f8d95b5bed1f0c9e815c7`) with an independent pass that is not the author (WR 21.1). The request is a candidate:
no attestation exists. The stage `npc_identity_import` of `scripts/bootstrap-live-world-v17.mjs` stops before COMMIT
without `npc_identity_import.json` (schema `rus.npc_identity_v17_import_approval.v1`).

What becomes runtime-selectable (status `approved` set only by the stage SQL; repository files stay draft/candidate):
- 266 ordinary name entries of the bound (pool, people) pairs ({"pp_novgorod_rus/female":62,"pp_novgorod_rus/male":204}); 71 other entries are imported `draft` and never selected;
- context bindings: m2c_npc_regional_novgorod_land_v1 -> novgorod_1230_1250_personal_names_v1 / pp_novgorod_rus; m2c_npc_regional_novgorod_canonical_initial_v1 -> novgorod_1230_1250_personal_names_v1 / pp_novgorod_rus;
- the D29 psychology scales (6 traits, 7 values, even weight);
- 265 goal and 158 fear items for 97 occupations (60 with `basis=analogy`).

Rows inserted (insert-only, one transaction, in-transaction exact readback):
- `region_name_pools`: 1
- `region_name_pool_entries`: 337
- `npc_regional_context_name_bindings`: 2
- `npc_psychology_scale_entries`: 13
- `occupation_character_items`: 423

Limits carried into the approval:
- Only pools bound to a regional context are selectable; contexts without a binding (Gotland, German towns, Karelia, Ingria) leave NPC unnamed (LW-107).
- Approval is per (pool, people): ordinary rows of peoples without a context binding stay draft and are not selectable (pp_fg002 16 male, pp_fg001, pp_fg005 and pp_izhora 1 each, no female); foreign peoples get their own pools (D51, LW-107).
- Every name entry keeps evidence_period as authored: medieval_general is XI-XIV evidence, not an individual 1230-1250 attestation.
- Goal/fear items have confidence C; basis=analogy items are archive-process analogies, not direct Novgorod evidence.
- D29 scales are a game assumption (even weights), not a historical distribution; psychology_profiles.csv is not imported.

Also for review: DDL `infra/world-base/schema/29.sql` (key change of `region_name_pool_entries`, three new tables) needs the
Contract Auditor (AR 25.1: DDL, persistence, NPC) and the fresh-schema v5 attestation (`live-world-runtime-v17/fresh-schema-review-request.md`).
