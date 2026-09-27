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
});
