# Stage 25 transaction report

Дата: 2026-07-11

## Проверенная последовательность

```text
preflight
→ idempotency
→ dry run
→ commit gate
→ transaction
→ postcommit readback
→ postcommit validation
→ approval/handoff
```

## Контрактные проверки

- dry run обязателен;
- `rollback_completed === true` обязателен;
- transaction не вызывается до успешного gate;
- gate связан с logical plan, physical plan и dry-run digests;
- partial transaction отклоняется;
- rollback/commit-error не превращается в success;
- postcommit readback обязателен;
- hidden state в public read model блокирует handoff;
- `replay_committed` возвращает валидированный предыдущий result без повторного dry run, transaction или readback;
- default schema adapter проходит полный технический commit boundary.

## PostgreSQL

В окружении отсутствовали `TEST_DATABASE_URL`, `DATABASE_URL` и `PGHOST`. Поэтому не выполнялись:

- реальный `BEGIN/COMMIT`;
- искусственная SQL-ошибка внутри batch;
- физический `ROLLBACK`;
- повторный commit против реального unique/idempotency constraint;
- postcommit readback из PostgreSQL.

Эти проверки не считаются пройденными и должны быть выполнены после переноса SQL executors в `@rus/party-store` или при подключении изолированной тестовой PostgreSQL базы.
