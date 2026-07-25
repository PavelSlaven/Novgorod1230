# @rus/presentation

## Назначение

Единый владелец versioned player-facing read models и технического состояния доставки экранов.

## Владеет

- `FirstGameScreen` и `TurnScreen` version 1;
- Character, Inventory, People, Route, Map, Journal и Diagnostic panels;
- visible-only validation и leak rejection;
- compatibility `createPublicViewModel`;
- first-screen delivery attempt, acknowledgement и Stage 27 intent handoff.

## Не делает

- не создаёт мир и последствия;
- не пишет narrator prose;
- не читает hidden state или БД;
- не выполняет provider calls;
- не интерпретирует намерение игрока.

## Spatial v3 target boundary

P08 assigns presentation/knowledge only player-safe projection. This module never creates factual topology, resolves an endpoint, or invokes a target spatial port before the `versioned production activation cutover`.

P22 adds the explicit `@rus/presentation/spatial-v3-projection` target-only entrypoint. It resolves only supplied explicit perception relations, projects knowledge beliefs and derives player-safe map/route panels for the existing game-web renderer. It does not read persistence, derive topology from coordinates, write beliefs, or alter the P08 fail-closed port boundary.

## Публичный API

Экспортирует screen/panel constructors, validators, schema constants и opening-delivery subpath.

## Инварианты

- публичный экран не содержит hidden/audit/source payloads;
- TurnScreen строится только из approved narration flow;
- FirstGameScreen принимает только успешный Stage 26 result;
- UI input contract всегда `intent_not_fact`;
- diagnostic panel разрешён только при явном developer mode и также не содержит hidden state.
