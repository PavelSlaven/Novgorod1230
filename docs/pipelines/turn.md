# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `resolve_mode` — выбирает утверждённый режим обработки через semantic resolver.
3. `load_context` — читает состояние через `PartyStateReader`.
4. `availability` — формирует доступность действий через resolver.
5. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
6. `consequence` — получает утверждённые последствия либо repair request.
7. `time_update` — применяет утверждённую длительность к формуле времени.
8. `hidden_update` — обновляет hidden projection через отдельный port.
9. `visible_projection` — строит visible context без hidden утечек.
10. `narration` — запускает approved narration flow.
11. `persistence_plan` — получает утверждённый write plan.
12. `commit` — передаёт plan в party store.
13. `screen_projection` — строит versioned `TurnScreen`.

## Результат

`runTurnWorkflow` возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Hidden state, provider payload и write plan не входят в screen.

## Ports

State reader, mode/availability/consequence resolvers, hidden updater, visible projector, narrator, write planner, party store, random source и screen projector передаются явно.

## Границы

Код не выбирает смысловой результат deterministic-эвристикой. Невалидный или неутверждённый consequence останавливает pipeline с typed failure/repair route.
