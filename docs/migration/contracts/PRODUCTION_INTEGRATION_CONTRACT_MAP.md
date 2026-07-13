# Карта production integration contracts

## Composition

`builtin:production` → `createProductionCompositionRoot`

Обязательный внешний binding:

- `newGameOptionsFactory(input, ports)`;
- `turnServicesFactory(input, ports)`;
- `stage25PostcommitProjector({ pool, input })`.

Опционально для тестов/альтернативной сборки:

- `newGameRunner`;
- `turnRunner`;
- `turnOptionsFactory`.

## Infrastructure ports

- `worldBase.read(sql, params)` — только read-only SQL;
- `llmRoleRunner.run(descriptor)` — provider-independent role execution;
- `sessionStore.load/save/delete` — JSONB session persistence;
- `deliveryStore.recordAttempt/commitAcknowledgement`;
- `stage25.idempotencyChecker`;
- `stage25.dryRunExecutor`;
- `stage25.transactionExecutor`;
- `stage25.postcommitReader`;
- `stage25.recordCommittedResult`.

## Runtime tables

Schema `party_runtime`:

- `game_sessions`;
- `delivery_attempts`;
- `delivery_acknowledgements`;
- `commit_idempotency`.

Эти таблицы технические. Они не определяют мир, игровые сущности или последствия.

## Browser E2E boundary

`game-web bundle` → `/api/v1/new-games` → `FirstGameScreen` → `/opening-ack` → `/turns` → `TurnScreen`.

На каждом public boundary действует hidden-field validation.
