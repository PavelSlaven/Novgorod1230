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
