# @rus/party-store

## Назначение

Logical party persistence boundary: validates/adapts approved plans and delegates their execution to an injected transaction port. It owns neither PostgreSQL nor a physical transaction.

## Владеет

- Владеет `createPartyStore`, Stage 25 adapter/target safety, v2 plan/idempotency handoff and target spatial-v3 domain repository/mutation service interfaces.

## Не владеет

Не владеет SQL, DB driver/pool, transaction ownership, world-base reads, materialization, factual formulae, write-plan creation, presentation projection or narration.

## Public API и контракты

- `.`: `createPartyStore({ transact })`.
- `./stage-25`: physical-plan adapter contract and fixed v2 schema mappings.
- `./ordinary-materialization`: logical exact-scope load/CAS handoff for the
  closed ordinary aggregate; it reuses the materialization aggregate validator
  and never owns SQL or a transaction.
- `./spatial-v3`: `createSpatialV3Repository`, `createCombinedWritePlanCommitter`; `./spatial-v3-domain-integration`: placement integrator/mutation service.

The target repository exposes explicit-column reads for perception replay,
reaction consequence, knowledge merge result and target-only knowledge state.
It never combines legacy rows with the `4.4.0-target.1` branch and remains
read-only; all writes still pass through the game-server combined committer.

Inputs are approved, idempotency-bound logical write plans plus explicit injected transaction/repository ports. A P23 semantic mutation additionally requires a caller-supplied, contract-valid `visible_package_persistence_envelope`; party-store never invents that projection. Outputs are committed-result semantics or typed failure; target ports fail closed when unavailable and never invoke v2 fallback. Unknown/v1 targets are rejected rather than mapped semantically.

O1 uses the existing `./ordinary-materialization` closed aggregate only after
`request_discovery` meaningful/code-first gates and model execution outside a
physical transaction. Its logical plan carries candidate-free Stage A seed,
prepared/committed supporting basis, or a targeted Stage B resolution with
`evidence_weight = 0` and code-owned identity/classification/policy fields;
normalized discovery query supplies only `candidate_hint` and an adjusted
`coverage_ref`, so unknown paraphrases retain distinct coverage. Positive plans additionally
carry admitted immutable mechanics/property/placement. The handoff preserves
CAS/idempotency for exact positive and negative resolutions, so retry/reload
does not reroll exact deterministically normalized identity. This package neither exposes player capability/visibility nor
creates a public ordinary operation; O2/A1/F1/S1/N1, template-less containers,
context-bound weapons/value/currency and natural finite sources are outside it.

Party migration `020` расширяет constraints будущих item/container placements:
actor physical positions, `equipped` и `equipment_slot_category_id` допустимы
для player и NPC holder. Historical NPC-container rows без physical position
сохраняются как есть, но новый либо изменяемый actor-held container обязан иметь
позицию. Canonical
appearance остаётся внутри существующих player profile/NPC identity JSON;
отдельной appearance table и persisted `portrait_spec_v1` нет.

## Ошибки, зависимости и effects

Missing/miswired transaction port and infrastructure failures propagate as typed port/transaction errors; Stage 25 target mapping rejects unsafe targets. Dependencies are `@rus/kernel`, `@rus/contracts`, `@rus/materialization`, `@rus/turn`; package has no DB driver and performs persistence only through its injected transaction boundary. The sole physical PostgreSQL transaction owner is `@rus/game-server`.

## Target / activation и тесты

Spatial/temporal target support is current `4.4.0-target.1` with immutable
accepted `4.3.0-target.1` baseline, shadow/fail-closed until the
separate `versioned production activation cutover`; historical P28 evidence
did not activate or dual-write production state. Relevant coverage is package
foundation/Stage 25 tests plus
`test/spatial-v3/p11-temporal-world-persistence.test.js`,
`p13-party-runtime-postgres.test.js`, `p16-persistence.test.js`,
`p23-domain-integration.test.js` and the server-owned PostgreSQL suites.
