---
name: owner-decisions-d83
description: Owner 2026-10-04 (D83) — I personally review every bench design and readiness criteria (cases, arms, metrics, judge inputs, params) before any bench runs; armies built useless benches and burned tokens
metadata:
  type: feedback
---

Owner, 2026-10-04 ~20:50Z: «Армии собирают стенды, но ты сам эти стенды досконально не проверяешь, в итоге они гоняют бесполезно и жгут токены. Ты обязательно должен смотреть планы, стенды и критерии готовности, убедиться, что агенты корректно понимают задачу и только затем пускать их делать.»

**Why:** today's evidence.
- D65 v3: most cases had one option, T=0 collapsed repeats, judges saw no option menu → a smoke test, not a quality test.
- S19-6 broke on a contract key mismatch.
- prompt-rev benches crashed on imports.
- Opening judges were the author's own subagents.

**How to apply:**
- No bench runs without my explicit `BENCH-OK-<task>-<bench>`. A sol lead's approval does not count.
- Before approving, I check the `BENCH-PLAN`:
  1. hypothesis and the single change measured;
  2. cases: count, real choice/variation in each, paired cases isolating the factor;
  3. arms and what is held equal;
  4. effective production params (temperature!) versus bench params;
  5. what the model sees versus what the judges see;
  6. who judges: independent, not the author;
  7. script-first metrics and exact pass/fail criteria;
  8. dry-run evidence (imports, payload capture).
- I also check each executor's PLAN and readiness criteria for misunderstanding before work starts.
- Related: [[owner-decisions-d81]] (every prompt personally), [[local-model-context-rules]], [[bench-check-mandatory]].
