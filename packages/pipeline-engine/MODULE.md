# @rus/pipeline-engine

## Назначение

Универсальный исполнитель изолированных stage-графов и технический реестр артефактов pipeline.

## Владеет

- декларативным порядком stage execution;
- gate-result contract;
- artifact registry;
- остановкой pipeline при typed failure.

## Не делает

- не знает семантику конкретных stages;
- не вызывает LLM напрямую;
- не читает БД и не создаёт мир;
- не ремонтирует доменные данные самостоятельно.

## Публичный API

`ArtifactRegistry`, `createGateResult`, `runStageGraph`.

## Контракты

Каждый stage получает точный input, выполняется через переданный handler и возвращает утверждённый результат либо typed failure. По умолчанию approved artifacts сохраняются в `ArtifactRegistry`. Короткий workflow с собственным checkpoint может явно выбрать `transient: true`; тогда registry и digest-retention отсутствуют до завершения вызова.

## Допустимые зависимости

`@rus/contracts`, `@rus/kernel`.

## Запрещённые зависимости

Apps, legacy, provider SDK, БД, UI и конкретные domain modules.

## Инварианты

Pipeline lifecycle является единственным источником истины порядка выполнения; engine не мутирует скрытый глобальный context.

## Ошибки

Typed stage/gate failures и ошибки неверной конфигурации графа.

## Тесты

Foundation/module tests и orchestrator integration tests.

## Совместимость

Изменения lifecycle contract требуют обновления всех orchestration fixtures.
