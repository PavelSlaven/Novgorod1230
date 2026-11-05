---
name: owner-decisions-d69
description: "Owner 2026-10-01 ~20:05Z (D69): all four researched directions go to work in my order — #221 news/memory first, #223/#175 yard animals v1 (D63) second, #170 skills and #222 learning after O1 and minimal combat"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-01T20:08:50.452Z
---

Owner, 2026-10-01 ~20:05Z: «Ставим всё, в предложенном тобой порядке.» This answered my research bundle report on four issues: skills #170, learning #222, news/memory #221, live property #175.

Order and how each item was started:
1. **#221 acquired knowledge and NPC memory.** Task `news-221` (luna, code kind, my plan). Step 1 is an inventory plus the CR `cr-npc-acquired-knowledge.md`, no code. It must not overlap these tasks:
   - d66-perception, which owns the perception → NPC knowledge write;
   - npc-epoch-guard, which owns dated events and the temporal gate;
   - npc-claims, which owns the conversation slice;
   - npc-talk, which owns permanent knowledge.
2. **#223 / #175 yard animals, first version per [[owner-decisions-d63]].** Task `yard-223`. Step 1 is the CR only. Code waits for O1 (v17-channels) to land, because ownership reuses the O1 R1 slot mechanism.
3. **#170 skills and #222 learning:** after O1 and minimal combat ([[owner-decisions-d65]]). The research is done and accepted. Key fact: the sources give no numeric difficulty scale and no Novgorod learning norms; numbers will be game calibration checked by D41 bench. The choice of the canonical skills norm document goes via CORPUS_EDIT.

**How to apply:** research reports live in `fleet/tasks/res-*/out/*-report.md`. Keep #170 and #222 in [[fleet-backlog]] until O1 and combat land.

**Addition, owner ~20:20Z on #221 memory:** «не маловато ли? Люди подолгу помнят яркие для них события». The week window applies only to everyday detail. Vivid personal events are remembered long, as gist: danger or injury, fire, theft, fight, death or birth in the family, notable arrivals, big city events. Code decides vividness by event class and the NPC's role in the event; the class list is approved data. Today §33.3 gives long memory only to significant speech acts, so the CR must extend it. Sent to news-221 as `NOTE-news-221-memory`.
