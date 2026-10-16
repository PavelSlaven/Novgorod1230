import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('021 stores one closed ordinary aggregate for each exact normalized party scope', async () => {
  const ddl = await readFile('schemas/party-db/021_party_runtime_ordinary_materialization.sql', 'utf8');
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS party_runtime\.party_ordinary_materialization_aggregates/u);
  assert.match(ddl, /scope_kind IN \('g6', 'scene_position', 'container', 'source'\)/u);
  assert.match(ddl, /PRIMARY KEY \(party_id, scope_kind, scope_id\)/u);
  assert.match(ddl, /REFERENCES party_runtime\.parties\(party_id\) ON DELETE CASCADE/u);
  assert.match(ddl, /scope_id !~ '\^\[\[:space:\]\]\|\[\[:space:\]\]\$'/u);
  assert.match(ddl, /scope_id !~ '\[\[:cntrl:\]\]'/u);
  assert.match(ddl, /state_version BIGINT NOT NULL CHECK \(state_version >= 0\)/u);
  assert.match(ddl, /aggregate_payload JSONB NOT NULL/u);
  assert.match(ddl, /jsonb_typeof\(aggregate_payload\) = 'object'/u);
  assert.doesNotMatch(ddl, /CREATE TABLE[^;]*(?:events|journal)/isu);
});

test('037 extends ordinary scope_kind with g5 and adds weather log', async () => {
  const ddl = await readFile('schemas/party-db/037_party_runtime_m2c_presence_routines.sql', 'utf8');
  assert.match(ddl, /candidate_profile_refs JSONB NOT NULL DEFAULT '\[\]'::jsonb/u);
  assert.match(ddl, /scope_kind IN \('g5', 'g6', 'scene_position', 'container', 'source'\)/u);
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS party_runtime\.party_environment_transition_log/u);
  assert.match(ddl, /transition_kind TEXT NOT NULL CHECK \(transition_kind = 'weather'\)/u);
  assert.match(ddl, /PRIMARY KEY \(party_id, g0_zone_ref, interval_index_6h\)/u);
  assert.match(ddl, /EXECUTE FUNCTION party_runtime\.temporal_append_only\(\)/u);
  assert.match(ddl, /candidate_profile_refs<>OLD\.candidate_profile_refs/u);
  assert.match(ddl, /interval_index_6h numeric NOT NULL/u);
  assert.match(ddl, /game_timestamp_parts_valid/u);
});

test('038 permits factual placements under location_gap and forbids placements under offstage_away', async () => {
  const ddl = await readFile('schemas/party-db/038_party_runtime_npc_seasonal_presence.sql', 'utf8');
  assert.match(ddl, /CREATE OR REPLACE FUNCTION party_runtime\.party_npc_schedule_party_reference_valid\(\)/u);
  assert.match(ddl, /position\.id=NEW\.current_position_node_id AND position\.party_id=NEW\.party_id/u);
  assert.match(ddl, /placement->>'kind'='prepared_scene'/u);
  assert.match(ddl, /placement->>'kind'='legacy_anchor'/u);
  assert.match(ddl, /presence_state = 'offstage_away'/u);
  assert.match(ddl, /presence_state = 'location_gap'/u);
  assert.match(ddl, /party_npc_schedule_placement_integrity\(\)/u);
  assert.match(ddl, /DROP TRIGGER IF EXISTS party_npc_schedule_placement_integrity_on_schedule ON party_runtime\.party_npc_spatial_schedules;\s+CREATE CONSTRAINT TRIGGER party_npc_schedule_placement_integrity_on_schedule/u);
  assert.match(ddl, /DROP TRIGGER IF EXISTS party_npc_schedule_placement_integrity_on_placement ON party_runtime\.entity_placements;\s+CREATE CONSTRAINT TRIGGER party_npc_schedule_placement_integrity_on_placement/u);
  assert.match(ddl, /DEFERRABLE INITIALLY DEFERRED/u);
  assert.match(ddl, /offstage NPC schedule requires no physical or deferred placement/u);
  assert.match(ddl, /NPC location gap position must match existing entity placement/u);
  assert.match(ddl, /before_profile IS DISTINCT FROM after_profile/u);
  assert.match(ddl, /schedule profile may change only with a pinned seasonal rule selection/u);
  assert.match(ddl, /npc\.party_id=NEW\.party_id AND npc\.npc_id=NEW\.npc_id/u);
  assert.match(ddl, /execution\.party_id=NEW\.party_id/u);
});
