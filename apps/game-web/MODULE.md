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
- компактным UI-only LLM settings overlay: browser вызывает только game-server
  `/api/v1/llm-settings`; API key передаётся в Apply/Test и не сохраняется в
  browser storage, а mode/base URL/model остаются UI preferences.
- существующим `renderLandscape(screen)` как единственным владельцем game
  landscape: он строит закрытую player-safe render model и гидратирует Canvas
  2D после замены корневого DOM;
- selection landscape: известный exact `scene_asset_id` выбирает exact
  authored scene; иначе supported `environment.profile_id` выбирает generic
  authored scene; иначе, либо при ошибке загрузки asset, Canvas использует
  procedural geometry. Unknown exact selector не отключает generic selection
  и не меняет world/UI facts;
- процедурной композицией landscape + active interlocutor в существующем
  `renderSceneViewport`; active interlocutor получает additive player-safe
  `portrait_asset_id` вместе с optional `portrait_spec_v1`. Известный browser
  asset выбирает authored portrait; неизвестный сохраняет DTO compatibility и
  идёт в procedural/SVG fallback по `AUTHORED_PORTRAIT_CONTRACT.md`;
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
player-safe `portrait_asset_id` и optional `portrait_spec_v1` из server
response, не выводит внешность из имени, роли или prose и сохраняет прежний
fallback для historical parties.

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
- authored landscape выбирается сначала по exact `scene_asset_id`, затем по
  supported `environment.profile_id`; не по prose, label, location/node ID или
  client inference. Selectors — необязательные presentation hints и не являются
  обратной записью в truth;
- в procedural landscape weather/day/facts меняют только sky, palette и
  atmosphere: terrain, water, route, vegetation и buildings зависят только от
  exact place semantics и optional уже player-safe stable location ref;
- для authored asset selectors day/weather могут выбирать приблизительные
  декоративные bitmap-детали. Artwork не является authoritative truth и не
  допускает обратного вывода world facts; procedural geometry остаётся
  fallback, если selection или загрузка asset не дали изображения;
- `cold`, `wet` и `exposed` остаются presentation modifiers и не создают снег,
  дождь, воду или новый landscape type;
- смена поля Portrait Specification не изменяет геометрию части, для которой это поле не является значимым;
- `main_color` и `secondary_color` меняют только appearance metadata одежды; silhouette, neckline, seams, folds и trim locations остаются идентичными;
- любая сцена Portrait Lab проходит универсальные геометрические инварианты; pairwise-набор покрывает каждую пару enum-значений, а фиксированный Control Sheet из 24 портретов служит только визуальным smoke-check.
- Canvas hydration имеет generation token на root: устаревшая async загрузка не
  рисует поверх нового screen. Порядок слоёв: landscape, portrait, foreground
  weather; static assets загружаются только с разрешённых `/assets/` paths.
