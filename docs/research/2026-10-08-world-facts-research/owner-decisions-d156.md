---
name: owner-decisions-d156
description: D156/D157 (10-08 ~07:20Z) prose helper session reviews every player-facing prose prompt; every bench starts with a cloud-model probe on the captured input
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-08T07:19:39.714Z
---

Relayed verbatim by the session «5 Помощник по прозе» (owner told it directly in its chat, 2026-10-08):

**D156 — prose helper.** «теперь ты - помощник по прозе. Всё, что касается прозы в игре, той что видит игрок - всегда проходит через твою проверку и рекомендации… Так же мониторь сам задачи, чтобы мимо тебя не прошли промты.»
- Scope: all model text the player sees — gameplay_narrator (opening and turn) with auditor, format_repair, semantic_repair; npc_conversation_responder with format_repair, speech grounding audit, turn-step speech audit; projections into the writer input (presentation, canonical-opening-context, writer-input); norms situational_prose_requirements and npc_conversation_mode_contract.
- Before my PLAN-OK, D81 acceptance and BENCH-OK for these roles I send the item to the prose helper (or wait for its review in /srv/novgorod-work/tmp/prose-helper/<task>/<HDR>.md). It never writes bridges or runs the fleet.

**D157 — cloud probe first.** «теперь обязательное правило каждого стенда - включать пробу на облачной модели в первую очередь и смотреть. Если даже у облачной модели выходит криво - значит проблема во входных данных или в промте.»
- Before any qwen bench, the same captured system+user goes to a cloud model (Sonnet subagent or Codex sol) and the output is read. If the cloud model also writes badly, fix the input or prompt, do not run qwen.
- BENCH-PLAN gets a section «облачная проба: модель, файл, вывод». Prose probes are done by the prose helper.

**Findings that came with it (prose helper trial-1008):** the owner judged current narrator prose «никуда не годится… отчёт, переодетый в прозу». Cause is our rules (norm §2, §4.2, §4.5, §16; turn prompt :21/:75/:77; auditor unsupported_sensory; D78; D153 п.3), not the model. Owner decisions pending (via prose helper): boundary «world from data, narration free», priorities of «flesh» in data, third person past tense, PRODUCT_CONSTITUTION:252 wording, pause of the prompt part of opening-wire and writer-input. Materials: /srv/novgorod-work/tmp/prose-helper/trial-1008/.

**How to apply:** do not finally accept writer/responder prompt rules (opening-wire REVIEW-18, writer-input, npc-wire-565 responder) before the prose helper's verdict; projection parts (perception as Russian sentences) may continue. Related: [[owner-decisions-d153]], [[owner-decisions-d81]], [[owner-decisions-d83]].
