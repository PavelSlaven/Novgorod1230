# Stage 13 parity report

Релиз: `0.9.0-migration.9`

Stage 13 G5 materialization сравнивался с baseline `stage13-g5-materialization-0.8.0.js`.

Подтверждено:

- compatibility export surface;
- policy и schema names;
- exact input boundary;
- template normalization;
- G5 draft validation и graph constraints;
- lifecycle result shape;
- successful materialization;
- rejection of invalid references and duplicate IDs;
- `empty_allowed` behavior.

Этот отчёт фиксирует историческую parity миграции `0.9.0`. После materialization v2 compatibility surface сохранён, но production Stage 13 вызывает code materializer: он создаёт G5 только из approved profile/layout/template/slot bundle и блокирует неполный набор без LLM materialization.
