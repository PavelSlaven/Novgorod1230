# Stage 18 parity report

Релиз: `0.8.0-migration.8`  
Baseline: `test/fixtures/stage17-19-baseline/stage18-character-knowledge-map-0.7.0.js`

## Подтверждено

- Полный compatibility export surface совпадает с baseline.
- Input, reference index, knowledge-map validation, precheck, audit и write projection совпадают с baseline.
- Successful orchestration совпадает с baseline.
- Format repair malformed JSON подтверждён.
- Semantic repair unapproved full-map grant подтверждён.
- Canonical digest использует `@rus/kernel`.
- Legacy implementation заменена однострочным фасадом.

## Дополнительные security cases

- полная карта мира блокируется;
- скрытое будущее событие в знаниях блокируется.

Результат: parity подтверждён.
