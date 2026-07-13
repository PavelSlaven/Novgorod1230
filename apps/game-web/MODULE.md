# @rus/game-web

## Назначение

Browser-клиент, который получает только versioned public read models от `@rus/game-server` и отображает их без вычисления игровых последствий.

## Владеет

- HTTP API client `/api/v1`;
- валидацией публичных API envelopes и screen contracts;
- UI-only store;
- маршрутизацией FirstGameScreen/TurnScreen;
- feature renderers для прозы, персонажа, инвентаря, людей, маршрутов, карты, журнала, действий и diagnostics;
- browser bootstrap и обработкой пользовательских намерений.

## Не делает

- не читает party/world БД;
- не импортирует server, workflow, domain или provider modules;
- не вычисляет проверки, последствия, время или write plans;
- не хранит копию party state;
- не принимает hidden fields.

## Public API

- `createApiClient`
- `validateApiEnvelope`
- `validatePublicScreen`
- `createUiStore`
- `renderScreen`
- `bootstrapGameWeb`

## Инварианты

- любое поле hidden/private/write-plan/audit в public payload блокирует обновление UI;
- только app router заменяет корневой DOM;
- feature renderers являются чистыми функциями;
- пользовательский текст отправляется как intent, а не как факт мира.
