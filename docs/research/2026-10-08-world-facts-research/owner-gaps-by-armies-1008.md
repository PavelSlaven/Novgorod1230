---
name: owner-gaps-by-armies-1008
description: "Owner 10-08: ALL gaps in the knowledge base are to be filled by armies; the prose helper (me) checks fit (form/voice) and sufficiency (depth + D163 bench); content approval stays independent (sol)"
metadata:
  node_type: memory
  type: project
  originSessionId: b18be067-2ea2-4675-8b46-3e075512a88a
  modified: 2026-10-08T15:46:02.973Z
---

Owner, 2026-10-08, directly in the prose-helper session:

> «Все пробелы в базе нужно будет заполнять с помощью армий, а ты будешь проверять на соответствие и достаточность. Напомни ведущему на всякий случай.»

Forwarded to the lead verbatim on 10-08, with a script-built inventory: `tmp/prose-helper/gaps/gaps-inventory.{md,json}` (sha de65d6a5), produced by `gaps_inventory.py`.
- 54 gaps; uncovered questions: fisher-09 and guide-08.

**My gate for each army delivery:**
1. **Fit:**
   - check_form v3.3 PASS;
   - refs exist (checked by script);
   - source, directness (direct / reconstruction / transfer), period and place marked for every fact;
   - my D156 voice read.
2. **Sufficiency:**
   - ≥ 5 (target 8) concrete facts per typical question, counted by script;
   - unfilled questions are explicit gaps;
   - then a D163 bench per batch: hidden reference ≥ 8, cloud ≥ reference − 1, qwen with no inventions on covered questions, no reference-style dump.
3. **Content approval** is separate: independent sol. I check form, voice and depth, not historical truth.

**Why:** the pilots showed that the answer ceiling is data depth (fisher r3) and that a small model invents where data is missing.

**Lead recorded it as D168.** Army specs are ready (10-08 ~13:40Z) at `tmp/prose-helper/gaps/ARMY-GAP-SPECS.md` (sha cbef969a) and `army-gap-specs.json` (5e51ba62).
- 49 items, 146 minimum new facts.
- Drafts by Sonnet, two critic rounds, and my 3 fixes.
- Global counting rule: direct evidence and a marked reconstruction from Novgorod/NW finds of the period count; transfers and 19th–20th-c. ethnography don't.
- Army order: fisher-09 and guide-08 first, cards with CR #623.

**Armies started 10-08 ~13:30Z:** gap-fisher, gap-guide, gap-trader, gap-boatman, gap-forest-worker (sol + sol subagents).
- The five plans were checked against the specs: no blocks.
- Uniform delivery format: `gaps/D168-delivery-fields.md` (sha e323b748).
- The shared gate script is `gaps/check_d168.py` (e5d078de). It checks fields, the counting filter, numbers vs quote, quote ≤ 15 words, coverage by question_id and side vs min_facts, duplicates vs ctx, and check_form v3.3 on t (without fisher coverage).
- Self-tested on a planted sample. Run it at each D168 delivery.
- v2 (sha 0b5e6c82, 10-08 ~14:10Z) fixes the gap-fisher findings: a check_form that fails to run is now FAIL, and an unknown question_id is FAIL.
- Lesson: test checkers with negative probes (missing dependency, out-of-spec ids), not only planted bad facts.
- Search-completeness audit pattern (`gaps/AUDIT-gap-boatman-search.md`, sha 2a55771e): one Sonnet per gap item reads the army's part.json, then probes the books FTS index read-only (`/srv/novgorod-work/data/books/index.sqlite`, tables chunks_fts / chunks / books).
  - Boatman result: 6 mostly honest, 2 shallow, 41 leads.
  - The army searched only pre-chosen books and §§, not chronicle years or plots.
  - Offered to repeat the audit for the other armies' DONEs.
  - **Lead: yes**, run it on every remaining DONE (fisher, guide, trader, forest-worker), plus check_d168 v2 and the XIII reclass scan. Send a combined result to the lead, who forwards one REVIEW to the army.
  - Reusable script: scratchpad `gaps/audit_search_wf.js`. Run Workflow with scriptPath and args `{area, items: [question_ids]}`.
- 10-08 ~14:45Z, checker versions:
  - check_d168 v3 (ec1aeb24) adds per-side coverage via `gaps/spec-sides.json` (cfddd51f, extracted from closed_when; sides «вне min_facts» excluded);
  - check_form v3.4 (1e555039) bans a source or find named in the fact text («в новгородской грамоте…», «встречаются на дворе»); «по грамоте» is allowed.
