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
- отдельной экспериментальной страницей `/portrait-lab`, direct-JSON input controller и детерминированным Canvas 2D renderer;
- скрытой portrait geometry/armature, scene-level visibility/occlusion для контуров, цветовых patches и лицевых деталей, а также единым stroke-first ink pass; приглушённые patches не владеют контурами и могут быть отключены через renderer option `fills: false`;
- внутренними детерминированными вариантами рисунка, включая отдельную процедурную конструкцию косы для `hair.style: "braided"`;
- `Portrait Drawing Contract v1`: anchors и допустимые области частей, единственный владелец каждой видимой границы, hard limits геометрии, scoped seed каждой части и общий handmade ink-pass.

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

Portrait Lab остаётся отдельным browser-инструментом и не добавляет портреты в игровые read models или NPC runtime.

## Portrait Drawing Contract v1

- `Drawing Part` — самостоятельная часть портрета с собственными `Anchor` и `Allowed Region`;
- `Anchor` — точка или родительская область, к которой часть обязана быть присоединена;
- `Contour Owner` — единственная видимая часть, которой принадлежит итоговая граница crown, jaw или torso;
- `Hidden Geometry` исключается из итоговой scene, а не перекрывается полупрозрачной фигурой;
- `Control Sheet` — фиксированный набор разных детерминированных портретов только для человеческой проверки общего визуального языка.

## Инварианты

- любое поле hidden/private/write-plan/audit в public payload блокирует обновление UI;
- только app router заменяет корневой DOM;
- feature renderers являются чистыми функциями;
- пользовательский текст отправляется как intent, а не как факт мира.
- смена поля Portrait Specification не изменяет геометрию части, для которой это поле не является значимым;
- любая сцена Portrait Lab проходит универсальные геометрические инварианты; pairwise-набор покрывает каждую пару enum-значений, а фиксированный Control Sheet из 24 портретов служит только визуальным smoke-check.
