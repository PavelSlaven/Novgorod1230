# Карта контрактов Game server и Game web

## Server composition

| Surface | Вход | Выход |
|---|---|---|
| `startNewGame` | `new_game_http_input` | `FirstGameScreen v1` + public delivery metadata |
| `acknowledgeOpening` | `client_ack_id` | public acknowledgement result |
| `submitTurn` | free text или approved action option | `TurnScreen v1` + public turn summary |
| `getPartyScreen` | `party_id` | текущий public screen |

## HTTP `/api/v1`

- `GET /health`
- `POST /new-games`
- `GET /parties/:partyId/screen`
- `POST /parties/:partyId/opening-ack`
- `POST /parties/:partyId/turns`

Все успешные ответы: `rus_api_success v1`. Все ошибки: `rus_api_error v1`.

## Explicit adapters

- `LlmRoleRunner` → `@rus/llm-runtime`;
- `WorldBaseReader` → `@rus/world-base`;
- `PartyStore`/state/delivery ports → `@rus/party-store` и supplied DB functions;
- new-game/turn workflow adapters → public package entrypoints.

## Browser boundary

`game-web` принимает только `first_game_screen v1` или `turn_screen v1`. Запрещены hidden/private fields, write/commit plans, raw audits, prompts и provider payloads. UI store хранит только UI status, текущий public screen, party id и display error.
