# @rus/world-processes

## Назначение

`@rus/world-processes` — active-norm, target-only Temporal World v4 owner pure
remote catch-up и propagation proposals. Historical P28 evidence не
активировало runtime. До отдельного `versioned production activation cutover`
результаты предназначены для shadow/fixtures/migration и не меняют production
v2.

## Владеет

- bounded deterministic advancement supplied remote process aggregate до supplied activation timestamp;
- coarse process boundaries, termination и next boundary;
- разделением factual и player-visible proposal output.

## Не владеет

Не композирует NPC, environment, route или persistence logic, не изобретает event/target/schedule/catch-up result и не владеет turn orchestration.

## Public API

- `createWorldProcessEngine(configuration)` — создаёт frozen engine из approved sealed process profiles и explicit safety limits.
- `engine.catchUp(request)` — принимает formal `remote_catch_up_request`, возвращает formal frozen `remote_catch_up_result` с aggregate state, `proposed_change_set`, applied processes и deferred work refs.

## Формальные контракты

Configuration принимает approved profiles с pins; request содержит sealed aggregate, incoming process refs, exact activation timestamp, matching exact elapsed interval, rule pins и idempotency key. `catchUp` не изменяет request: объединяет уникальные process/idempotency identities, применяет coarse intervals/max lifetime до activation, детерминированно сортирует factual entries и повышает `state_version` только при изменении state. Mandatory resource limits `max_processes` и `max_boundaries` делают execution bounded. Неформальный request — technical `TypeError`; formal domain failure возвращает blocked result.

## Typed errors и gaps

Blocked result содержит typed code в trace: `time_window_invalid`, `propagation_rule_gap` либо `remote_catch_up_rule_gap`. Они покрывают mismatch exact elapsed, invalid digest/lifecycle/profile/pin/path, duplicate process identity, unresolved propagation и resource exhaustion. Отсутствующий required candidate/profile/pin не получает fallback; агрегат сохраняется неизменным.

## Зависимости, IO и persistence

Разрешены `@rus/kernel`, `@rus/contracts` и `@rus/time-events-history` для pure exact temporal arithmetic. Нет DB, network, LLM, narration, UI, global state, direct calls к другим runtime owners или иных side effects. Пакет не пишет SQL и не commit-ит change set: только `@rus/turn` валидирует/submit-ит approved output через `CombinedAtomicCommitter` и `@rus/party-store` является persistence boundary.

## Activation и тесты

До versioned production activation cutover proposals не имеют production
effect; rollback отбрасывает uncommitted result. Cutover допускает activation
только одной атомарной поставкой, без dual writers, partial fallback или
reinterpretation committed history through v2. Tests:
`test/world-processes.test.js` проверяет huge rational exact interval,
deterministic retry/state version/termination, immutable blocked aggregate and
player-visible handoff, all registered process kinds, pending/corrupt
lifecycle, full pins и explicit optional path pinning.
