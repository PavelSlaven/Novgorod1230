# @rus/shadow-run

## Назначение

Автономный migration-tool для двойного запуска утверждённого corpus старого и модульного маршрутов. Инструмент исполняет только явно зарегистрированные parity/isolation tests, агрегирует структурные категории сравнения и выпускает machine-readable и Markdown отчёты.

## Что модуль владеет

- контрактом `rus.shadow_corpus.v1`;
- контрактом `rus.shadow_run_report.v1`;
- запуском allowlisted test cases без shell-интерполяции;
- классификацией blocking/non-blocking расхождений;
- cutover recommendation на основании полного покрытия обязательных категорий.

## Что модуль не делает

- не вызывает production LLM provider;
- не читает и не изменяет production БД;
- не импортируется game runtime;
- не сравнивает художественную прозу посимвольно;
- не исправляет обнаруженные расхождения автоматически;
- не переключает feature flags.

## Public API

- `loadShadowManifest`
- `validateShadowManifest`
- `parseTapSummary`
- `runShadowCorpus`
- `buildShadowReport`
- `renderShadowReportMarkdown`
- `compareStructuralObservations`

## Входные и выходные контракты

Вход — versioned manifest с allowlisted test files, категориями сравнения и provenance. Выход — `rus.shadow_run_report.v1`, где каждое расхождение связано с case id, категорией и severity.

## Инварианты

Все 12 нормативных категорий обязаны быть покрыты corpus. Test path должен находиться внутри `test/`. Любой failed parity/isolation case является blocking. Prose fields могут игнорироваться только при сохранении schema, audits, references, hidden-boundary и `no_new_world_facts` invariants.

## Ошибки

Manifest validation и execution failures возвращаются как typed error codes: `SHADOW_MANIFEST_INVALID`, `SHADOW_CASE_PATH_INVALID`, `SHADOW_CASE_EXECUTION_FAILED`.

## Тесты и совместимость

Unit tests проверяют manifest coverage, TAP parsing, structural comparison и recommendation policy. Compatibility обеспечивается schema versioning; неизвестная schema блокирует запуск.
