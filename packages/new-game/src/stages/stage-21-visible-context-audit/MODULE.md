# Stage 21 — Visible Context Audit

Независимо проверяет точный `visible_context_package` Stage 20 и выдаёт каноническое разрешение для narrator boundary либо один совместимый repair route.

## Владеет
- точным audit input;
- повторным deterministic precheck;
- semantic audit, format repair и senior audit;
- concern/evidence validation;
- выбором одного repair route;
- `VisibleContextAuditApproval` handoff.

## Не делает
Не изменяет пакет, не пишет прозу, не создаёт факты, не пишет БД, не импортирует Stage 20 и не знает provider SDK.

## Зависимости
Разрешены `@rus/contracts` и нейтральный `src/visible-context` boundary. Запрещены sibling stages, legacy implementation, DB, UI/server и provider SDK.
