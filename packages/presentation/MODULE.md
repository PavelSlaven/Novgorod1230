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

## Публичный API

Экспортирует screen/panel constructors, validators, schema constants и opening-delivery subpath.

## Инварианты

- публичный экран не содержит hidden/audit/source payloads;
- TurnScreen строится только из approved narration flow;
- FirstGameScreen принимает только успешный Stage 26 result;
- UI input contract всегда `intent_not_fact`;
- diagnostic panel разрешён только при явном developer mode и также не содержит hidden state.
