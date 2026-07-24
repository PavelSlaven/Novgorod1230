# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

Active production continues to use v2 until atomic P28. The Temporal World v4
sequence below is target/shadow/migration-only and must not be combined with a
v2 write, authoritative read or fallback.

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `resolve_mode` — code-owned command registry фильтрует зарегистрированные команды; при нескольких допустимых вариантах LLM выбирает только `option_id` через bounded decision protocol.
3. `load_context` — читает состояние через `PartyStateReader`.
4. `availability` — зарегистрированный code handler проверяет доступность по загруженному состоянию.
5. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
6. `consequence` — зарегистрированный code handler вычисляет последствия либо возвращает repair request.
7. `time_update` — применяет утверждённую длительность к формуле времени.
8. `hidden_update` — код проецирует утверждённое consequence в hidden update.
9. `visible_projection` — строит visible context без hidden утечек.
10. `narration` — запускает approved narration flow.
11. `persistence_plan` — код строит и in-process запечатывает логический write plan из allowlist targets.
12. `commit` — party store принимает только запечатанный code-owned plan, сам отображает его в физические таблицы и сохраняет bounded-decision trace.
13. `screen_projection` — строит versioned `TurnScreen`.

## Результат

`runTurnWorkflow` возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Hidden state, provider payload и write plan не входят в screen.

## Ports

State reader, code-owned command registry, visible projector, narrator, party store, materializer, random source и screen projector передаются явно. Bounded decision executor, secret и expiry нужны только при неоднозначном закрытом наборе команд.

Reload/turn получает item/container catalog только из persisted
`party_catalog_pins` и exact historical import через `@rus/runtime-catalog`.
Для first-entry materialization persisted domain `catalog_digest` и canonical
`catalog_bundle_digest` проверяются отдельно; run pin записывается атомарно с
materialization run.
Текущий active event не читается. Отсутствующий pin возвращает
`PARTY_CATALOG_PIN_MISSING` без backfill и rematerialization.

## Границы

Код не придумывает смысловые категории и отсутствующие варианты. Он выбирает зарегистрированный handler, рассчитывает штатные последствия и формирует change set. LLM не возвращает mode/consequence/write targets; её допустимый структурированный ответ — только точный bounded-decision result. Неизвестная команда, stale state/policy, поддельный token или невалидный change set останавливают pipeline.

## Temporal World v4 target sequence

The complete target-only flow is specified in
[`temporal-advance.md`](temporal-advance.md).

`runTemporalAdvance` processes the exact `(from,to]` interval: it selects the
earliest eligible boundary, applies the continuous slice, and resolves the
fixed-order same-time cascade to a bounded deterministic fixed point.
`@rus/time-events-history` owns exact time and ordering; body, access,
environment, history, NPC, carriers and world-processes return only pinned,
pure proposals. `@rus/turn` merges those proposals deterministically and owns
the logical combined plan; `@rus/party-store` owns party persistence validation;
`apps/game-server` owns the physical PostgreSQL transaction.

The transaction atomically persists factual changes, the exact clock result,
effects, idempotency result and `VisiblePackagePersistenceEnvelope`. Only then
does the presentation path read that committed player-safe package and invoke
narration. Missing pins/candidates/rules, merge conflicts, cycles and explicit
limits fail closed with typed errors. A second place/access package is not
created: ADR-004 keeps that responsibility in turn orchestration and
party-store validation.
