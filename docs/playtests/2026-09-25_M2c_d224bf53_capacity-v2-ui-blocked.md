# M2c v17: capacity v2 UI regression probe

- Date: 2026-09-25. Branch `codex/live-world-runtime`, HEAD at start `d224bf53`. Evidence: local `%TEMP%/novgorod-target-http-smoke-68856.json` (`target_http_browser_smoke_v1`), configured real provider and Chrome via browser-harness on isolated PostgreSQL. The report has no `finished_at` because the fixture assertion failed after the explicit browser finish.
- Forest party: opening identified Mikula as a forest worker and showed an unidentified person. Ordinary look showed trees, a person, `Проход 1`, and `Продолжить путь — выход 2`. Exact UI actions then committed `Проход 1` (`arrival → focus`, state version 2), look (`focus`, version 3), `Проход 2` (`focus → departure`, version 4), and look (`departure`, version 5). The exit remained visible.
- Exact `Продолжить путь — выход 2` failed before commit with `LIVE_WORLD_EXPANSION_PREPARATION_FAILED`; position stayed `departure`, version stayed 5. Browser fixture ended with `generated_g5_seen:false`. Target HTTP test failed its visible movement assertion (1 failed test, 0 passed). No generated scene or finite decrement was observed.

This result blocks the occupied generated-focus and depletion acceptance on this HEAD. Earlier generated G5 successes used a different HEAD and do not prove capacity v2 runtime behavior.

## Follow-up after v2 natural and finite binding derivation

At HEAD `c4f3430b`, a fresh isolated real-provider fixture (`%TEMP%/novgorod-target-http-smoke-73532.json`) again showed a dry forest opening with two unidentified people. Ordinary UI actions committed look (state version 1), `Проход 1` (`arrival → focus`, version 2), look (version 3), `Проход 2` (`focus → departure`, version 4), and look (version 5). The visible `Продолжить путь — выход 2` still failed before commit with `LIVE_WORLD_EXPANSION_PREPARATION_FAILED`. The target HTTP test failed 0/1 at its visible movement assertion. `generated_g5_seen:false`; no finite source or decrement was observed. The remaining preparation cause is under investigation.
