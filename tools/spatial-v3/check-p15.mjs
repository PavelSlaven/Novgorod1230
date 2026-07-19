import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const sql = await readFile('schemas/party-db/004_party_runtime_v3_journeys.sql', 'utf8');
const manifest = await readFile('apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js', 'utf8');
for (const token of [
  'party_journey_locations', 'party_carrier_attachments', 'party_cohorts', 'party_cohort_memberships',
  'party_actor_carrier_positions', 'party_clocks', 'party_synchronized_time_slices',
  'party_synchronized_time_slice_results', 'party_command_idempotency', 'party_v3_change_sets',
  'party_change_set_write_plans', 'party_clock_owner_handoffs', 'v3_clock_no_delete', 'spatial_clock_owner_handoff_invalid', 'v3_journey_deferred_integrity', 'v3_idempotency_integrity',
  'v3_synchronized_slice_result_integrity', 'gcd(', 'party_carrier_attachment_subject_active_uq',
  'party_idempotency_party_lock_idx', 'party_journey_location_lock_idx',
]) assert.ok(sql.includes(token), `P15 DDL missing ${token}`);
assert.match(sql, /CHECK\(\(location_kind = 'scene'\) = \(scene_position_id IS NOT NULL AND transit_anchor_id IS NULL AND travel_state_id IS NULL\)\)/, 'location XOR must be physical DDL');
assert.match(sql, /spatial_root_authority_xor_violation/, 'attachment/location XOR must fail closed');
assert.match(sql, /spatial_carrier_attachment_graph_invalid/, 'carrier graph must fail closed');
assert.match(sql, /spatial_idempotency_terminal_immutable/, 'terminal replay records must be immutable');
assert.match(manifest, /004_party_runtime_v3_journeys\.sql/, 'target manifest must include P15 migration');
console.log('P15 journey/time/idempotency DDL static checks passed.');
