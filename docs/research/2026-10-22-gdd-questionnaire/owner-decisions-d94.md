---
name: owner-decisions-d94
description: D94 (10-06) — NPC speech manner checked by actual speech, not the manner label; manner = temperament + social standing; N1 v2 activation held until bench passes
metadata:
  type: project
---
D94 (2026-10-06, #133 comments 6010079905 + amendment). Owner: speech manner must show in how the NPC actually talks (retelling an event in character), not as «говорит спокойно, размеренно».
Manner = **temperament + social standing/estate**, two distinct inputs; a commoner speaks plainly, sometimes roughly, different vocabulary; high-status people differently. No anachronisms.

**Why:** writer r3 bench (b2-code) only graded the manner description; 48 outputs → 10 distinct, «Говорит спокойно и размеренно.» ×12. Writer input = one temperament + one value; prompt asked for tempo/loudness/tone; speech_address data (speech_registers.csv, address_forms.csv, candidate) not projected. I approved that bench criterion — my miss; I'd also downgraded «manner restates temperament» to non-blocking.

**How to apply:** task `n1-manner-speech` (plan at reviewer): wire audit, BENCH-PLAN with arms A current / B richer input (temperament + standing separate fields, manner as speech guidance) / C no manner; blind matching «who is who» per axis, thresholds pre-registered. N1 v2 profile not activated/merged into PR #98 until it passes. For any LLM style field, the bench must evaluate the downstream behaviour, not the field text. Related: [[owner-decisions-d91]], [[local-model-context-rules]], [[owner-decisions-d83]].

**Addendum 2 (owner approved my design):** code assembles manner layers — standing (speech_registers register), relation to addressee (address_forms speaker→addressee pair, changes per interlocutor), temperament, occupation/origin lexicon, current state; LLM writer only adds 1–2 personal speech habits (stored, D-005 share). Responder gets Russian speech guidance, no ids/scale names, no canned phrases (D62). Bench arms A / B1 code / B2 code+habit / C none; per-axis blind matching. Builder must have one owner; speech_address data is candidate → approval/import task if bench confirms; CA trigger (LLM authority boundary).
