# ADR-001: Code-owned perception

**Статус:** proposed
**Дата:** 2026-07-15
## Контекст

Слух, видимость, свидетели и реакции NPC одновременно затрагивают G5, состояние NPC, hidden/visible boundary, turn pipeline и bounded decisions. Передача фактов восприятия LLM сделала бы результат недетерминированным и позволила бы prose менять состояние мира.

## Решение

Физическое распространение сигналов, hearing/vision resolution, свидетели, привычность, значимость и transitions настороженности принадлежат коду. Будущий pure пакет `@rus/perception` получает immutable sensory snapshot и approved profiles, возвращает typed results, но не читает БД, не пишет состояние, не вызывает LLM и не запускает соседние stages.

`@rus/visibility-knowledge-memory` остаётся единственным security boundary для player projection. `@rus/turn` оркестрирует отдельные stages. LLM вызывается только для выбора одной реакции из минимум двух already-valid options и возвращает exact `option_id`/`command_token`; code повторно проверяет preconditions и рассчитывает consequence.

## Последствия

- данные восприятия, G5 transition profiles, light/ambient/routine/reaction profiles обязаны быть approved и version-pinned;
- отсутствие обязательных данных или candidate set — typed gap и hard block;
- DDL, contracts, pipeline и UI меняются только в следующих фазах;
- proposed-норматив не меняет runtime и не мигрирует старые партии;
- будущая реализация требует TDD, generated references, shadow rollout и PASS критика.

## Альтернативы

1. Разрешить LLM решить «кто заметил» — отклонено: нарушает determinism и hidden boundary.
2. Встроить расчёт в `@rus/visibility-knowledge-memory` — отклонено: этот пакет владеет безопасной проекцией, а не объективной физикой восприятия.
3. Добавить default profiles — отклонено: противоречит fail-closed требованиям materialization v2.

## Связанный норматив

- `data/knowledge-source/corpus/DOCUMENTS/perception_visibility_hearing_and_npc_reactions.md`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`.
