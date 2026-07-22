# P14 planning/execution DDL — independent critic report

**Original verdict:** `CHANGES REQUIRED`
**Final independent re-audit verdict:** `PASS`
**Remediation status:** `CRIT-01 / CRIT-02 / CRIT-03 CLOSED`
**Reviewed HEAD:** `3067b831e18bda00df39b3662f4da5494ccd43d2`
**Date:** 2026-07-21
**Branch:** `codex/spatial-architecture-g0-g6-v4-2`
**Scope:** P14-S01–P14-S06 only. The review did not alter target DDL,
runtime/repositories, P15+, production composition, an operator database, or P28.

## Authority and reviewed surface

The review used P14 in
`NEW PLAN/PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`, the target
standard Appendix A.4 and contracts `party_route_plan`,
`party_route_plan_step`, `party_route_plan_execution`, and
`party_route_plan_execution_event`; the code-critic invocation rule; the
read-only world/party boundary; and the table-requirements normative.

Repository Intelligence and Graphify were independently queried for:

```text
P14 DDL phase spatial v3 contracts database migrations check-p14 independent critic requirements
```

At the reviewed HEAD, the repository graph was rebuilt with Graphify `0.9.17`
and was ready. Knowledge-source reported only the documented
`KNOWLEDGE_SOURCE_DEGRADED` semantic-coverage warning.

Reviewed implementation and regression surface:

- `schemas/party-db/003_party_runtime_v3_planning.sql`;
- `apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js`;
- `tools/spatial-v3/check-p14.mjs`;
- `test/spatial-v3/p14-party-planning-postgres.test.js`;
- the dependent P09 spatial-core and P13 party-foundation PostgreSQL suites;
- generated `infra/world-base/SCHEMA_REFERENCE.md` consistency.

## Finding

### P14-CRIT-01 — MAJOR — current execution state can be forged without history

**Status: closed by independent re-audit.** The P14 remediation adds a
database-level fail-closed invariant in
`party_runtime.v3_execution_transition_valid()` and
`party_runtime.v3_planning_deferred_integrity()`:

- every update of the sole mutable execution row increments `state_version`;
- every update, including `active → active`, has an append-only event with
  exact `from_status`, `to_status`, and `change_set_id = updated_change_set_id`;
- a same-status update may alter only the current step projection; lifecycle,
  final, suspension, abort, and supersession fields require a status transition,
  and an ordinal advance requires the matching `step_completed` causal event;
- any non-null current endpoint is exactly a departure or arrival endpoint of
  the immutable current plan step;
- a causal same-status step is still separately checked against its typed
  action/activity/traversal result and idempotency/change-set lineage.

The isolated PostgreSQL regression now proves that the forged same-status
endpoint/change-set update is rejected, a version-only same-status update is
rejected, a valid `active → active` causal action is accepted, and a nested
transaction rollback leaves the current row and append-only event history
exactly unchanged before a successful reapply.

`party_runtime.v3_execution_transition_valid()` returns immediately when
`NEW.status = OLD.status`. The deferred
`v3_planning_deferred_integrity` trigger requires a corresponding event only
when the status changes. Consequently an `active` execution can have a
location-bearing mutable field and its `updated_change_set_id` changed directly
without a state-version increment or a new append-only event.

An isolated disposable `postgres:16-alpine` database applied `001 → 002 →
003`, created a valid ordinary one-step plan/execution and committed its
`planned → active` event. The following update then committed:

```sql
UPDATE party_runtime.party_route_plan_executions
SET current_endpoint_ref =
      '{"endpoint_kind":"scene_position","endpoint_id":"forged"}',
    updated_change_set_id = 'forged-c'
WHERE id = 'exec';
```

Readback after the committed update was:

```text
state_version = 2
updated_change_set_id = forged-c
current_endpoint_ref = {"endpoint_id":"forged","endpoint_kind":"scene_position"}
history_events = 2
```

No causal action/activity/traversal row and no `step_*` execution event was
written. This contradicts P14's exact immutable-plan/mutable-current-state /
append-only-history split, Appendix A.4.2's event mapping, and the target
contract requiring that the current endpoint be dictated by the immutable step
and completed effects. It also makes audit/change-set lineage unreliable.

