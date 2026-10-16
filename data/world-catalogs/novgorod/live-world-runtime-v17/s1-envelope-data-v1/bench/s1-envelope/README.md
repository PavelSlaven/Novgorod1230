# S1 envelope D41 project (frozen inventory only)

Hypothesis: bounded exact refs separate material-backed structure from missing topology and never present free prose as materialized world state.

Variants: A is the current target S1 profile-null gap; B is a future candidate containing only independently approved exact refs. No applicable structural B is presently admitted.

`cases.json` freezes 12 future evaluation cases and expected gates before any production model response. `run.mjs` checks only inventory shape and writes `dry-run-result.json` with `execution_status: not_run`; it does not execute a player-text gate, classify a case, test the S1 validator, score prose, or call a model. Validator mutation tests live separately under `bench/s1-validator/` and use the real task-local validator CLI.

A production model comparison requires separate authorization and runner, 3 samples per case, the same game model/settings for A/B, a frozen rubric and blind text review. It is required before any model-facing S1 data/descriptor is approved or activated unless a reviewer establishes the HOW_WE_WORK §11.1 mechanical-reuse exception.
