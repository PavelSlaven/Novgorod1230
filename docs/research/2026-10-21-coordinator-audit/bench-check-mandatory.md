---
name: bench-check-mandatory
description: Owner D41 (2026-09-28) — a bench check (small out-of-game test on the real local model) is mandatory before implementation plans for LLM-dependent decisions
metadata:
  node_type: memory
  type: feedback
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-10-03T02:52:42.205Z
---

Owner loved the property bench («избавляет от необходимости собирать игру, а проверяет теории прямо на месте») and made bench checks mandatory (D41, #133; HOW_WE_WORK §11, CR field «Стенд», PR #180).

**Mandatory before a plan is approved when:**
- a decision relies on LLM behaviour (choice, understanding, writing);
- a prompt, package format, model or its parameters change (regression);
- narrator or NPC data change (prose test);
- code computes from data or model output (sample or simulation).

**How:**
- small and fast; real local Qwen as a client with game parameters, key never printed;
- 10–15 cases incl. unusual and adversarial ones, 3 samples per text case;
- variants side by side, an anchor against judge drift;
- deterministic checks first, blind judges only for judgement;
- separate bench errors from idea errors.

**Where:** `/srv/novgorod-work/benches/<name>/` with README (prose-test and prop-bench are the exceptions). Results go into the decision's issue or CR.

**Why:** it answers «does the idea work» in minutes, before weeks of code.

**Model name for runners that demand `--model` (10-02):**
- The shared client `/srv/novgorod-work/benches/_lib/model.mjs` with the prose-test settings serves `qwen3.8-27b-uncensored-w4a16-tp2`. Without `--model` it uses that default.
- `deepseek-v4-flash` from `packages/llm-runtime/src/provider-config.js` gives HTTP 404 there. All 270 calls of the #178 run were lost that way.
- Game role parameters from the repo still apply: temperature 0, top_p 1, thinking disabled, reasoning none, max_tokens 20000.
- Before a long run, probe one call (template `tmp/lead-tmp/probe/p.mjs`). Check the first lines of the log before walking away.
- Benches that touch World Knowledge retrieval need `set -a; . /srv/novgorod-work/venvs/wk-giga-run.env; set +a` in the unit; it also sets `CUDA_VISIBLE_DEVICES=` for CPU. Examples: S31, S34, npc-talk fixture replay, wk-gaps. Without it S31 (10-02) gave 82/90 WORLD_KNOWLEDGE_UNAVAILABLE.
- Run a runner from the cwd its README assumes (often the worktree root). npc-talk failed with ENOENT from the bench dir.
- Before queueing a READY, check the runner writes each result incrementally, with resume and a progress line per call. S34 (10-02) wrote only at the end: a 90-min timeout lost everything.

**How to apply:** don't approve a plan without a bench result in these cases. Propose benches proactively when two designs compete. A bench is not acceptance: a live playtest (WR §24.1) still accepts. Related: [[prose-test-for-data-sufficiency]], [[servak-fleet]].

**Bench runner pitfalls seen 10-02 (check at READY review, before queueing):**
- Captures written only at the end: require incremental JSONL with resume.
- Missing `model`: require the explicit qwen name in every capture row.
- `max_tokens` not production: take the role params from the production config.
- Runners that build production role code (e.g. `createLowerDvinaTraceNpcSemanticModel`) without the settings store fail with `missing_api_key`. They must go through `createLlmSettingsFileStore({filePath: RUS_LLM_SETTINGS_PATH})` + `createLlmSettingsOwner`, like `modular-entry.js:21–29`.
- **Seen 10-03:**
  - WK loader without `python: RUS_WORLD_KNOWLEDGE_PYTHON` gives WORLD_KNOWLEDGE_UNAVAILABLE (npc-talk, S31).
  - Runners not closing the Giga encoder or pool hang after the final report: S31 hung 2.5 h, npc-talk until the timeout. That blocks my sequential bench queue. Require self-exit; if a run hangs after a complete JSONL, kill the PID and let the queue move on.
  - Runners throwing on a gate before saving lose the whole run. Gates belong in evaluate, captures are saved first.
  - Opening runner demanded settings requalification. I never rewrite the settings file; the bench must load settings the same way the slice and opening-audit do.
- Freeze guards (S31): any edit to a frozen file after the dry-run makes the live run refuse. The executor must re-run the dry-run before READY. A refreeze by me is allowed only after a script shows that the change is outside the model inputs.
- BENCH-OK check (10-13, i693): before OK confirm the RUN entry script actually calls the model (callModel / model.mjs), not only --dry-run/--prepare; an offline payload builder as entry voided two OKs.
