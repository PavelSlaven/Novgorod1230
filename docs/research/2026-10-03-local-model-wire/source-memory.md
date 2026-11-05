---
name: local-model-context-rules
description: "TOP-PRIORITY standing rules (owner D78/D79, 10-03) for what and how the game passes to the local model; built from the #230 wire audit — check the payload before blaming the model; projection, form, contradictions, params, bench"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-03T16:17:14.535Z
---

Owner: what reaches the local model and in what form is «одно из самых важных в проекте»; «при кривой передаче у нас игра просто не будет работать» (D79). «Большинство проблем с ней происходит как раз из-за некорректной передачи» (D78).

**Why:** the #230 audit (iss-230-army, HEAD cc80771c, `fleet/tasks/iss-230-army/out/`) plus my script pass over its payloads found:
- 24 runtime roles plus portrait;
- every system prompt is 0% Cyrillic English;
- every user message is raw JSON with 0–28% Cyrillic, so the NPC responder gets ~1% Russian yet must speak living Russian;
- thinking is off in all roles; temperature is omitted (provider default) for planner, interpreter, responder, autonomous and combat;
- the planner system prompt is 44.5k chars and its repair 51k;
- `expectedSchema` never reaches the wire (json_object only);
- the opening input is the canonical DTO serialized whole, with instance ids, source refs and trace;
- the opening prompt demands «2–4 paragraphs» on 4 facts, while the norm (`situational_prose_requirements.md:139`) says that is not a word count.

**How to apply — every task that touches a prompt, a role's input or role params:**
1. **Diagnose the wire first.** On any local-model failure, capture the real provider body through `buildProviderRequestPayload` before judging the model: system, user, effective params, repair input. Never mix provenance levels: deployed wire, owner-function reconstruction, frozen fixture, old-commit capture.
2. **Projection, not serialization.** The model gets a task-shaped projection, not the canonical DTO. Player-facing writers (narrator) get a player-safe projection. NPC roles (talk, decisions, combat) get **that NPC's subjective projection**: everything it knows and perceives, even what the player does not know, and nothing more (dot docs-d80-2, 10-04).
   - Kept out: instance ids, source refs, trace, state versions and counters (D72).
   - Choices go through short opaque keys that the server rebinds.
   - Clarified 2026-10-05 (WK benches D41-9/11): in a menu of vocabulary concepts (WK concept refs `wk:domain:concept`) the stable semantic ref itself may be the key — it is not an instance id or trace, and semantic keys beat opaque `f0` (coverage 57→66, precision 54→72) and Russian keys (B-ru coverage 40 vs 54/72). Production PR98 already passed wk refs. Instances (NPC, items, positions, parties) — opaque keys only. Recorded in fleet RULES.md §«Вход локальной модели».
   - Authority and ids stay on the server.
2a. **What the model must not say, it does not receive.** Example: a hidden NPC name — in S19-2 the name leaked in 12+12 rows despite a prompt ban. Projection beats a prompt prohibition.
3. **Everything the world knows reaches the role.** This covers season, light, weather, acoustics, smell, water and vegetation, NPC identity and knowledge.
   - Atmosphere comes from data; the model invents nothing (D78).
   - A missing fact is not «silence».
   - Each loss has a projection owner, and the fix goes there, not into the prompt.
4. **No impossible or contradictory demands.**
   - The prompt must agree with the active norm, the data and the validator.
   - Length follows the active norm (usually 2–4 connected paragraphs), not the fact count (see 5b).
   - No «long, but nothing beyond the data».
   - No «required field X» when X can be unknown.
