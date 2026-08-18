# @rus/materialization

## Назначение

Детерминированный code-only materializer v2 и bounded decision protocol.

## Владеет

- versioned `mulberry32_v1` RandomSource и seed derivation;
- выбором из approved candidates и materialization trace;
- детерминированным completion `actor_base_appearance_v1` из approved
  demographic/appearance profile entries;
- проекцией G5 из approved profile/layout/slot rules и NPC/items из нормализованных eligible candidates;
- code-only item placement primitive, который Stage 16 использует для
  equipment candidate → NPC/player instance resolution;
- pure ordinary foundation helpers: density/budget policy, supporting-basis and
  prepared-group validation, stable refs, minimal aggregate transitions and
  server-only working-projection plumbing;
- signed command tokens и проверкой bounded decisions.

## Не делает

- не создаёт категории, templates, profiles, rules или исторические факты;
- не читает базы и не выполняет commit;
- не подмешивает equipment в scenario party result: этот handoff завершает
  общий Stage 16;
- не вызывает LLM.

## Публичный API

`materializeWorldInstances`, `materializeG5Scene`, `materializeNpcPlacement`, `materializeItemPlacement`, `materializeActorBaseAppearance`, RNG/digest helpers, bounded decision functions и pure ordinary foundation exports (`computeOrdinaryIdentityBudget`, basis/group validators, stable-ref helpers, minimal aggregate reducer/normalizer and working-projection helpers).

Ordinary foundation в этом PR остаётся shadow-only: API не вызывает LLM, не
читает БД, не выполняет commit и не активирует production O1 route. Он только
валидирует code-owned inputs и возвращает immutable logical state/projection.

`@rus/materialization/spatial-v3` is target-only P20: `createSpatialContextLoader`, `createSceneMaterializer`, `createFrontierTopologyResolver`, `createTargetPreparationService` and `createCrossDomainProposalComposer` return immutable proposals/snapshots and never commit or invoke v2. `createTopologyProposalValidator` remains the P08 fail-closed compatibility skeleton.

## Контракты

Принимает `world_materialization_request_v2` либо stage-specific approved bundle. Authoring candidates ссылаются на будущие экземпляры через однозначные `slot_key`, которые код разрешает после deterministic selection. Generic result содержит стартовую позицию и исполняемый, но не записанный materializer-ом `proposed_write_set` для нормализованных таблиц `party_runtime`. Profile/layout/slot/template refs, capacities, access, visibility, quantity, condition, legal status, causal basis и property policy обязательны; пропуск завершает операцию typed failure.

## Допустимые зависимости

`@rus/kernel` и стандартная библиотека Node.js.

## Запрещённые зависимости

Apps, DB drivers, provider SDK, UI, legacy и смысловые workflow packages.

## Инварианты

Одинаковые versioned inputs дают byte-equivalent output; каждый выбор входит в
trace; `Math.random` запрещён. Для runtime-catalog materialization
`trace.catalog_digest` сохраняет exact domain pin, а
`trace.catalog_bundle_digest` — digest конкретной immutable projection.
Explicit authored appearance сохраняется без draw; только отсутствующие поля
выбираются из approved/applicable entries, отсортированных по stable ID. Эти
draws идут после прежнего deterministic prefix, а пустой required facet
возвращает typed data gap. Applicability authored dependent-полей заранее
ограничивает prerequisite draws: например, authored `braided` требует
совместимую длину волос, а facial hair — совместимые sex/age. Противоречивый
authored набор отклоняется до первого RNG draw.

## Ошибки

`MaterializationError` с машиночитаемым code и immutable details.

## Тесты

Детерминизм, gaps, invalid candidates/tokens и bounded option membership.
