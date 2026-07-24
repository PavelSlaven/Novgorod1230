# @rus/game-server

## Назначение

Production composition root and the only physical PostgreSQL transaction owner. It binds domain public APIs to HTTP, verified knowledge/runtime catalog, read-only world-base and `party_runtime` adapters; it owns persisted presentation delivery state, not its domain projection rules.

## Владеет

- Владеет production composition, HTTP `/api/v1/*`, pool/probe/migrations, physical `party_runtime` transaction/Stage 25/combined atomic commit adapters, session/delivery stores and `createTemporalPresentationPostgresStore`.

## Не владеет

Не владеет temporal/body/movement/visibility formulae, route or endpoint logic, write-plan construction, materialization semantics, LLM prompts/repair policy, narration prose, UI read-model rules or world-base writes.

## Public API и контракты

- `.` exports composition roots, adapters, HTTP server/handler/static resolver and startup config validation.
- `./production` exports production composition, PostgreSQL pools/probes/migrations, party/session/delivery/world-base/Stage 25 adapters and provider runner.
- Target infrastructure factories `createSpatialV3CombinedAtomicCommitter` and
  `createTemporalPresentationPostgresStore` remain server-owned adapters; they
  accept only validated sealed plans/explicit pool transactions and are not
  domain decision APIs.

Infrastructure inputs are explicit pool/config/binding/plan DTO and transactional callbacks; output is a committed physical result, HTTP envelope or typed server/infrastructure error. SQL targets are explicitly `party_runtime`; world-base adapter is read-only. Temporal presentation persistence stores package/pending-delivery lifecycle separately from narrator output, atomically with factual write when required by the combined plan.

## Ошибки, зависимости и effects

Uses `pg` only under `src/infrastructure/postgres`; `GameServerError`/server error envelopes, startup probes and adapter failures are explicit. This is the persistence and external-I/O boundary: owns pool/transaction/HTTP/provider calls and rejects invalid schema, hidden public payload, stale knowledge artifacts and unqualified targets. No deterministic runtime fallback is allowed.

## Target / P28 и тесты

Spatial/Temporal `temporal-world-v1` / `4.3.0-target.1` composition is shadow/target only before atomic P28; production v2 remains sole owner and no target stub is imported into production composition. `test/game-server.test.js`, `party-store-runtime-catalog.test.js`, `runtime-catalog-boundary.test.js`, `test/spatial-v3/p16-committer-postgres.test.js`, `temporal-world-postgres.test.js` and `presentation-store.test.js` cover composition, atomic transaction/lock/idempotency, exact persistence and the leased post-commit presentation lifecycle.
