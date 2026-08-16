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