Required correction:

1. require every mutable execution-state update to increment `state_version`
   and carry an allowed, same-change-set append-only event (including an
   `active → active` causal step event where applicable);
2. reject direct mutation of `current_endpoint_ref`, active child IDs,
   lifecycle timestamps, final/suspension snapshots, `updated_change_set_id`,
   and analogous state fields unless their exact state/event/causal-result
   contract is satisfied;
3. enforce that an endpoint-bearing state matches the relevant immutable plan
   step/effect or handoff contract, not merely that the JSON value is non-null;
4. add a PostgreSQL negative regression for the above direct update and
   positives for a valid same-status causal progression.

### P14-CRIT-02 — MAJOR — event kind must match the exact step/result gate

**Status: closed by independent re-audit.**
`party_runtime.v3_event_causal_integrity()` now loads the immutable step kind,
whether the event step is final, and the exact causal result kind before
accepting the append-only event. It enforces the Appendix A.4.2 disjoint map:

- `step_progressed` is only positive nonterminal `progressed` work of a timed
  activity or traversal; an immediate action or a completed result is rejected;
- `step_paused` is only an activity `paused` or traversal
  `paused_in_transit` result;
- `step_completed` is a completed non-final immediate action/activity or
  `segment_completed` traversal; the final equivalent is `completed`;
- `wait_started`, `suspended`, and `stranded` require respectively a blocked/
  failed result, `interrupted_at_anchor`, or `stranded` result.

The isolated P14 PostgreSQL suite now uses a valid two-step immediate-action
plan for the `step_completed` same-status progression, preserves the nested
rollback/reapply evidence, and rejects a completed immediate action forged as
`step_progressed`. Existing P15 traversal completion exercises the final
`segment_completed → completed` mapping.

### P14-CRIT-03 — MAJOR — append-only events must be bidirectionally tied to current execution

**Status: closed by independent re-audit.** A new deferred
`v3_execution_event_ledger_integrity` trigger validates the full contiguous
event status chain and its last event against the sole mutable execution row:
the latest event ordinal is exactly `state_version - 1`, its change set and
post-status equal `updated_change_set_id` and current status, and its step is
the current step (or the immediately preceding step only for
`step_completed`). Terminal current states have no current step. The reciprocal
execution-row trigger already requires that exact versioned event.

This validates one or several legal transitions in a transaction from the
single contiguous history ledger, while ordinary replay makes no write and
therefore creates no false event requirement. The isolated regression now
rejects a validly-shaped but event-only final transition while the execution
remains active, and confirms the current row/history remain exact after the
rejected transaction. Nested rollback/reapply and multi-step completion remain
covered.

## Checks actually run

| Command / probe | Result |
|---|---|
| `npm run spatial-v3:check-p14` | PASS after remediation |
| `npm run spatial-v3:test-p14-postgres` | PASS, 1/1 after remediation |
| `npm run spatial-v3:test-p09-postgres` | PASS, 1/1 after remediation |
| `npm run spatial-v3:test-p13-postgres` | PASS, 1/1 after remediation |
| `npm run spatial-v3:test-p15-postgres` | PASS, 1/1 after remediation |
| `npm run world-db:schema-doc-check` | PASS; 185 tables; digest `36633dc334cd22ea9ed85583427c40d31c1fa36b4df278ccc0d248b58b0a188b` |
| isolated CRIT-01 probe | PASS: direct same-status and version-only mutations rejected; paired update/event and rollback/reapply exact |
| isolated CRIT-02 probe | PASS: completed immediate action rejected as `step_progressed`; valid non-final `step_completed` and final traversal `completed` accepted |
| isolated CRIT-03 probe | PASS: event-only final transition rejected; current status/version/change-set/history unchanged |

All database tests/probes used temporary local containers. No operator or
production database was contacted.

## Decision

Independent re-audit returned **`PASS`**: CRIT-01, CRIT-02 and CRIT-03 are
closed. P14-S06 satisfies its independent-critic requirement. This verdict
does not authorize P28 or change production composition or the v2
production-owner boundary.
