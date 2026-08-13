# Lower Dvina Trace: implementation map

- **Статус:** implemented / maintenance reference
- **Текущая граница:** revision 18 / `spatial-v3-production-v8`, Phase 11 complete

Этот документ отвечает на вопрос «каким существующим механизмом реализована
каждая часть». Он не поручает будущему агенту повторять фазы и не заменяет
профильные module/LLM-контракты.

## Карта фаз

| Phase | Игровой или инфраструктурный результат | Revision / release | Основные владельцы | Persistence | Основная проверка / merged history |
|---|---|---|---|---|---|
| 0A–0D | Approved профиль игрока, участники/локации, предметы/evidence и declarative runtime policies. | definition lineage 1–5 | authoring + `@rus/materialization` validation | immutable content pins, party ещё не создаётся | PR [#35](https://github.com/PavelSlaven/Novgorod1230/pull/35)–[#39](https://github.com/PavelSlaven/Novgorod1230/pull/39) |
| 1A | Внутренняя materialization полного party instance. | revisions 5–6 | `@rus/materialization`, `@rus/new-game`, party store | атомарный Stage 24/25 party write | PR [#40](https://github.com/PavelSlaven/Novgorod1230/pull/40), corrections [#42](https://github.com/PavelSlaven/Novgorod1230/pull/42)–[#43](https://github.com/PavelSlaven/Novgorod1230/pull/43) |
| 1B | Публичный выбор сценария и безопасный opening screen. | revision 6 publication | new-game orchestration, presentation | pinned publication/session identity | PR [#41](https://github.com/PavelSlaven/Novgorod1230/pull/41), [#43](https://github.com/PavelSlaven/Novgorod1230/pull/43) |
| 2 | Осмотр крушения, factual check и первая улика. | revision 7 | `@rus/turn`, checks, items, knowledge | check/body/item/knowledge в одном P16 commit | PR [#44](https://github.com/PavelSlaven/Novgorod1230/pull/44)–[#45](https://github.com/PavelSlaven/Novgorod1230/pull/45) |
| 3 | Переход к стану и разговор с Еремеем/рыбаками. | revisions 8–9; semantic cutover revision 14 / v4 | movement, conversation, `@rus/npc-runtime`, `@rus/turn` | traversal, conversation statements/audience/knowledge | PR [#46](https://github.com/PavelSlaven/Novgorod1230/pull/46)–[#47](https://github.com/PavelSlaven/Novgorod1230/pull/47), semantic PR [#52](https://github.com/PavelSlaven/Novgorod1230/pull/52) |
| 4 | Сушильня, обещание, сдача/hostile handoff Ратши. | revision 10; conversation revision 14 / v4; combat handoff revision 16 / v6 | conversation, social-law, NPC runtime, combat | statements, promise, participant state, optional combat session | PR [#48](https://github.com/PavelSlaven/Novgorod1230/pull/48), semantic/combat cutovers [#52](https://github.com/PavelSlaven/Novgorod1230/pull/52), [#55](https://github.com/PavelSlaven/Novgorod1230/pull/55) |
| 5 | Timed лечение Онисима с утверждённым body effect. | revision 11 | turn, checks, body-state, items | activity/check/body/item rows и snapshot | PR [#49](https://github.com/PavelSlaven/Novgorod1230/pull/49) |
| 6 | Многосторонняя переноска Онисима к стану. | revision 12 | turn, activity, movement, items/body | timed activity, participant bindings, positions | PR [#51](https://github.com/PavelSlaven/Novgorod1230/pull/51) |
| M1 | Общая player semantic boundary для свободного ввода. | revision 13 / v3 | `@rus/turn` | semantic request/plan + common prepared commit | PR [#53](https://github.com/PavelSlaven/Novgorod1230/pull/53) |
| M2 | Общая semantic conversation boundary Phase 3–4. | revision 14 / v4 | `@rus/turn`, `@rus/npc-runtime`, knowledge/memory | NPC signals/boundaries/traces, statements, audiences | PR [#52](https://github.com/PavelSlaven/Novgorod1230/pull/52) |
| 7 | 30-минутный отдых; T+25 decision Жданко; продолжение до T+30. | revision 15 / v5 | temporal runtime, autonomous NPC, movement/items/body | schedule/signal/boundary/decision/actor-step в root turn | PR [#54](https://github.com/PavelSlaven/Novgorod1230/pull/54) |
| 8 / M3 | Клеть Жданко, confrontation, persisted combat и альтернативы. | revision 16 / v6 | turn, combat-health, NPC, checks, body, items, movement | combat session/intents/exchanges/events с common time | PR [#55](https://github.com/PavelSlaven/Novgorod1230/pull/55) и corrective [#56](https://github.com/PavelSlaven/Novgorod1230/pull/56)–[#57](https://github.com/PavelSlaven/Novgorod1230/pull/57) |
| 9 | Возврат имущества, показания, evidence resolution и temporary disposition. | revision 17 / v7 | items-property, movement, conversation, visibility/knowledge/evidence, social-law, turn | container/property/evidence/obligation/disposition projection | PR [#58](https://github.com/PavelSlaven/Novgorod1230/pull/58) |
| 10 | Code-owned `full|partial|case_open` completion и factual epilogue package. | revision 18 / v8 | visibility-knowledge-memory evaluator, turn commit, narration after commit | completion/provenance/visible projection; retry-safe zero-time turn | PR [#59](https://github.com/PavelSlaven/Novgorod1230/pull/59), boundary fix [#60](https://github.com/PavelSlaven/Novgorod1230/pull/60) |
| 11 | Full-stack canonical и alternative acceptance. | без новой revision/release | production web/server composition и тестовый harness | реальный PostgreSQL restart/readback/replay | PR [#61](https://github.com/PavelSlaven/Novgorod1230/pull/61) |

Номера revisions показывают immutable scenario lineage, а releases — semantic
production cutovers. Historical партия продолжает использовать свои pins даже
после появления следующей строки таблицы.

## Реализованный runtime flow

```text
raw player input
→ exact command или player-safe turn_step request
→ code-owned admission и профильные domain owners
→ temporal/NPC/combat same-time processing
→ один optimistic P16 commit
→ persisted player-safe projection
→ narration и UI
```

Conversation, autonomous и combat используют общий
`npc_decision_signal_v1 → npc_decision_boundary_v1`, но разные mode-specific
semantic requests/plans. Пять trigger categories — `self`, `others`,
`environment`, `objective`, `communication`; significance — `material` или
`critical`. Ни scenario code, ни LLM не сортируют cross-domain events и не
применяют mechanics напрямую.

## Persistence и recovery

Каждая фаза расширяет существующий root-turn/P16 путь вместо создания
параллельного save engine. Authoritative snapshot и нормализованные rows
сверяются при readback. Optimistic versions и idempotency identity запрещают
partial или повторный effect.

Restart восстанавливает committed:

- exact clock, activity и traversal progress;
- checks/RNG и body transitions;
- item/container topology, owner/holder/controller;
- NPC signals, boundaries, semantic decisions и statements;
- combat session, intents, exchanges и terminal events;
- knowledge/evidence, promise/disposition и completion provenance.

LLM вызывается только для новой актуальной semantic boundary. Replay не
перезапрашивает уже сохранённое решение.

## Что считается закрытым

- свободный player semantic input без bounded fallback;
- multi-NPC conversation и правило `statement != objective truth`;
- autonomous NPC на meaningful temporal boundary;
- persisted combat с code-owned technical execution;
- предметы, контейнеры, evidence и временное social disposition;
- deterministic completion и player-safe epilogue;
- restart/retry/replay всех основных фаз;
- browser → HTTP → production composition → PostgreSQL acceptance;
- canonical и альтернативные ветви;
- защита historical boatman production path.

## Что этот vertical slice не утверждает

Завершение Lower Dvina Trace не означает завершение всей игры, всей
Новгородской земли или универсальность каждого scenario binding. Сценарные
refs, персонажи, profiles и причинные условия остаются content конкретного
vertical slice.

Новый сценарий должен переиспользовать общих владельцев, но не обязан копировать
Lower Dvina progression. Phase 11 не открывает автоматически Phase 12,
revision 19 или `spatial-v3-production-v9`; следующий продуктовый этап требует
отдельного решения.

## Исторические документы

- [Gap audit](lower-dvina-trace-gap-audit.md) — baseline до начала реализации.
- [Completed phased roadmap](lower-dvina-trace-phased-roadmap.md) — исходное
  архитектурное разбиение Phase 0–11.
- [Production reference](lower-dvina-trace-reference.md) — краткое текущее
  состояние и нормативные ссылки.
