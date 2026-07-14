# Hidden-state pipeline report

Релиз: `0.8.0-migration.8`

## Модульная цепочка

```text
Stage 17 time/light consistency
→ Stage 18 character knowledge map
→ Stage 19 full hidden scene state
→ Stage 20 visible context
```

Границы связаны через versioned contracts, audit permissions и immutable handoff data. Реализации соседних stages друг друга не импортируют.

## Канонические владельцы

- `@rus/contracts/weather-state` — weather schema и validator.
- `@rus/contracts/time-knowledge-hidden-boundary` — schema names, enums и handoff contracts.
- `@rus/llm-runtime/knowledge-hidden-roles` — роли и tier mapping.
- `packages/new-game/src/time-light/` — чистые детерминированные проверки времени, света и видимости.

## Защищённые границы

- Код не создаёт знания персонажа.
- Код не придумывает hidden categories/facts или будущие события; Stage 19 детерминированно проецирует утверждённые hidden-state records материализованных NPC, предметов, контейнеров и маршрутов и блокирует обязательную сущность без такой проекции.
- Слухи, ошибки и неопределённость не повышаются до факта.
- Player-facing prose запрещена в hidden state.
- Visible context получает только утверждённые Stage 17–19 artifacts.

## Проверка

- Специализированные тесты: 22/22.
- Полная модульная suite: 152/152.
- Legacy baseline: 256/261, новых failures нет.
