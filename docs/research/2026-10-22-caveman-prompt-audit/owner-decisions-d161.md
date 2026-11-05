---
name: owner-decisions-d161
description: "D161 (10-08 ~08:55Z) NPC speech reaches the player inside the narrator's third-person prose, not as a first-person chat block; always judge prose as the reader sees the screen"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-08T08:47:49.497Z
---

Owner, in the prose helper's chat (relayed verbatim): «Если NPC про себя говорит в первом лице, а игрок должен это читать в третьем, типа "Петрок прищурился и негромко повторил "Туда не ходи!"" против "Я Петрок, прищурился и негромко повторил "Туда не ходи!". Очевидно, что первый вариант лучше и связнее выглядит. Всегда оценивай прозу с точки зрения читателя.»

- On a TurnScreen with approved prose the NPC line lives only inside the narrator prose (verbatim, attributed, third person); no separate `<blockquote>` chat block; `exact_npc_utterances` stays for FactualTurnDeliveryScreen. Drop the «Собеседник» label (D72). Issue #600.
- The responder still speaks as the NPC («ты»-frame, first person in the line itself); the narrator renders it.
- Review rule (prose helper + me): judge what the player reads on the screen as a whole — narrator prose + lines + client rendering — not role JSON separately. NPC speech probes run the chain responder → turn writer → screen.

Related: [[owner-decisions-d158]], [[owner-decisions-d72]].
