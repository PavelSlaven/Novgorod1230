# Rollback и restore report — migration-0.21.0

Дата: 2026-07-12

## Previous-release rollback archive

- Source: `Rus_modules-migration-0.20.0.zip`.
- Rollback archive: `Rus_modules-rollback-0.20.0.zip`.
- SHA-256: `7c67daa634449a3b5df853ced98ed31cf0531e56337eacdc72873da3c1590fe9`.
- ZIP integrity: passed.
- Restored architecture check: passed.
- Restored shadow tests: 6/6.
- Restored release hygiene after dependency cleanup: passed.

## Party runtime restore

Из изолированной PostgreSQL-compatible test database сохранены и восстановлены:

- `party_runtime.game_sessions`;
- `party_runtime.delivery_attempts`;
- `party_runtime.delivery_acknowledgements`;
- `party_runtime.commit_idempotency`.

После восстановления подтверждены turn number, public screen schema, delivery/ack counts и committed idempotency result.

## Route rollback

- modular route является default;
- `RUS_RUNTIME_ROUTE=legacy` явно выбирает rollback route;
- переключение route не мутирует существующий party session;
- legacy source сохранён read-only до финализации.

## Решение

Rollback capability: verified. Automatic legacy deletion: forbidden.
