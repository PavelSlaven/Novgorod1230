---
name: owner-decisions-d72
description: "Owner 2026-10-02 (D72): no service label of any kind ever reaches the player's screen — ids, codes, statuses, enums, calibration or gap labels; generalises D71; audit task ui-labels started"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-02T06:39:41.579Z
---

Owner, 2026-10-02 ~07:00Z: «в целом никакие служебные метки не должны попадать игроку на экран».

**Scope:** every player-visible surface:
- screen panels;
- prose and narration;
- NPC speech;
- labels of routes, people and items;
- error and recovery messages;
- clarification questions.

**What counts as a service label:**
- entity ids such as `npc_…`, `item:…`, `claim:…`, `canconn:…`;
- error codes, status enums and English technical words;
- workflow statuses such as candidate, approved, gap or typed gap;
- calibration and game_policy labels, for example «не исторический факт»;
- digests, versions, refs, debug text;
- placeholder names that only stand in for missing data.

**Existing norm basis:**
- the player-safe projection, CONTRACT_INDEX row «Narration/UI»;
- `PUBLIC_PAYLOAD_HIDDEN_LEAK` in game-web contracts, which blocks hidden fields but not service text inside visible fields;
- `interface_ux.md`, which is UNDECLARED / DOMAIN GUIDE only.

There is no explicit active rule yet. A norm text goes through CORPUS_EDIT for the Narration/UI contract after the audit, and the owner sees it first.

**How to apply:**
- Model-facing text counts too, because the LLM can repeat a label into prose.
- Data labels live in metadata only, as in [[owner-decisions-d71]].
- Fixes go to the presentation and narration owners. A deterministic guard on player-visible text belongs at the player-safe boundary. Do not filter after the fact in the UI.

Started: fleet task `ui-labels` (audit, no code).

**Norm text approved by the owner (10-02 ~08:30Z, «да»).** Five points: only in-world descriptions and approved neutral UI elements reach the player; ids, statuses, calibration marks and metadata stay structured internal data; model-facing text meant for display or retelling carries no service marking; the public boundary checks every displayed text field before delivery, and a violating field is not published; a generic description is allowed only as an observable trait, never a technical number in place of a name. Going into the corpus via task `corpus-d72` (CORPUS_EDIT, then CA). The guard itself is task `ui-guard`.
