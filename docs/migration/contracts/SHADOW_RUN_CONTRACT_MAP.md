# Shadow run contract map

## Corpus contract

`data/shadow-corpus/manifest.json`  
Schema: `rus.shadow_corpus.v1`

Обязательные поля:

- `corpus_id`, `version`, `source_provenance`;
- `comparison_policy.prose_comparison = semantic_invariants_only`;
- allowlisted `cases[]`;
- для каждого case: `id`, `kind`, `test_file`, `categories`, `severity`.

Test path обязан находиться внутри `test/`. Корпус обязан покрывать все 12 нормативных категорий.

## Execution contract

`@rus/shadow-run` запускает каждый case отдельным `node --test --test-concurrency=1` process. Shell не используется. Production provider и production DB не вызываются. Case получает только зафиксированные release fixtures и test adapters.

## Comparison contract

Художественные поля `prose`, `main_prose`, `openingText`, `text` могут отличаться. Игнорирование текста не распространяется на:

- schema и version;
- canonical IDs и references;
- audit pass/status/concerns;
- `no_new_world_facts`;
- hidden leak indicators;
- write targets и commit result;
- repair/error classification;
- UI read-model safety;
- idempotency keys/results;
- telemetry/stage completeness.

## Report contract

Artifact: `rus.shadow_run_report.v1`.

Отчёт содержит:

- totals по cases и tests;
- coverage по 12 категориям;
- статус каждого case;
- failed test names;
- blocking/non-blocking counts;
- recommendation: `go_to_staged_cutover` или `no_go`;
- обязательные cutover conditions.

## Decision policy

`go_to_staged_cutover` допустим только если:

1. все категории покрыты;
2. все cases прошли;
3. blocking differences = 0;
4. rollback case прошёл.

Инструмент не меняет feature flags и не удаляет legacy.
