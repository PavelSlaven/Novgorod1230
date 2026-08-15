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
- существующим `renderLandscape(screen)` как единственным владельцем game
  landscape: он строит закрытую player-safe render model, детерминированную
  terrain geometry и гидратирует Canvas 2D после замены корневого DOM;
- процедурной композицией landscape + active interlocutor в существующем
  `renderSceneViewport`; при явном valid `portrait_spec_v1` используется
  renderer Portrait Lab с прозрачным background, иначе сохраняется SVG fallback;
- отдельной экспериментальной страницей `/portrait-lab`, direct-JSON input controller и Canvas 2D renderer без portrait-specific RNG/hash;
- скрытой portrait geometry/armature, scene-level visibility/occlusion для контуров, цветовых patches и лицевых деталей, а также единым stroke-first ink pass; приглушённые patches не владеют контурами и могут быть отключены через renderer option `fills: false`;
- semantic geometry branches, включая отдельную процедурную конструкцию косы для `hair.style: "braided"`;
- единым внутренним владельцем процедурной одежды `buildClothingGeometry(model, bodyGeometry)`: neckline, anchored arm/sleeve boundaries (либо armholes для sleeveless overlayer), outer construction, fabric-driven folds/texture и trim строятся от общих body anchors, а `body.torsoPatch` остаётся только envelope;
- `Portrait Drawing Contract v1`: anchors и допустимые области частей, единственный владелец каждой видимой границы, hard limits геометрии и общий handmade ink-pass.

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

Portrait Lab остаётся отдельным browser-инструментом и не участвует в
production actor/interlocutor path. Game-web принимает только готовый
player-safe `portrait_spec_v1` из server response, не выводит внешность из
имени, роли или prose и сохраняет прежний fallback для historical parties.

## Portrait Drawing Contract v1

- `Drawing Part` — самостоятельная часть портрета с собственными `Anchor` и `Allowed Region`;
- `Anchor` — точка или родительская область, к которой часть обязана быть присоединена;
- `Contour Owner` — единственная видимая часть, которой принадлежит итоговая граница crown, jaw или torso;
- `Hidden Geometry` исключается из итоговой scene, а не перекрывается полупрозрачной фигурой;
- Clothing-инварианты блокируют detached anchors, выход из torso envelope, trim без boundary, fold без tension source, конфликт torso owner и скрытый/перекрывающийся полный underlayer;
- `Control Sheet` — фиксированный набор разных детерминированных портретов только для человеческой проверки общего визуального языка.

## Инварианты

- любое поле hidden/private/write-plan/audit в public payload блокирует обновление UI;
- только app router заменяет корневой DOM;
- feature renderers являются чистыми функциями;
- пользовательский текст отправляется как intent, а не как факт мира.
- landscape использует только canonical `env.*` transition profile и
  `spatial.g3.*` category из закрытых allowlist; отсутствующее/неизвестное
  значение остаётся neutral, а label, prose и node ID не анализируются;
- weather/day/facts меняют только sky, palette и atmosphere: terrain, water,
  route, vegetation и buildings зависят только от exact place semantics и
  optional уже player-safe stable location ref;
- `cold`, `wet` и `exposed` остаются presentation modifiers и не создают снег,
  дождь, воду или новый landscape type;
- смена поля Portrait Specification не изменяет геометрию части, для которой это поле не является значимым;
- `main_color` и `secondary_color` меняют только appearance metadata одежды; silhouette, neckline, seams, folds и trim locations остаются идентичными;
- любая сцена Portrait Lab проходит универсальные геометрические инварианты; pairwise-набор покрывает каждую пару enum-значений, а фиксированный Control Sheet из 24 портретов служит только визуальным smoke-check.
