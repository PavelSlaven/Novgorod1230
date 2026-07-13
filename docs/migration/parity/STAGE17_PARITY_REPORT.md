# Stage 17 parity report

Релиз: `0.8.0-migration.8`  
Baseline: `test/fixtures/stage17-19-baseline/stage17-time-light-gate-0.7.0.js`

## Подтверждено

- Полный compatibility export surface совпадает с baseline.
- Input builder и input validation совпадают с baseline.
- Clock, time-of-day, light, season/weather, G5, NPC, item, body и draft-visible проверки сохранены.
- Normalized visibility constraints совпадают с baseline.
- Audit/route validators и successful orchestration совпадают с baseline.
- Legacy implementation заменена однострочным фасадом.
- Weather validator больше не импортируется из legacy retriever.

## Дополнительные security cases

- снег при `hot` блокируется;
- видимый NPC в темноте без допустимого основания блокируется.

Результат: parity подтверждён.
