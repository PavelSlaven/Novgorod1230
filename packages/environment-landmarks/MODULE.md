# @rus/environment-landmarks

## Назначение

Детерминированно материализует постоянные природные ориентиры, временные сигналы и следы среды из утверждённого каталога. Модуль не создаёт G0–G4, не пишет в БД и не принимает решения за LLM.

## Public API

- `initializeEnvironmentFeatures`
- `updateEnvironmentFeatures`
- `buildEnvironmentObservationCandidates`
- `validateEnvironmentCatalogBundle`
- `validateEnvironmentFeatureState`

## Инварианты

- baseline уникален по `party_id`, `world_revision_id`, `g1_id`, `materializer_version`;
- baseline materialization создаёт только persistent landmarks; cue/trace lifecycle запускается только явным `updateEnvironmentFeatures`;
- catalog bundle имеет обязательные digest, world revision, region, period и regional permission; несоответствие является hard block;
- state version и idempotency key обязательны для lifecycle update; stale update блокируется, а повтор ключа возвращает неизменённый replay;
- cue lifecycle не назначает intensity, recognition, navigation или durations по умолчанию: approved template обязан задавать их явно;
- trace lifecycle не назначает recognition/navigation или пороги и коэффициенты decay по умолчанию: approved template и decay profile обязаны задавать их явно;
- required candidate set блокирует материализацию;
- cue содержит причинный источник, trace — источник и event;
- публичные observation candidates не содержат source ID или location binding;
- входы не изменяются; результат и его состояние immutable.

## Зависимости

Только `@rus/kernel` и публичные deterministic механизмы `@rus/materialization`. Запрещены БД, LLM, UI, глобальное время и собственный RNG.

## Тесты

`test/domain.test.js` покрывает repeat-entry, запрет неявного lifecycle при baseline, скрытый источник дыма и жизненный цикл колеи.
