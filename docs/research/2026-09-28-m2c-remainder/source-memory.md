---
name: m2c-remainder-inventory-2026-09-28
description: "What is left of M2c after CR #158 (verified at runtime cf33a327, game-base 0fd10db6): six task blocks, sizes, owner decisions, estimate"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-09-28T08:07:07.249Z
---

Inventory of M2c remainder after CR #158, 5 Sonnet scouts + my spot checks, 2026-09-28, runtime `cf33a327`, game-base `0fd10db6`.

- **Generated places / movement.** 09-25 fixes (`21f44fd1` expansion, `6927ba5c`+`ca704b65` gather) never verified via UI after gather fix; passages show only «Проход N» (`lower-dvina-trace-local-scene-commands.js:27-37`); capacity-full edges silently dropped (`spatial-v3-local-scene-movement.js:138`); no restart test for generated G5.
- **People beyond #158.** Procedural NPC gets no name (no pool picker; `region_name_pools` has no reader); goals/fears = whole occupation text, no seeded 1–3; no temperament/values/motives (game-base `npc_psychology`: scale `no_source`, needs owner scale); no LLM bio/speech manner at first contact (D1) at all; people composition only for 16 PF.
- **Items.** v17 `target-runtime-profiles.js:44-45`: O2a, O2b, F1, S1 = null, only A1+N1; finite = 4 natural classes (reeds, deadwood, driftwood, standing wood); O2b consumer locked to one Lower Dvina profile; no renewal class / period key; no D9 subtype-by-weight or identifying-text pools; readback `runtime_item_creation_authorized` and `equipment_allocation_activation_authorized` false.
- **Types.** 128 region-applicable catalog types (34 landscape, 24 water, 31 land-use, 39 place); start territory uses 7/34, 6/24, 0/31, 0/39; 44 PF; no type-matrix test.
- **Acceptance.** No zero-generative-LLM measurement; temporal-v4 not in v17 bootstrap; `m2c-initial-entity-perception` approved, no consumer; nature successor v2 IS imported (64 rows); last playtests 09-25 FAIL; `schema-map/summary.json` stale (predates 27.sql).

**Why:** owner asked to split the M2c remainder into tasks to get a real estimate. **How to apply:** use as the starting list for post-#158 CRs; re-verify each item at the then-current HEAD. Estimate given 09-28: #158 ~1–2 weeks, remainder ~3–5 weeks of Cursor critical path → M2c end ≈ late Oct – mid Nov. Related: [[novgorod-code-architecture-study]], [[m2c-close-all-materialization-gaps]].
