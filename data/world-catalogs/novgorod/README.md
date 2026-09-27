# Novgorod world catalog staging

Этот каталог не является production `world_base`.

- `manifests/` — неизменяемые manifests источников;
- `revisions/` — зарегистрированные ревизии карты;
- `staging/` — неутверждённые G1-mask, очередь и пакеты ячеек;
- `approved/` — только `approved_integrated` пакеты;
- `imports/` — dry-run, transaction plan и import history;
- `reports/` — структурные и критические отчёты;
- `templates/` — пустые контракты без смысловых значений по умолчанию.

Runtime не должен читать `staging/`.

## Итог C001–C004

Данные `game-base-v1` остаются candidate. Последние файловые verdict и ограничения: [STATUS.md](game-base-v1/STATUS.md); для привязки мест см. [повторную проверку C003b](game-base-v1/places-binding/VERIFICATION.md#независимая-проверка-c003b-claude-opus-55-коммит-aa18c441) и [проверку природных текстов C003b](game-base-v1/nature-materials-weather/VERIFICATION.md#независимая-проверка-c003b-claude-opus-55-коммит-aa18c441). `approve_with_limits` сохраняет ограничения соответствующего раздела проверки.

- C004: 22 требования — 1/7/13/1 → 1/19/1/1; 60 доменов — 3/43/13/1 → 3/55/1/1.
- 16 PF × 15 ячеек: 106 covered, 22 uncovered, 96 no_direct_join, 16 N/A.
