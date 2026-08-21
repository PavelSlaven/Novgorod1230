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
  landscape: он выбирает одну из восьми авторских сцен по exact environment
  profile и одно из 36 независимых сочетаний времени и погоды, затем
  асинхронно гидратирует Canvas 2D;
- композицией landscape + active interlocutor в `renderSceneViewport`:
  безопасный `portrait_asset_id` выбирает один из семи авторских комплектов
  Нижней Двины (одежда/тело + сменная голова эмоции), а отсутствующий,
  неизвестный или повреждённый комплект целиком использует процедурный
  `portrait_spec_v1` fallback без смешивания двух систем;
- отдельным foreground Canvas для дождя, снега и тумана поверх собеседника;
- отдельной экспериментальной страницей `/portrait-lab`, direct-JSON input controller и детерминированным Canvas 2D renderer;
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
production actor/interlocutor path. Game-web принимает только готовые
player-safe `portrait_asset_id` и `portrait_spec_v1` из server response, не
выводит внешность из имени, роли или prose и сохраняет прежний процедурный
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
- environment profile выбирает только готовую композицию; время и погода
  выбирают точный авторский WebP `{time}-{weather}` без анализа prose/labels;
- неизвестный профиль или повреждённый asset использует
  `open_meadow/day-clear.webp`, а поздняя загрузка не рисует в сменившийся экран;
- светокоррекция портрета применяется только внутри его alpha, а foreground
  дождь, снег и туман не меняют игровой read model;
- смена поля Portrait Specification не изменяет геометрию части, для которой это поле не является значимым;
- `main_color` и `secondary_color` меняют только appearance metadata одежды; silhouette, neckline, seams, folds и trim locations остаются идентичными;
- любая сцена Portrait Lab проходит универсальные геометрические инварианты; pairwise-набор покрывает каждую пару enum-значений, а фиксированный Control Sheet из 24 портретов служит только визуальным smoke-check.
