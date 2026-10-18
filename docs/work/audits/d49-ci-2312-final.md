# CI run 39093633099

- Workflow: `test.yml`
- Branch: `codex/d49-ci-recovery`
- Commit: `2312dc837720bdd0dd2b5b82d53a7e2f06778b06`
- Run: https://github.com/PavelSlaven/Novgorod1230/actions/runs/39093633099
- Final status: `failure` (completed)
- Jobs: 10 total — 8 success, 2 failure.

Job results:

- `evidence-only` — success
- `full-npm-test-fast-rest` — success
- `full-npm-test-fast-tools` — success
- `full-npm-test-acceptance` — success
- `full-npm-test-integration` — success
- `full-npm-test-p12` — success
- `full-npm-test-fast-apps` — failure
- `full-npm-test-fast` — success
- `full-npm-test-browser-architecture` — success
- `full-npm-test` — failure (2-second required-suite aggregator; it reports the apps failure)

The failed apps job ran the apps merge-gate step and exited 1 after 59m34s. TAP totals from that step: 3,477 test executions, 3,474 passed, 2 failed, 1 skipped, 0 cancelled, 0 todo. This is the observed TAP count for this job only; passing-job logs were not downloaded, so this is not a whole-run aggregate and is not deduplicated across jobs.

The one TAP skip is `S1 live eval uses configured spatial semantic descriptor and admission`; TAP says it requires `RUS_S1_LIVE_EVAL=1` and `LLM_BASE_URL`.

Failures:

- `apps/game-server/test/issue-247-supported-memory-fallback.test.js:134`: expected 3 speech claims, got 6 (`ERR_ASSERTION`).
- `apps/game-server/test/lower-dvina-trace-turn-step-current-scene-continued.test.js:88`: projection threw `TRACE_CURRENT_SCENE_PROJECTION_INVALID` at `apps/game-server/src/runtime/lower-dvina-trace-turn-step-fire-visible.js:200`.

Tests not run: no reruns were started. The final `full-npm-test` job only evaluates required job outcomes; it runs no tests. TAP’s one skipped test is identified above. No other test-level skip categories are available from the downloaded failed-step output.

Failed job log (job-level endpoint returned plain text): `C:\Users\Slaven\AppData\Local\Temp\d49-ci-2312\failed-apps-job.zip`
