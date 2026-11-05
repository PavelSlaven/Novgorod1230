---
name: owner-decisions-d51
description: "Owner 2026-09-30 morning (D51): install the real Giga WK encoder on servak; separate name pools per people (future regions); needs_check queues BLOCK generation; recreate local v17 DB after rt-names; move npm cache + Codex sessions off servak root; add p12 to required checks"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-09-30T11:38:57.923Z
---

Answers from the owner (2026-09-30 ~06:20Z) to the seven morning questions:

1. **World Knowledge encoder:** «Ставь энкодер, конечно». Install the real Giga embeddings (torch, transformers and the pinned snapshot) in a venv on /srv/novgorod-work. Use CPU; the owner's GPU services stay untouched. Live runs then use `--wk-encoder giga`.
2. **Foreign names:** «Отдельные пулы (потом это будут новые регионы, поэтому сразу разделяй пулы)». Each people gets its own pool: Gotland, German, Karelian, Izhora. Never fall back to the Russian pool. The pool-to-context binding (rt-names 29.sql) stays per region/people.
3. **needs_check queues:** «Блокировать». Unverified items block generation and free LLM materialization until checked; this is a separate task.
   - **Lead's scope decision (09-30, after the Opus audit):** block **by name** only rows that doubt historicity: all small queues, plus archive rows `unresolved` with a source request.
   - Archive rows queued for routing or identity codes (ICA_ROUTE_INVALID, ICA_VARIANT_IDENTITY_MISMATCH) block **only their archive ID**. Otherwise «Стог сена» and «Железная подкова» would vanish from the world (D38).
   - Tell the owner; he can override.
   - **Owner refinement (09-30 ~12:10Z):** «Не забудь, что игра будет расширяться потом до других регионов. И если с анахронизмами я согласен, то например с блокировкой павлина — нет. И даже на территории Руси он может быть, как диковинка.»
     - **Rule:** block only anachronism doubts (did the thing/technology/form exist within this region's reach by the period?), scoped by region + period (`region_novgorod_land`, 1230–1250). Future regions get their own lists.
     - Regional presence/frequency doubts (peacock, guinea fowl, herring, spices, plant ranges, lapti frequency, local facts) do **not** block: the item may appear as a rarity, an import or a curiosity, and the queue row stays a research question.
     - Earlier exclusions are revisited on this basis (lapti back; the spring iron trap stays blocked).
4. **Local v17 DB pair:** «Да» — recreate once after rt-names lands. The owner runs the commands (irreversible).
5. **servak root disk:** «Да» — move the npm cache and the Codex sessions to /srv/novgorod-work. Apt clean and journal vacuum were not approved.
6. **Game time:** «Вариант В, реальное время». It was **already decided** in the ACTIVE norm `temporal_world_and_interruptible_activities.md`:
   - §3.1: time is event-driven;
   - §3.2: one scale, exact minutes, no compression;
   - §3.4: one command runs to the first decision boundary;
   - §9: boundaries include NPC schedule, light, weather, body and perception/reaction;
   - §11.2: the TemporalAdvance loop runs until completion, a decision or a block;
   - §13: movement minutes = base_minutes × factors.

   I asked without checking the corpus; the owner noticed «опять прорабатываем заново». Only the v17 implementation is missing (LW-097: transitions have 0 minutes; LW-044: weather).
7. **Required checks:** «Да» — add `full-npm-test-p12` to branch protection if it lists required checks.

**Why:** these unblock the D49 slice (live NPC speech needs the real WK encoder) and set the data architecture for future regions.

**How to apply:** record D51 in #133. Tasks: `wk-encoder` (ops), `names-foreign` (data, separate pools), `needs-check-block` (code+data, Contract Auditor). Related: [[owner-decisions-d49]], [[owner-decisions-d50]], [[daily-handoff]].
