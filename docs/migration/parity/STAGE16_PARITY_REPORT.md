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

Код не материализует предметы, содержимое контейнеров или право собственности самостоятельно.
