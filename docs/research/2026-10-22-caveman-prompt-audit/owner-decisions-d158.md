---
name: owner-decisions-d158
description: "D158 (10-08 ~07:35Z) prose freedom: world strictly from data, narration free; richer writer input; third person past tense by hero name; PC:252 wording; prompt part of opening-wire/writer-input stopped. Supersedes D78 and D153 п.3 for the writer"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-08T08:41:18.017Z
---

D158 (2026-10-08 ~07:35Z): the owner answered the prose helper's 5 questions via «12 Помощник для вопросов владельцу» (D145): «все по рекомендации». Relayed by «5 Помощник по прозе».

1. **Boundary.**
   - World strictly from data: people and animals, items, terrain, paths and where they lead, where people stand, names, events, outcomes, the hero's body and gear, his past, elapsed time.
   - Narration is free: light, warmth, smells, background sounds, the hero's thoughts and feelings, small movements, connectives.
   - Forbidden: inventing hooks (game, smoke, voices, tracks, dwellings) and contradicting facts.
   - The same boundary holds for NPC speech: world from data; manner, feelings and opinions free.
   - **Supersedes D78** («the model invents nothing») and **D153 п.3 for the writer**: the perception owner gives material, not a ceiling.
2. **Writer input additions, in this order:**
   - where people stand and what they are doing;
   - paths: where they lead, direction, relief;
   - vegetation, ground, light and sounds by time of day;
   - the hero's character, goal and origin (D11).
3. **Third person, past tense, by the hero's name.** Code facts written in second person («Вы внимательно изучили…», «Вы — Микула») become neutral. Fix style_constraints second_person, the auditors and the tests.
4. **PRODUCT_CONSTITUTION.md:252.** Make precise that «invention» means world facts, not the hero's sensations or thoughts. This is the owner's direct request to edit a protected governance file (AGENTS §1.1), valid within that edit's task only.
5. **Stop the prompt part** of opening-wire (REVIEW-18) and writer-input; the projection part continues.

**Plan (mine):**
- CR «свобода рассказа» via CORPUS_EDIT: situational_prose_requirements §2, §3.1, §4.2, §4.5, §14, §16; npc_conversation_mode_contract speech part; packages/narration/MODULE.md; fleet RULES.md:150; D78 text in HOW_WE_WORK:409 and CURRENT_SPRINT:39.
- Separate task for PC:252.
- New short prompts (~3k chars, sample trial-1008/sys_free3.txt) plus a line on restrained tone. The auditor checks only the world; unsupported_sensory is removed. About 12 prompt-regex tests (trial-1008/inventory.md).
- Each prompt goes through prose-helper review and a cloud probe (D157) before qwen.
- Data items → projection owners (people positions REVIEW-18, occupations #566, hero intent #586, place raw #551).

**Owner clarification (10-08 ~08:40Z, in the prose helper's chat, verbatim):** «нейтральные звуки и запахи среды можно оставить (запах леса, шум ветра и прочее)». Background sounds/smells following from place, vegetation, season, weather and time of day are free; a sound or smell that reveals people, animals, work, water or dwelling is a world fact (from data only). Wind noise only when wind is in the data.

**Owner, 10-08 (prose helper chat):** «важно не задушить писателя опять». Five protections adopted by me and written into fleet RULES.md (after the D158 line): no narration bans in writer/auditor/repair system texts (ph_scan.py watcher alerts); each prose role task ships a sol D102 «freedom guard» test; any new «не …» rule only for an observed world invention, phrased as a world rule, after prose-helper review; every prose change passes cloud probe + blind judges at D159 thresholds and a change lowering liveliness is rejected; anchors A0/E from the 10-08 trial in every blind set.

**Why:** the owner judged current prose «отчёт, переодетый в прозу»; the trial showed freedom plus dense data gives the best and least-invented prose. Related: [[owner-decisions-d156]], [[owner-decisions-d153]], [[owner-decisions-d78]].
