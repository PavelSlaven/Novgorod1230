# CI verification: run 39098367778

- Workflow: `test.yml`
- Branch: `codex/d49-ci-recovery`
- Exact head SHA: `fdca62a7862a4c5032e26afa330b88fa6c2f30a0`
- Run: https://github.com/PavelSlaven/Novgorod1230/actions/runs/39098367778
- Final status: `success` (completed)
- Jobs: 10 total — 10 success, 0 failure, 0 cancelled.

Job results:

- `evidence-only` — success
- `full-npm-test-integration` — success
- `full-npm-test-p12` — success
- `full-npm-test-fast-apps` — success
- `full-npm-test-fast-tools` — success
- `full-npm-test-acceptance` — success
- `full-npm-test-fast-rest` — success
- `full-npm-test-browser-architecture` — success
- `full-npm-test-fast` — success
- `full-npm-test` — success

TAP totals summed from the eight test-suite jobs: 8,784 test executions, 8,770 passed, 0 failed, 14 skipped, 0 cancelled, 0 todo. These are execution counts from CI logs, not deduplicated test identities; suites overlap across jobs. No failed assertions or failing-step logs were present.

The 14 skips are TAP test skips, separate from workflow steps skipped by the profile matrix:

- 3 executions: legacy D97 revision 34/35 scenarios, explicitly marked unsupported pending migration to v17/D101.
- 1: spatial S1 live evaluation requires `RUS_S1_LIVE_EVAL=1` and `LLM_BASE_URL`.
- 1: issue #573 capture requires `ISSUE_573_CAPTURE_DIR`.
- 1: Docker cleanup self-check requires Docker and `postgres:16.14-alpine`.
- 8 executions have TAP `# SKIP` with no reason attached: local-play replay after server restart; five PostgreSQL-only integration cases; activated-v3 isolated-PostgreSQL composition; exact provider request capture for seven v17 opening/first-turn paths.

Workflow step skips are profile/condition-gated steps and were not counted as skipped tests. No files in the repository were changed; no rerun was started.
