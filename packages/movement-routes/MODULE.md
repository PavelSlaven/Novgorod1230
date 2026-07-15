# @rus/movement-routes

## Назначение

Чистый evaluator физического прохождения единственного канонического route edge. Он проверяет входной snapshot, доступность и profile-derived длительность, но не выбирает цель, не меняет позицию и не выполняет проверку персонажа.

## Public API

- `validateRouteTraversalInput`
- `assessRouteAvailability`
- `calculateTravelTime`
- `calculatePartialTraversal`
- `buildTraversalRequest`
- `validateTraversalResult`
- `MovementRouteError`

## Fail-closed contract

Вход обязан содержать canonical edge с `scale`, route-profile binding и base time/GU; актуальный load category; profile snapshot с применимыми condition/load/pace multipliers; и concrete compatible transport instance, когда он требуется ребру. Отсутствующие или неизвестные данные не получают defaults и возвращают typed `ROUTE_*` error.

Булевы поля наподобие `has_boat` и `requires_boat` не являются допустимым контрактом транспорта. Evaluator принимает только instance refs с category, condition, position и route compatibility.

## Запреты и зависимости

Модуль зависит только от `@rus/kernel` для immutable output. Он не читает graph storage или DB, не бросает RNG, не вызывает LLM, не формирует hidden/visible projection и не пишет party state.
