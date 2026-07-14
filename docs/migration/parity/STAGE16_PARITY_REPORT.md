# Stage 16 parity report

Релиз: `0.9.0-migration.9`

Stage 16 item/container/property placement сравнивался с baseline `stage16-item-placement-0.8.0.js`.

Подтверждено:

- compatibility export surface;
- exact input и reference index;
- item, container, ownership и property binding validation;
- duplicate ID and missing reference rejection;
- hidden ownership/contents boundaries;
- audit contract;
- successful orchestration;
- format repair и semantic repair;
- result, permission и Stage 16 → 17 handoff shape.

Этот отчёт фиксирует историческую parity миграции `0.9.0`. После materialization v2 production Stage 16 кодом материализует предметы, контейнеры и ownership из approved item/container/property profiles и causal rules; LLM materialization запрещена.
