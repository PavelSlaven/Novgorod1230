# @rus/time-events-history

## Назначение

Единственный domain owner target Temporal World v4 для exact `GameTimestamp`, `ElapsedTime`, rational-minute arithmetic, календарной проекции и выбора/разрешения temporal boundaries. Модуль чистый: работает только с переданными DTO и утверждёнными profile/rule inputs.

## Владеет

- Владеет canonical temporal digest, нормализацией и сравнением exact time, crossing whole-minute boundaries, `projectCalendar`, историческими phase handlers и `temporal-resolution-v1` (`normalizeTemporalBoundaryCandidates`, earliest batch, same-time cascade).

## Не владеет

Не владеет duration/factor/delay formula маршрута, body/NPC/environment effects, orchestration, write-plan merge, PostgreSQL, narration и visible projection. Не изобретает events, dates, profiles или effect rules.

## Public API

- `.`: exact-time primitives `normalizeGameTimestamp`, `normalizeElapsedTime`, rational arithmetic, `addElapsedTime`, `subtractGameTimestamp`, `compareGameTimestamp`, `countCrossedWholeMinuteBoundaries`, `computeTemporalDigest`; historical-phase exports.
- `./calendar`: `projectCalendar(timestamp, approvedProfile)`.
- `./temporal-boundaries`: `TEMPORAL_RESOLUTION_POLICY_VERSION`, order, `TemporalBoundaryError`, normalization, earliest-batch selection и `resolveSameTimeCascade`.
- `./legacy`: compatibility-only clock/timer helpers; не является target temporal execution API.

## Формальные входы, выходы и ошибки

Входы — closed JSON-safe DTO: canonical decimal strings, rational minutes, exact timestamps, approved calendar/phase/boundary policies и явные callbacks для same-time resolution. Выходы — frozen canonical DTO, ordered boundary batch/cascade result либо typed error. Ошибки валидации времени — `RangeError`/`TypeError`; calendar profile выдаёт `time_calendar_profile_gap`; boundary errors — `TemporalBoundaryError` с temporal code (в том числе `temporal_boundary_ambiguous`, `temporal_boundary_cycle`, `temporal_candidate_stale`). Никакого fallback, округления или hidden read.

## Зависимости и side effects

Зависит только от `@rus/kernel` и `@rus/contracts`; не имеет I/O, DB, network, LLM или persistence boundary. Результат передаётся `@rus/turn` и persistence owner, которые не пересчитывают temporal arithmetic.

## Target / activation

Temporal World v4 base — immutable `temporal-world-v1` /
`4.3.0-target.1`; current additive handoff contract set —
`temporal-world-v1.1` / `4.4.0-target.1`. Historical P28 evidence не
активировало runtime; до
отдельного `versioned production activation cutover` production v2 остаётся
sole runtime owner. Модуль не активирует target и не делает dual write.

## Тесты

`test/exact-time.test.js`, `calendar.test.js`, `temporal-boundaries.test.js`, `historical-phases.test.js`, `domain.test.js` проверяют exact arithmetic, profile gaps, ordering/cascades, phase boundary и legacy-compatible pure helpers.
