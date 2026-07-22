import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const sql = await readFile('schemas/party-db/003_party_runtime_v3_planning.sql', 'utf8');
const manifest = await readFile('apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js', 'utf8');
for (const token of [
  'preparation_snapshots', 'preparation_claims', 'party_route_plans', 'party_route_plan_steps',
  'party_route_plan_executions', 'party_route_plan_execution_events', 'party_action_step_runs',
  'party_timed_activity_executions', 'party_timed_activity_attempts', 'traveller_travel_states',
  'party_traversal_interval_results', 'party_recovery_transition_bindings',
  'v3_execution_transition_valid', 'v3_execution_event_valid', 'v3_planning_deferred_integrity',
  'v3_plan_step_integrity', 'v3_append_only',
]) assert.match(sql, new RegExp(token), `P14 DDL missing ${token}`);
assert.match(manifest, /003_party_runtime_v3_planning\.sql/, 'target manifest must include P14 migration');
console.log('P14 planning/execution DDL static checks passed.');
