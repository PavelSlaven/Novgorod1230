# @rus/presentation

## Назначение

Единый владелец versioned player-facing read models и технического состояния доставки экранов.

## Владеет

- `FirstGameScreen` и `TurnScreen` version 1;
- Character, Inventory, People, Route, Map, Journal и Diagnostic panels;
- optional exact `portrait_spec_v1` внутри player-safe active interlocutor;
- visible-only validation и leak rejection;
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

## Публичный API

Экспортирует screen/panel constructors, validators, schema constants и opening-delivery subpath.

## Инварианты

- публичный экран не содержит hidden/audit/source payloads;
- TurnScreen строится только из approved narration flow;
- FirstGameScreen принимает только успешный Stage 26 result;
- UI input contract всегда `intent_not_fact`;
- diagnostic panel разрешён только при явном developer mode и также не содержит hidden state.
- active interlocutor appearance, если передан, проходит общий строгий
  `portrait_spec_v1` validator; свободные appearance-поля запрещены.
