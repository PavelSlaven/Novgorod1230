# @rus/materialization

## Назначение

Детерминированный code-only materializer v2 и bounded decision protocol.

## Владеет

- versioned `mulberry32_v1` RandomSource и seed derivation;
- выбором из approved candidates и materialization trace;
- проекцией G5 из approved profile/layout/slot rules и NPC/items из нормализованных eligible candidates;
- signed command tokens и проверкой bounded decisions.

## Не делает

- не создаёт категории, templates, profiles, rules или исторические факты;
- не читает базы и не выполняет commit;
- не вызывает LLM.

## Публичный API

`materializeWorldInstances`, `materializeG5Scene`, `materializeNpcPlacement`, `materializeItemPlacement`, RNG/digest helpers и bounded decision functions.

`@rus/materialization/spatial-v3` is target-only P20: `createSpatialContextLoader`, `createSceneMaterializer`, `createFrontierTopologyResolver`, `createTargetPreparationService` and `createCrossDomainProposalComposer` return immutable proposals/snapshots and never commit or invoke v2. `createTopologyProposalValidator` remains the P08 fail-closed compatibility skeleton.

## Контракты

Принимает `world_materialization_request_v2` либо stage-specific approved bundle. Authoring candidates ссылаются на будущие экземпляры через однозначные `slot_key`, которые код разрешает после deterministic selection. Generic result содержит стартовую позицию и исполняемый, но не записанный materializer-ом `proposed_write_set` для нормализованных таблиц `party_runtime`. Profile/layout/slot/template refs, capacities, access, visibility, quantity, condition, legal status, causal basis и property policy обязательны; пропуск завершает операцию typed failure.

## Допустимые зависимости

`@rus/kernel` и стандартная библиотека Node.js.

## Запрещённые зависимости

Apps, DB drivers, provider SDK, UI, legacy и смысловые workflow packages.

## Инварианты

Одинаковые versioned inputs дают byte-equivalent output; каждый выбор входит в trace; `Math.random` запрещён.

## Ошибки

`MaterializationError` с машиночитаемым code и immutable details.

## Тесты

Детерминизм, gaps, invalid candidates/tokens и bounded option membership.
