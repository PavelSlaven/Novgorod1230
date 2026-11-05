---
name: owner-decisions-d71
description: "Owner 2026-10-02 (D71): resources #171 numbers are game calibration checked by D41 and playtests, with late or analogy numbers only as labelled sanity bounds; the label is internal metadata the player never sees; implementation after O1 v1"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-02T06:32:07.906Z
---

Owner, 2026-10-02 ~06:50Z, on the resources research for #171: «вариант 3, с ограничениями из варианта 2. Пометка "не исторический факт" игрок не должен видеть, это внутренняя метка.»

**What was decided:**
1. **Numbers** are game calibration, checked by D41 benches and playtests. This covers yield, stock, regrowth, extraction limits and work rates.
2. **Analogies** (all-Rus, later centuries, modern data) may serve only as sanity bounds, labelled with period and region. They are never used as values. Example: the 16th-century Kuloy saltworks figures.
3. **Facts about presence and ownership** come only from confirmed evidence. Ownership is set per place: private, monastery, lordly or common land. A place with no deed is a typed gap, not "nobody's".
4. **The «не исторический факт» / game_policy / game calibration label is internal metadata.** It lives in attestation and metadata fields only. It must never reach the player, and never reach model-facing text such as runtime_text, prompt packages or narration, because the LLM could repeat it.
5. **Timing:** #171 implementation runs after O1 v1, because it overlaps with ordinary-item finding. The path is CORPUS_EDIT, then a CR in the steps of #171 §11.

**How to apply:** check every data package that carries game_policy or calibration labels (news-221 policies, yard-223 policies, O1 carry rule): the label must stay in metadata and not appear in model-facing fields. Research report: `fleet/tasks/res-resources/out/resources-report.md`.

Related: [[owner-decisions-d69]], [[inclusion-by-existence-not-usefulness]].
