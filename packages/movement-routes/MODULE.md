# @rus/movement-routes

## Назначение

Owner of route query/planning, approved movement method/time resolution, traversal progress/readiness and activation validation. It is a pure/pluggable domain module; all factual reads and commit are explicit external ports.

## Владеет

- Владеет legacy pure travel helpers, `createMovementPlanner`, `createRoutePlanActivationValidator`, выбор одного approved actor destination transition из фактической позиции и materialized destination, target traversal resolver/commit-validator adapters, route-plan static snapshot and capability/readiness validation.

## Не владеет

Не владеет player destination choice, RNG checks, exact clock arithmetic, temporal slice merge, position mutation, DB/SQL, materialization, UI or narration.

## Public API и контракты

- `.`: `TRAVEL_CONDITION_MULTIPLIERS`, `TRAVEL_LOAD_MULTIPLIERS`, `calculateTravelTime`, `assessRouteAvailability`, `buildTraversalRequest`, `validateTraversalResult`, `planApprovedActorDestinationTransition`, planner and activation validator.
- `./spatial-v3`: `createTraversalResolver`, `createTraversalCommitValidator`; `./spatial-v3-planner`: planner/activation implementation.

Planner receives explicit `resolveKnowledgeTarget`, `loadTopology`, `snapshotEndpoint`, `validateCapability` ports and returns a route plan/proposal or typed fail-closed result. Activation validator receives explicit preparation/current-state/capability/recheck ports and returns accepted/rejected activation validation. Inputs/outputs use pinned target DTO and never fabricate endpoint, capability, time factor or route fallback.

## Ошибки, зависимости и effects

Typed target failures include route/endpoint/capability/readiness/pin/state-version conflicts (for example `route_contract_missing`, `movement_capability_missing`, `route_plan_snapshot_missing`, `route_plan_execution_conflict`). Depends on `@rus/kernel`, `@rus/contracts`, `@rus/time-events-history`; no direct I/O, DB or state mutation. Duration is consumed by turn/time owner, not committed here.

## Target / activation и тесты

Production route planning/activation uses current `temporal-world-v1.1` /
`4.4.0-target.1` with immutable `temporal-world-v1` / `4.3.0-target.1`
baseline. Historical P28 evidence did not change composition; the later
`versioned production activation cutover` release `spatial-v3-production-v1`
made v3 the sole production route. Production v2 remains only an explicit
migration/rollback source, never a fallback. `test/domain.test.js` covers public helpers;
`test/spatial-v3/p18-movement-planning.test.js` covers target
planner/activation behavior.
