# @rus/presentation

## Назначение

Единый владелец versioned player-facing read models и технического состояния доставки экранов.

## Владеет

- `FirstGameScreen`, approved-prose-only `TurnScreen` и отдельный degraded `FactualTurnDeliveryScreen` version 1
- Character, Inventory, People, Route, Map, Journal и Diagnostic panels;
- optional exact `portrait_spec_v1` внутри player-safe active interlocutor;
- additive presentation data in versioned read models: presentation carries it
  and validates only panel/read-model shapes it owns. In People,
  `active_interlocutor.portrait_asset_id` is an optional non-empty string;
  presentation does not select assets, read positions or infer identity;
- visible-only validation и leak rejection;
- ordered `TurnScreen.checks` с уже вычисленными player-safe d20, DC,
  modifiers, total и outcome; arithmetic остаётся у `@rus/checks-rng`;
- compatibility `createPublicViewModel`;
- first-screen delivery attempt, acknowledgement и Stage 27 intent handoff.

## Не делает

- не создаёт мир и последствия;
- не пишет narrator prose;
- не читает hidden state или БД;
- не выполняет provider calls;
- не интерпретирует намерение игрока.

## Spatial v3 production boundary

P08 assigns presentation/knowledge only player-safe projection. Historical P28
evidence did not change composition; the later `versioned production activation
cutover` release `spatial-v3-production-v1` made v3 the sole production route.
This module never creates factual topology or resolves an endpoint.

P22 adds the explicit `@rus/presentation/spatial-v3-projection` entrypoint. It
resolves only supplied explicit perception relations, projects knowledge
beliefs and derives player-safe map/route panels for the existing game-web
renderer. It does not read persistence, derive topology from coordinates,
write beliefs, or alter the P08 fail-closed port boundary.

`projectSpatialV3NaturalScene` composes the existing P22 visibility/acoustic
resolvers over exact actor position, committed G6/position/acoustic rows, explicit
conditions and source positions. Natural descriptions come only from an approved
presentation profile bound to the exact natural profile version and payload digest.
Machine class names, resource stocks and rights are never projected. Missing
bindings return `NATURAL_SCENE_PERCEPTION_DATA_GAP`; darkness, occlusion and
acoustic loss filter descriptions, with partial perception using only an authored
partial description. The detached visible context can feed opening or arrival;
this pure projection creates no world state and performs no writes or model calls.

## Публичный API

Экспортирует screen/panel constructors, validators, schema constants и opening-delivery subpath.

## Инварианты

- публичный экран не содержит hidden/audit/source payloads;
- TurnScreen строится только из approved narration flow;
- `FactualTurnDeliveryScreen v1` строится только из уже validated committed
  public projection после terminal narration-policy rejection. Это degraded
  availability recovery, а не approved narration и не quality PASS. Его exact fields:
  `version`, `schema`, `screen_status`, `party_id`, `turn_id`, `turn_number`,
  `package_id`, `committed_state_version`, `presentation_quality`,
  `visible_context`, `visible_changes`, `uncertainties`, `panels`, `input_panel`.
  Полный scenario carrier (`scenario_id`, `screen_kind`, `action_panel`,
  `actions`, `checks`, `delivery_state`, `opening_screen_digest`,
  `current_projection_anchor`, `presentation_context`, optional
  `scene_asset_id` and `combat_state`) допускается только целиком и строго
  validated; common terminal consumer от него не зависит.
  Он не принимает `main_prose`, `prose`, narration output, digest, audit,
  provider/retry diagnostics, raw package или private data;
- `TurnScreen.checks` не содержит `check_id`, RNG audit/seed, policy refs или
  скрытые NPC checks; порядок задаёт server projection из committed result;
- FirstGameScreen принимает только успешный Stage 26 result;
- UI input contract всегда `intent_not_fact`;
- diagnostic panel разрешён только при явном developer mode и также не содержит hidden state.
- active interlocutor appearance, если передан, проходит общий строгий
  `portrait_spec_v1` validator; свободные appearance-поля запрещены.
- Presentation does not validate top-level `scene_asset_id` shape or own an
  exact scene catalog. The game-web public validator owns both its exact
  authored eight-value scene catalog and top-level `scene_asset_id` validation.
- `portrait_asset_id` is an optional non-empty string in the People panel;
  presentation leaves an unknown ID to browser fallback policy.
- Эти selectors не являются persisted world state, visibility/knowledge write,
  source/evidence или обратным каналом из art в factual truth.
