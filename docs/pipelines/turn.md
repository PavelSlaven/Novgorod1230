# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `resolve_mode` — code-owned command registry фильтрует зарегистрированные команды; при нескольких допустимых вариантах LLM выбирает только `option_id` через bounded decision protocol.
3. `load_context` — читает состояние через `PartyStateReader`.
4. `availability` — зарегистрированный code handler проверяет доступность по загруженному состоянию.
5. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
6. `consequence` — зарегистрированный code handler вычисляет последствия либо возвращает repair request.
7. `time_update` — применяет утверждённую длительность к формуле времени.
8. `hidden_update` — код проецирует утверждённое consequence в hidden update.
9. `visible_projection` — строит visible context без hidden утечек.
10. `narration` — запускает approved narration flow.
11. `persistence_plan` — код строит и in-process запечатывает логический write plan из allowlist targets.
12. `commit` — party store принимает только запечатанный code-owned plan, сам отображает его в физические таблицы и сохраняет bounded-decision trace.
13. `screen_projection` — строит versioned `TurnScreen`.

## Результат

`runTurnWorkflow` возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Hidden state, provider payload и write plan не входят в screen.

## Ports

State reader, code-owned command registry, visible projector, narrator, party store, materializer, random source и screen projector передаются явно. Bounded decision executor, secret и expiry нужны только при неоднозначном закрытом наборе команд.

## Границы

Код не придумывает смысловые категории и отсутствующие варианты. Он выбирает зарегистрированный handler, рассчитывает штатные последствия и формирует change set. LLM не возвращает mode/consequence/write targets; её допустимый структурированный ответ — только точный bounded-decision result. Неизвестная команда, stale state/policy, поддельный token или невалидный change set останавливают pipeline.
