# @rus/travel

## Назначение

Чистый доменный модуль сохранённого путешествия партии. Он валидирует formal travel contracts и формирует детерминированные переходы `Journey`, `JourneyLeg` и `TravelPosition`.

## Границы

Модуль владеет lifecycle journey, actual/perceived navigation state и change-set proposal. Он не читает граф или БД, не вычисляет физическую проходимость ребра, не изменяет часы/тело/транспорт, не вызывает LLM или RNG и не формирует UI.

## Public API

- `validateTravelIntent`, `validateTravelPosition`, `validateJourney`
- `buildJourneyPlan`, `createJourney`, `advanceJourney`
- `interruptJourney`, `resumeJourney`, `changeJourneyPace`, `abandonJourney`, `completeJourney`
- `TravelError`

## Контракт и ошибки

Все функции принимают только формальный вход, возвращают новый deep-frozen результат и не изменяют вход. Ошибки имеют code из family `TRAVEL_*`; required candidate set без вариантов возвращает `TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY` и блокирует переход.

`TravelPosition` — discriminated union: `node` хранит `g4_id`, а `edge_progress` хранит journey/leg/edge и progress 0–1000. Скрытая actual position не предназначена для player-facing потребителей.

## Зависимости и проверки

Единственная зависимость — `@rus/kernel` для immutable output. Domain tests покрывают position union, lifecycle, optimistic version check, hard block, immutability и determinism.