- Batch review `gaps/REVIEW-batch-d168.md` (9d38dd8f), sent to the lead. All four not ready for sol:
  - fisher — sides, 49 leads;
  - guide — form, 52 leads;
  - trader — form; its audit is pending;
  - forest — XII-c items left as transfer, 40 leads.
- Search audits show 2–4 shallow items per army. Typical misses: chronicle years (1142, 1147, 1228, 1256), XII-c charters (Vsevolod, Varlaam, Antony), the implemented 1269 treaty.
- The lead's Claude budget ends ~17Z (until 10-11 17Z). I asked who relays REVIEWs after that.
- 10-08 ~14:50Z state:
  - Lead forwarded REVIEW-gap-<area>-d168-r1 to fisher, guide, trader and forest-worker; the armies are now in r2.
  - Trader audit `gaps/AUDIT-gap-trader-search.md` (c70caf50): 5 shallow items, 59 leads; included in REVIEW-batch (37fa2db0) and sent to the lead to relay.
  - check_form v3.5 (343dcf37) also bans «по предлагаемой грамоте» and «проект договора» in t.
  - boatman r2 (2d217012): FAIL on voice only, 6 such facts. The army fixes them and reruns check_d168; on PASS it goes straight to sol without my re-check.
  - Audit subagents had written /tmp/q.py and /tmp/p.py on servak. I removed them; `audit_search_wf.js` now forbids files outside /tmp/ph-audit-<q>/ and requires prefix FTS search (мыт*).
  - ~15:00Z r2 verdicts sent to the lead:
    - boatman r3 9c97d020: PASS, ready for sol.
    - guide r2 0fb16043: PASS, 21 counted, ready for sol.
    - fisher r2 d56f5c39: script PASS with 13 counted, but one voice fix — «Марта предписывала…», where the letter author's name stands in for the source; then sol.
    - fisher r3 d26da5ed: PASS, sent to sol (ap-gap-fisher).
    - guide went to sol (ap-gap-guide).
    - forest r2 11cc696f: script PASS, 15 counted; voice fixes needed:
      - «могла расти» is a historian's hedge;
      - «Грибы ты ешь» is an empty fact;
      - «наждачный» is a doubtful word for the period;
      - the Savva letter persons must become practice.
    - trader r2 95a215d7: PASS, 30 counted; voice fix: private persons from letters become practice.
  - cards-1011-01 (smith and jeweler) DONE at 15:12Z: check_form v3.5 PASS on 20 card facts. Not yet sent to anyone; review after 10-11:
    - every fact opens with «Ты …», which reads like a list;
    - there are empty facts («Ты работаешь в литейной мастерской»);
    - depth is about 2 facts per card, against the D164 form (tool, conditions, materials, success, failure);
    - plan: D163 action bench before any approval.
  - **check_d168 v4 (9fc25321, ~15:55Z)** implements the lead's rule after ap-gap-guide F03: an event later than 1230 is not NPC knowledge.
    - A past-tense t with no «ты»-verb and a period after 1230 → FAIL.
    - A later practice → NOTE (the approver decides applicability).
    - A later transfer-event → NOTE.
    - Hits: fisher 1, guide 2, trader 3, forest 1; boatman clean.
    - **Lesson repeated:** a python heredoc patch again planted U+0008 in a regex (`\b`). Use the Edit tool for regex lines and grep for \x08 after every patch.
  - **Voice rule (mine, 10-08):** private persons from birch-bark letters (Марта, Домажир, дочь Анны, Савва) do not go into t. The NPC wouldn't know them, so t gets the practice the letter shows. Princes, bishops, chronicle events and famous founders (Антоний, Варлаам) stay in third person. Not scriptable; check by eye at every delivery.
  - **All Claude sessions stop ~17Z until 10-11 17Z, with no relay.** Armies run autonomously and log questions in out/questions-for-lead.md.
  - **After 10-11:** re-check the r2 deliveries (check_d168 v3 + check_form v3.5 + voice) and read each army's questions-for-lead.md, then D169 recon per approved army.
- First D168 (boatman) found the army counted XIII-c Novgorod evidence as transfer, and turned a single event (1228) into a practice. Sent back for r2. NOTE-gap-d168-xiii went to all armies.

**How to apply:** keep the inventory updated as benches reveal gaps. Rerun `gaps_inventory.py` and append the new sources.

Related: [[feedback-bench-before-filling-base]], [[owner-npc-knowledge-access-1008]], [[owner-wk-living-knowledge-1008]].
