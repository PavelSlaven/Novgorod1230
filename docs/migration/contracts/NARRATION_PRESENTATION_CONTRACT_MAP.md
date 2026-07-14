# Карта контрактов Narration и Presentation

## Narration

| Контракт | Владелец | Назначение |
|---|---|---|
| `narration_request` | `@rus/narration` | visible-only вход writer-а для `first_game` или `turn` |
| `narration_output` | `@rus/narration` | draft/approved prose, action options, refs и self-check |
| `narration_audit` | `@rus/narration` | independent semantic decision с concerns и evidence |
| `narration_repair_route` | `@rus/narration` | explicit format/semantic/upstream/block routing |
| `narration_flow_result` | `@rus/narration` | approved, repair_required или blocked handoff |
| `narration_upstream_repair_request` | `@rus/narration` | возврат в visible/upstream workflow без prose fallback |

## Presentation

| Read model | Владелец | Источник |
|---|---|---|
| `first_game_screen` v1 | `@rus/presentation` | successful Stage 26 result |
| `turn_screen` v1 | `@rus/presentation` | approved narration flow + visible context + actions |
| `presentation_panel` / character | `@rus/presentation` | public character projection |
| `presentation_panel` / inventory | `@rus/presentation` | public inventory projection |
| `presentation_panel` / people | `@rus/presentation` | public people projection |
| `presentation_panel` / route | `@rus/presentation` | known route projection |
| `presentation_panel` / map | `@rus/presentation` | visible/known map projection |
| `presentation_panel` / journal | `@rus/presentation` | public knowledge/memory projection |
| `presentation_panel` / diagnostic | `@rus/presentation` | developer-only, hidden-free diagnostics |

## Handoffs

```text
new-game Stage 22 + Stage 23
  -> adaptApprovedOpeningNarration
  -> narration_flow_result(first_game)

new-game Stage 26
  -> createFirstGameScreenReadModel
  -> first_game_screen v1

turn visible_projection
  -> @rus/narration.runNarrationFlow
  -> approved narration_flow_result
  -> @rus/presentation.createTurnScreenReadModel
  -> turn_screen v1
```

## Запрещённые связи

- narration → DB, provider SDK, UI, legacy;
- presentation → narration implementation, DB, provider SDK, legacy;
- turn → внутренние файлы narration/presentation;
- public screen → hidden state, raw audit, source dossier или raw provider response.
