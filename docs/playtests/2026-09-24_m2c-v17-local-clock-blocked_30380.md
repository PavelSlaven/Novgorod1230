# M2c v17: real UI local movement run 30380

**BLOCKED at Phase 3 temporal validation.** Normal game-web, production HTTP
handler, real configured model and an isolated PostgreSQL pair with fixture
approvals were used. Production data was not changed.

The forest start opened; observation, exact HTTP retry, reload and Continue
passed. The Path panel displayed `Проход 1` and
`Продолжить путь — выход 2`. The browser submitted `Проход 1` verbatim.
The real turn-step response selected the offered
`domain_operation_1_request_movement_local` with `request_movement`, the
player actor and the exact committed local edge ref. The turn then failed
before commit with `TRACE_PHASE_3_TEMPORAL_STATE_INVALID`:
"Movement traversal does not own one exact clock update." No movement or
generated G5 occurred. This isolates the next defect after semantic binding.

Party `party:eb4818c1934ba21413f4aa3d`. Isolated report:
`%TEMP%/novgorod-target-http-smoke-30380.json`, SHA-256
`071097494b6a1b044695fa944f7365fa44dbf944a465c7bdb967db25fd61522`.
The isolated browser test ended **0/1 FAIL** on the movement error.
