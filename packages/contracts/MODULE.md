# @rus/contracts

## Назначение

Canonical machine-readable contract/typed-error registry shared by packages and applications. It defines names, validators, canonical digests, controlled vocabularies and public target-port primitives; it executes no game workflow.

## Владеет

- Владеет schema/approval/handoff validators, digests, visible/hidden boundaries, Spatial/Temporal registry, state machines and typed errors.

## Не владеет

Не владеет domain formulae, LLM, repository/port implementation, DB, UI, write-plan execution, semantic repair or compatibility fallback.

## Public API и контракты

Exports `.` plus documented subpaths for JSON, stages, approvals, digests, schema names, handoffs, `./portrait-spec-v1`, `./combat-v1` and `./spatial-v3/{registry,compatibility,ports,state-machines}`. `./portrait-spec-v1` owns the strict JSON Schema, enum vocabulary and one browser/server-safe validator for the experimental Portrait Lab. `./combat-v1` owns six strict combat DTO validators only, including participant status `restrained` and the intent lifecycle `active / completed / blocked / invalidated / no_progress`. `SPATIAL_V3_CONTRACT_VERSION` is `4.4.0-target.1` (baselines `4.2.0-target.1` and immutable accepted Temporal `4.3.0-target.1`); the current generated registry contains exactly 213 contracts and 82 typed errors while retaining byte-identical 160/58 and 188/82 historical snapshots. Principal target APIs are canonicalization/digest, `validateSpatialV3Contract`, `validatePlayerSafeVisiblePayload`, controlled-vocabulary validation and `createSpatialV3TypedError`; ports expose fail-closed `target_stub` results.

## Ошибки, зависимости и effects

Validators return structured validation errors or typed-error DTO; malformed canonical input may throw type/range errors. Missing vocabulary, schema mismatch and target port availability never degrade to inferred data. Depends only on `@rus/kernel`; no I/O, DB, network, LLM, persistence or side effects.

## Target / P28 и тесты

Registry carries current `temporal-world-v1.1` and `4.4.0-target.1`, plus the
immutable accepted `temporal-world-v1` / `4.3.0-target.1` snapshot. Historical
P28 evidence changed no composition; the later `versioned production
activation cutover` release `spatial-v3-production-v1` activated the current
contract set as the sole production route. `test/spatial-v3-registry.test.js` and
`test/temporal-world-v1.test.js` cover registry version, contract and temporal
vocabulary/error behavior.