4a. **No concrete phrase examples or forbidden-word lists in prompts** — the model copies them as templates (D62). In opening D78, «плеск/шелест» appeared in 26 of 36 controls without the fact. One general rule instead.
4b. **Length follows the norm, not the fact count.** «Short for sparse input» squeezed the opening into a dossier (literary form 52%).
4c. **Output contract as an exact JSON skeleton.** Keys are consistent (English); values are Russian where read. The normalizer and validator use the same keys (N1 S19-6: the key «вид» among English keys → `type`, 45 of 45 rejected).
4d. **No internal jargon in prompts** («N1», owners, «server assembles…»).
4e. **A writer and its auditor apply the identical rule.** Do not offer what the model must not fill: drop optional ref fields it cannot fill correctly; do not offer the «мнение» kind when the subjective lane is empty.
4f. **Translation must keep meaning.** world_process B lost «меняет» in an outcome meaning → two outcomes overlapped → wrong choices.
4g. **Language evidence:**
   - in opening arm L, Russian raised stage-23 approval from 33 to 52 of 57, with literary form 97%;
   - in world_process v9 the effect was neutral (10 of 12 ties).
   Big for prose writers, small for bounded choices. Russian is the default. Language does not fix contract gaps, such as a missing «unknown» outcome.
5. **Role params are input too.** Check the effective temperature, thinking, max_tokens and response_format/schema, not the defaults. Repair gets a consistent original plus the errors. max_tokens leaves room for the answer: truncated JSON (finish_reason=length) is a parameter defect (the N1 auditor at 256 tokens → parse failures).
6. **Form is a hypothesis until benched.** Instruction language (Russian versus English), JSON versus prepared text, size and ordering, and putting the schema on the wire are each a D41 bench: one minimal change, same model and params, scored by script first, then a blind literary score.
7. **Gates.** Any prompt or input change triggers Contract Auditor (LLM prompt and authority). I read the actual payload diff in review. Cite this file in the task text.

8. **Composition by script (D267).** Every wire review includes `codex-direct/wire-audit.py` on the captured wire: id and time-object share, duplicate strings, where the shared prefix breaks (cache), answer whitespace; BENCH-OK carries a fifth line «объём/дубли/порядок». Lesson 10-21: the M6 responder wire had 22% ids, 13% time objects and a prefix break at `decision_reasons` while my manual review only checked that facts were present.

Fleet executors get the same rules in `fleet/RULES.md` («Вход локальной модели»). Related: [[owner-decisions-d78]], [[owner-decisions-d79]], [[bench-check-mandatory]], [[owner-decisions-d72]].

**Owner D81 (2026-10-04): I personally review EVERY prompt — no delegation.** For each role in prompt-rev, opening-repair, b2-code (N1), combat-min and iss230-wp, I read the full system prompt and one real user payload before accepting. Subagents may count and diff, but the read and the verdict are mine. Check for:
- junk: example phrases, forbidden-word lists, service ids, English enums, empty arrays, duplicates;
- contradictions with the norm and the validator;
- length demands;
- language.

**Lesson 10-07 ~20:15Z (owner: «опять проблема с передачей контекста в промт писателя»).** On opening-wire, NPCs reached the writer as `{"имя":"человек","факты":["Виден человек."]}` in 5 of 7 scenes with people. That is a visibility status, not what the hero sees: no appearance, activity or position. The model then invented positions, and both judges gave К5. I missed it in the D81 review because I read only the work_storage case, which has no people; the bench helper's wire review counted «люди 8/14» as present.
How to apply:
- In every D81 or wire review, read at least one case of each data kind (people, items, paths, place) and ask: «is this what the hero perceives, or a status or label?».
- Pass «Виден X», «имя: человек» and any visibility or recognition flag as perceived content, never as a bare status.
- Before blaming the model or the rule, open the people block of a failing case.

**Lesson 10-08 ~01:00Z.** I cited «12 unrelated WK facts on the turn writer wire» from a writer-input D81 «after» reconstruction. That input came from the run2 capture, whose WK planner was a script (first allowed domain) and whose encoder was a zero vector. The irrelevance was a property of the capture, not of production; army-572 showed it.
How to apply: before quoting any content of a captured wire as a game defect, check the capture's provenance for each upstream role (planner, encoder, retrieval): real or fixture. Only the projection/format layer is proven by such captures.
