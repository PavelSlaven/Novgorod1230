---
name: owner-decisions-d135
description: "D135 (10-07) body-threshold interruption policy #463 = variant (b): soft threshold continues with narrator mention, strong threshold stops and asks the player; relayed by the helper session"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-07T06:01:07.663Z
---

**D135 (2026-10-07 ~06:00Z), #463 — interruption of long activities at body thresholds: variant (b) «warn at the strong threshold».**
- Soft threshold (satiety 50; energy 50): the activity continues; the threshold is only mentioned in the narrator's text.
- Strong threshold (satiety 20; strong fatigue = energy 20): the activity stops and the player is asked whether to continue.
- Satiety 0: already decided by approved data (starvation_health_harm_v2, harm 25/18 per hour, the wait continues). Energy 0: #258 (fail-closed event_effect_gap until a handler exists).
- Rejected: (a) never interrupt, mention only; (c) stop at every threshold (the pre-#244 code: every threshold `notice` + unconditional stop in spatial-v3-production-trace-runtime.js:350–361).

**Provenance:** the owner answered in the helper session «2 Помощник ведущего (ревью)»; the helper relayed it to me and asked me to register it (helpers do not register decisions). Owner's words, relayed verbatim by the helper: «Предупреждать на сильном пороге.» (answer to the helper's three options (а)/(б)/(в) with the expansions above).

**Why:** the owner wants the player to decide at a strong need, not at every recheck boundary.

**How to apply:**
- #244 (body-needs-bind) keeps its approved scope: thresholds are recheck boundaries, no invented policy. Its pinned tests (continuation through 50/20) are the interim state.
- Follow-up task after the #244 merge: approved policy data «body threshold → interruption level» (soft → notice + auto-continue with mention; strong → interaction: stop and ask) by an independent approver, then wiring in the time owner (temporal :1160–1176 InterruptionPolicy) and the narrator mention. Pinned #244 tests that pass through strong thresholds are changed only by sol (D102).
- Related: [[owner-decisions-d100]] (D102 tests by sol), #487 (body states to writer).
