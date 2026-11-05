---
name: owner-decisions-d165
description: "D165 (10-08 ~11:10Z) owner — NPC knowledge access marked per NPC and enforced in code (fisher says «не знаю» about forging, tells about fishing); completeness of the base removes small-model hallucinations"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-08T11:07:54.005Z
---

Owner (prose helper chat, verbatim): «Как раз полнота знаний в базе избавит нас от галлюцинаций у малой модели. Особенно если мы будем размечать по NPC, к каким знаниям у них есть доступ, а какие они знать не могут. И делать это на уровне кода. Тогда рыбак на вопрос про ковку честно ответит - не знаю, а про рыбалку может и рассказать.»

Prose helper bench (fisher asked about forging): without smithing facts qwen 0.0 role-break / 9.2 honesty; with leaked smithing practice 8.8 / 2.3 — the small model is held only by its input. Report: /srv/novgorod-work/tmp/prose-helper/npck/REPORT-npc-knowledge-access.md.

Code/data state: canAccess (packages/world-knowledge/src/resolution.js:147–157) filters by knowledge_access + facets, occupation_bound supported; but 1215/1762 facts domain_internal_only, 0 occupation_bound, all crafts on craftsman_master (LW-063); NPC passes only role_ref to WK (not occupation_ref); relevance threshold computed after the access filter, so weak public noise replaces an honest «не знаю»; no deterministic «не знаю» signal.

**How to apply:** tasks #615–#618 (occupation_ref facets, threshold before filter + «не знаю» signal, re-tag WK access in v3.1 form via D163 batches, CR for contracts) and #609; owner questions (a) access for npc_decision (D15 now: sees all), (b) per-biography exceptions (specialist_bound exists). Related: [[owner-decisions-d163]], [[owner-decisions-d164]].

**D167 (10-08 ~13:15Z, owner via owner-questions helper, verbatim):** «Ограничивать доступом и решения NPC, а не только речь - да. Исключения биографии - позже.» → (a) npc_decision WK access is filtered by the NPC's knowledge too — this changes D15 (decisions saw the whole base); (b) biography exceptions (specialist_bound) deferred: occupation tagging first, per-biography exceptions later as separate data. Recorded in #618.
