---
name: owner-decisions-d62
description: "D62 (10-01) — NPC talk is live LLM, never scripted phrases; learning from NPCs issue #222; start-territory answers (boatyard kept, sand gap closed, orchard/bees and quarry researched); recorded in #133"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-01T14:47:46.001Z
---

**D62 (2026-10-01)** — recorded in #133 (comment 5933884467).

1. **NPC conversation is live, driven by the LLM. No scripted phrases ever.**
   - The owner asked what the "300 replies" were. They are **player** lines only: bench stimuli. Their expectations are grading criteria, not model answers.
   - Phase 2 of #220 must not propose phrase banks, answer templates or canned NPC lines, neither as data nor as fallback.
   - Period speech is fed as speaker properties (register, address forms).
2. **Learning from NPCs is issue #222.** A character can learn from an NPC (e.g. setting nets), with learning time, difficulty, prerequisite skills and the price of teaching. It depends on #170 (skills rework).
   - Inventory: there is no skill progression in code; skills are set at generation, and the norm docs are UNDECLARED.
   - Building blocks that exist: the WK apprenticeship claims, game-base `skills_competences.json` (33 candidates with gate skills), and 50 craft processes with skill level and duration band.
3. **Start-territory types package** (merged dd0619a7):
   - the boatyard regional exclusion stays;
   - **sand: close the gap** — make it a candidate plus a selector proposal for Opus;
   - **orchard and wild-hive beekeeping: research**;
   - **stone quarry: geology research**.
   - All three went to fleet task start-types as step 4.

**Why:** the owner wants NPCs to feel like real people; scripted lines contradict the LLM-driven design ([[owner-npc-living-conversation]], [[novgorod-game-vision]]).

**How to apply:**
- Any NPC conversation work (npc-talk, npc-claims, npc-identity) must never add phrase banks or templates.
- When describing benches to the owner, say plainly that the stimuli are player lines.
