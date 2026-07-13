# G5 placement pipeline report

Релиз: `0.9.0-migration.9`

## Модульная цепочка

```text
Stage 13 G5 materialization
→ Stage 14 independent G5 audit
→ Stage 15 NPC placement
→ Stage 16 item/container/property placement
→ Stage 17 time/light gate
```

## Архитектурные свойства

- Каждая стадия имеет собственный exact input и versioned output contract.
- Stage 14 не импортирует Stage 13 implementation.
- Stages 15–16 не импортируют соседние implementations.
- Общая G5-проверка находится в нейтральном `packages/new-game/src/g5-scene/`.
- Schema names, enums, statuses, limits и handoffs принадлежат `@rus/contracts`.
- Role/tier descriptors принадлежат `@rus/llm-runtime`.
- Legacy-файлы являются однострочными compatibility-фасадами.
- Код не придумывает G5, NPC, предметы, владельцев или скрытое содержимое.

## Проверка

- специализированная фаза: 35/35;
- полная модульная suite: 187/187;
- architecture check: passed;
- release hygiene: passed;
- legacy baseline: 256/261, новых failures нет.
