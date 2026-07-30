# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

Accepted historical P28 evidence changed no production composition. Active
production continues to use v2 until the separate `versioned production
activation cutover`. The Temporal World v4 sequence below is
target/shadow/migration-only and must not be combined with a v2 write,
authoritative read or fallback.

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `load_context` — читает committed state через `PartyStateReader`.
3. `available_actions` — строит полный закрытый player-safe набор доступных действий без raw text.
4. `resolve_mode` — exact fast path либо bounded semantic resolver возвращает только точный `option_id` или typed unknown.
5. `revalidate_context` — повторно читает committed state, перестраивает набор и отклоняет stale state/option до RNG.
6. `availability` — зарегистрированный code handler повторно проверяет доступность выбранного действия.
7. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
8. `consequence` — зарегистрированный code handler вычисляет последствия либо возвращает repair request.
9. `time_update` — применяет утверждённую длительность через владельца времени.
10. `body_update` — применяет утверждённый body-effect к revalidated state.
11. `hidden_update` — код применяет утверждённое consequence к immutable candidate post-change state.
12. `visible_projection` — code-owned projection и security gate строят player-safe candidate.
13. `persistence_plan` — код строит и in-process запечатывает логический write plan из allowlist targets.
14. `commit` — game-server одной PostgreSQL-транзакцией сохраняет facts, visible package и pending metadata.
15. `persisted_visible_projection` — повторно читает уже committed player-safe package.
16. `narration` — получает только persisted package и создаёт prose, но не facts.
17. `screen_projection` — строит versioned `TurnScreen` из persisted package и narration.

## Результат

`runTurnWorkflow` возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Hidden state, provider payload и write plan не входят в screen.

## Ports

State reader, code-owned command registry, visible projector, narrator, party store, materializer, random source и screen projector передаются явно. Для semantic resolver нужны exact decision identity, secret и expiry; после его ответа state reader вызывается повторно до RNG.

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
