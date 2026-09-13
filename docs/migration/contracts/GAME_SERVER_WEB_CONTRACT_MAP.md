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

`rus_api_error.error` допускает optional `turn_commit_status: "not_started"`:
Phase 2 workflow завершился отказом до входа commit owner. Exact overlapping
retries объединяются одной runtime promise в пределах server process;
same key/different input остаётся conflict. Replay/presentation failures и
ошибки после входа commit owner этот признак не получают. HTTP status или
публичный generic error code сами по себе не доказывают отсутствие commit.

## Explicit adapters

- `LlmRoleRunner` → `@rus/llm-runtime`;
- `WorldBaseReader` → `@rus/world-base`;
- `PartyStore`/state/delivery ports → `@rus/party-store` и supplied DB functions;
- new-game/turn workflow adapters → public package entrypoints.

## Browser boundary

`game-web` принимает только `first_game_screen v1` или `turn_screen v1`. Запрещены hidden/private fields, write/commit plans, raw audits, prompts и provider payloads. UI store хранит только UI status, текущий public screen, party id и display error.

Перед POST browser сохраняет `{party_id, request}` в `rus.pending_turn`.
Retry/reload/Continue повторяют точный unresolved request; успешный ответ,
`turn_commit_status: "not_started"` либо точный HTTP request validation failure
снимает pending. Transport/unknown/presentation failures сохраняют identity.
Новая осознанная попытка после завершения получает новый key, включая тот же
текст. Восстановление прежнего хода явно обозначено в UI и сохраняет новый draft.
