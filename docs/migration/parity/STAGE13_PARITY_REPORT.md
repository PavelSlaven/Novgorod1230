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

Новых смысловых правил не добавлено. Код только формирует input, вызывает LLM-порт и валидирует результат.
