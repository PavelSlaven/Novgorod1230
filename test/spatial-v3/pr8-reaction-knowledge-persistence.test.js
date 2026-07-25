import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql',
  import.meta.url
);
const pendingDecisionMigrationUrl = new URL(
  '../../schemas/party-db/010_party_runtime_pr8_reaction_options.sql',
  import.meta.url
);
const targetLoaderUrl = new URL(
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js',
  import.meta.url
);
const productionLoaderUrl = new URL(
  '../../apps/game-server/src/infrastructure/postgres/migrations.js',
  import.meta.url
);

test('migration 009 maps perception replay, reaction consequence and knowledge merge without a duplicate knowledge store', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(
    sql,
    /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu,
    'target migrations are transaction-neutral because the chain loader owns atomicity'
  );
  assert.match(sql, /DROP CONSTRAINT IF EXISTS party_perception_records_result_kind_check/u);
  assert.match(
    sql,
    /result_kind IN \(\s*'not_perceived',\s*'perceived_unidentified',\s*'perceived_partial',\s*'recognized',\s*'misinterpreted'\s*\)/u
  );
  for (const table of [
    'party_perception_replay_evidence',
    'party_npc_reaction_consequences',
    'party_npc_knowledge_merge_states',
    'party_npc_knowledge_merge_results'
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS party_runtime\\.${table}\\b`, 'u'),
      table
    );
  }
  assert.match(sql, /ALTER TABLE party_runtime\.party_npc_knowledge/u);
  assert.match(sql, /REFERENCES party_runtime\.party_v3_change_sets\(party_id, id\)/u);
  assert.match(
    sql,
    /REFERENCES party_runtime\.party_perception_records\(party_id, perception_id\)/u
  );
  assert.match(
    sql,
    /REFERENCES party_runtime\.party_npc_decision_traces\(party_id, request_id\)/u
  );
  assert.doesNotMatch(sql, /REFERENCES party_runtime\.party_change_sets/u);
  for (const column of [
    'target_contract_version text',
    'knowledge_ref_kind text',
    'knowledge_classification text',
    'source_perception_id text',
    'proposal_id text',
    'merge_state_version bigint',
    'result_digest text',
    'dependency_pins jsonb',
    'updated_change_set_id text'
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'u'), column);
  }
  assert.match(sql, /target_contract_version IS NULL/u);
  assert.match(sql, /target_contract_version = '4\.4\.0-target\.1'/u);
  assert.match(sql, /knowledge_classification IN \('fact','hypothesis'\)/u);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS party_runtime\.party_npc_knowledge_v/u);
  assert.doesNotMatch(sql, /DEFAULT 'fact'/u);
});

test('target loader advances through 010 while production loader remains 001-only', async () => {
  const target = await readFile(targetLoaderUrl, 'utf8');
  const production = await readFile(productionLoaderUrl, 'utf8');
  assert.match(
    target,
    /'008_party_runtime_pr8_first_entry\.sql', '009_party_runtime_pr8_reaction_knowledge\.sql', '010_party_runtime_pr8_reaction_options\.sql'/u
  );
  assert.match(
    production,
    /const RUNTIME_MIGRATIONS = Object\.freeze\(\[PARTY_RUNTIME_V2_DDL\]\)/u
  );
  assert.doesNotMatch(production, /spatial-v3-target-migrations|0(?:0[2-9]|10)_party_runtime/u);
});

test('migration 010 persists immutable reaction option proposals without reusing v2 decision requests', async () => {
  const sql = await readFile(pendingDecisionMigrationUrl, 'utf8');
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS party_runtime\.party_npc_reaction_option_proposals/u
  );
  for (const column of [
    'request_id text PRIMARY KEY',
    'source_perception_id text NOT NULL',
    'state_version bigint NOT NULL',
    'options_digest text NOT NULL',
    'proposal jsonb NOT NULL',
    'canonical_digest text NOT NULL',
    'idempotency_key text NOT NULL',
    'change_set_id text NOT NULL'
  ]) {
    assert.match(sql, new RegExp(column, 'u'), column);
  }
  assert.match(
    sql,
    /REFERENCES party_runtime\.party_perception_records\(party_id, perception_id\)/u
  );
  assert.match(
    sql,
    /REFERENCES party_runtime\.party_v3_change_sets\(party_id, id\)/u
  );
  assert.match(sql, /EXECUTE FUNCTION party_runtime\.temporal_append_only\(\)/u);
  assert.doesNotMatch(sql, /party_runtime\.party_decision_requests/u);
  assert.doesNotMatch(sql, /TIMESTAMPTZ/u);
});
