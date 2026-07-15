# @rus/travel

## Назначение

Чистый доменный модуль сохранённого путешествия партии. Он валидирует formal travel contracts и формирует детерминированные переходы `Journey`, `JourneyLeg` и `TravelPosition`.

## Границы

Модуль владеет lifecycle journey, actual/perceived navigation state и change-set proposal. Он не читает граф или БД, не вычисляет физическую проходимость ребра, не изменяет часы/тело/транспорт, не вызывает LLM или RNG и не формирует UI.

## Public API

- `validateTravelIntent`, `validateTravelPosition`, `validateJourney`, `validateTravelRulesBundle`
- `buildJourneyPlan`, `createJourney`, `advanceJourney`, `calculateNextTravelBoundary`, `buildTravelChangeSetProposal`
- `interruptJourney`, `campJourney`, `resumeJourney`, `changeJourneyPace`, `abandonJourney`, `completeJourney`
- `TravelError`

## Контракт и ошибки

Все функции принимают только формальный вход, возвращают новый deep-frozen результат и не изменяют вход. Ошибки имеют code из family `TRAVEL_*`; required candidate set без вариантов возвращает `TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY` и блокирует переход.

`advanceJourney` требует явный `progress_permille`; он не завершает leg по неявному значению. Полное завершение следует выражать через `completeJourney`.

`calculateNextTravelBoundary` выбирает только ближайший элемент из формально переданного непустого candidate set. Он не рассчитывает погоду, свет, тело, транспорт или события и не создаёт candidate сам.

`TravelPosition` — discriminated union: `node` хранит `g4_id`, а `edge_progress` хранит journey/leg/edge и progress 0–1000. Скрытая actual position не предназначена для player-facing потребителей.

`campJourney` переводит только существующее active edge-progress journey в `camped`; он не создаёт G2–G4, не материализует лагерь и не меняет фактическую позицию. Материализация допустимой travel scene и её атомарное сохранение остаются задачей оркестратора и persistence boundary.

`buildTravelChangeSetProposal` — чистый version-bound output для Stage 24/25: он описывает journey, legs и фактическую позицию, но не выполняет запись и не включает состояние среды, времени, тела или видимую проекцию.

`TravelRulesBundle` имеет schema version, catalog digest, world revision, region, period, source refs, normalized records/bindings и passed readiness report. Отсутствующий, stale или unready bundle возвращает `TRAVEL_RULE_BUNDLE_MISSING` либо `TRAVEL_DATA_GAP`.

## Зависимости и проверки

Единственная зависимость — `@rus/kernel` для immutable output. Domain tests покрывают position union, lifecycle, optimistic version check, hard block, immutability и determinism.
