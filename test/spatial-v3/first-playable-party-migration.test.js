import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPATIAL_V3_TARGET_MIGRATIONS
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const sql = readFileSync(
  new URL('../../schemas/party-db/011_party_runtime_first_playable.sql', import.meta.url),
  'utf8'
);

test('target chain appends first-playable migration as 011', () => {
  assert.equal(SPATIAL_V3_TARGET_MIGRATIONS.length, 11);
  assert.equal(SPATIAL_V3_TARGET_MIGRATIONS.at(-1), sql);
});

test('011 extends the existing activity owner with strict standalone XOR', () => {
  assert.match(sql, /execution_scope IN \('route_step','standalone'\)/u);
  assert.match(sql, /activity_series_id/u);
  assert.match(sql, /activity_owner_ref/u);
  assert.match(sql, /originating_command_ref/u);
  assert.match(sql, /party_activity_series_one_nonterminal_uq/u);
  assert.doesNotMatch(sql, /CREATE TABLE party_runtime\.party_standalone/u);
  assert.match(sql, /ALTER TABLE party_runtime\.party_action_step_runs/u);
  assert.match(sql, /action_scope IN \('route_step','standalone'\)/u);
  assert.match(sql, /semantic_command_snapshot/u);
});

test('011 replaces legacy ResourceBinding identity and keeps unit registry explicit', () => {
  assert.match(sql, /'required_tool'/u);
  assert.match(sql, /'reserved_input'/u);
  assert.match(sql, /'consumable_input'/u);
  assert.match(sql, /'output_target'/u);
  assert.match(sql, /consumption_policy_ref/u);
  assert.match(sql, /state_version/u);
  assert.doesNotMatch(sql, /ADD COLUMN unit_id/u);
});

test('011 preserves transport controls without a placement cascade', () => {
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS party_entity_controls_party_id_entity_kind_entity_id_fkey/u
  );
  assert.match(sql, /transport_root_location_required/u);
  assert.match(sql, /transport_mooring_location_mismatch/u);
  assert.match(sql, /transport_transit_placement_forbidden/u);
});

test('011 reuses committed state for save and adds only evidence-backed projections', () => {
  assert.doesNotMatch(sql, /party_save_checkpoints/u);
  for (const table of [
    'party_actor_profile_bindings',
    'party_actor_body_states',
    'party_actor_active_conditions',
    'party_resource_nodes',
    'party_transports',
    'party_actor_relations',
    'party_check_resolutions',
    'party_actor_npc_interactions',
    'party_actor_npc_interaction_summaries'
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE party_runtime\\.${table}`, 'u'));
  }
});
