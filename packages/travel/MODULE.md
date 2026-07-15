# @rus/travel

## Назначение

Чистый доменный модуль сохранённого путешествия партии. Он валидирует formal travel contracts и формирует детерминированные переходы `Journey`, `JourneyLeg` и `TravelPosition`.

## Границы

Модуль владеет lifecycle journey, actual/perceived navigation state и change-set proposal. Он не читает граф или БД, не вычисляет физическую проходимость ребра, не изменяет часы/тело/транспорт, не вызывает LLM или RNG и не формирует UI.

## Public API

- `validateTravelIntent`, `validateTravelPosition`, `validateJourney`, `validateTravelRulesBundle`, `validateTravelAdvanceRequest`, `validateTravelInterruption`, `resolveCourseEdgeCandidate`
- `buildJourneyPlan`, `createJourney`, `advanceJourney`, `applyTravelLifecycleMetadata`, `calculateNextTravelBoundary`, `buildTravelChangeSetProposal`, `buildTravelAdvanceResult`, `buildTravelArrivalRequest`
- `interruptJourney`, `campJourney`, `resumeJourney`, `changeJourneyPace`, `rerouteJourney`, `abandonJourney`, `completeJourney`
- `TravelError`

## Контракт и ошибки

Все функции принимают только формальный вход, возвращают новый deep-frozen результат и не изменяют вход. Ошибки имеют code из family `TRAVEL_*`; required candidate set без вариантов возвращает `TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY` и блокирует переход.

`advanceJourney` требует явный `progress_permille`; он не завершает leg по неявному значению. Полное завершение следует выражать через `completeJourney`.

`calculateNextTravelBoundary` выбирает только ближайший элемент из формально переданного непустого candidate set. Он не рассчитывает погоду, свет, тело, транспорт или события и не создаёт candidate сам.

`TravelPosition` — discriminated union: `node` хранит `g4_id`, а `edge_progress` хранит journey/leg/edge и progress 0–1000. Скрытая actual position не предназначена для player-facing потребителей.

`campJourney` переводит только существующее active edge-progress journey в `camped`; он не создаёт G2–G4, не материализует лагерь и не меняет фактическую позицию. Материализация допустимой travel scene и её атомарное сохранение остаются задачей оркестратора и persistence boundary.

`rerouteJourney` принимает только replacement `JourneyPlan`, который сохраняет journey identity и все version pins. Он работает лишь при `progress_permille=0`, supersedes незапущенные legs и не выбирает route/edge сам.

`buildTravelChangeSetProposal` — чистый version-bound output для Stage 24/25: он описывает journey, legs и фактическую позицию, но не выполняет запись и не включает состояние среды, времени, тела или видимую проекцию.

`buildTravelArrivalRequest` создаёт `travel-arrival-request.v1` только при завершении последнего canonical leg. Он связывает party, journey, origin/destination и version pins, но не читает baseline G4, не решает, нужна ли materialization, и не выполняет commit. Turn workflow передаёт его как formal `position_transition` в единственный atomic first-entry gate.

`TravelAdvanceRequest` связывает journey, current leg, expected state version, selected boundary, duration и idempotency key. `buildTravelAdvanceResult` возвращает immutable journey/leg/position proposal, request владельцу clock и, только при arrival, `TravelArrivalRequest`; он не обновляет clock, body, transport или environment.

`TravelInterruption` допускает только заранее переданный causal source из закрытого набора weather/light/body/transport/route/timer/NPC/checkpoint/signal/trace/player-command/arrival. Модуль не выбирает источник и не создаёт дорожное событие.

`resolveCourseEdgeCandidate` принимает только закрытый candidate set существующих fact-graph edges с explicit origin/direction applicability и возвращает выбранный stable candidate ID. Пустой, неоднозначный или неприменимый set блокируется; функция не ищет граф и не выбирает направление сама.

Новый `JourneyPlan` содержит явные `movement_method`, `started_at`, `updated_at` и положительный `base_time_minutes` каждого leg. `applyTravelLifecycleMetadata` принимает duration и timestamp только от владельца времени и переносит их в journey/legs; он не читает часы и не создаёт время сам.

`TravelRulesBundle` имеет schema version, catalog digest, world revision, region, period, source refs, normalized records/bindings и passed readiness report. Отсутствующий, stale или unready bundle возвращает `TRAVEL_RULE_BUNDLE_MISSING` либо `TRAVEL_DATA_GAP`.

## Зависимости и проверки

Единственная зависимость — `@rus/kernel` для immutable output. Domain tests покрывают position union, lifecycle, optimistic version check, hard block, immutability и determinism.
