# @rus/perception

## Назначение

Pure code-only engine для распространения звука, line of sight, определения hearing/vision, переходов настороженности и маршрутизации реакции NPC по immutable sensory snapshot и approved profiles.

## Границы

Пакет не читает БД, не создаёт authoring facts, не вызывает LLM, не пишет состояние и не запускает workflow stages. `@rus/turn` передаёт ему snapshot и применяет возвращённый change set; `@rus/visibility-knowledge-memory` владеет player-facing проекцией.

## Public API

- `resolveSoundPaths`
- `resolveSoundPerception`
- `resolveVisibility`
- `evaluateAwareness`
- `routeNpcReaction`
- `PerceptionError`

## Контракты и ошибки

Входные/выходные schema names и validators принадлежат `@rus/contracts`. Отсутствующие profile, transition property или required option set вызывают `PerceptionError` и блокируют дальнейшее применение.

## Тесты

Проверяются minimum-loss путь, sound/vision blockers, monotonic attenuation, routine/no-reaction и bounded-reaction gate.

## История

- 0.1.0 — initial pure engine; integration, persistence и UI ещё не подключены.
