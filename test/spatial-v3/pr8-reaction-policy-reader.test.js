import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  buildNpcReactionPolicySnapshotFromAuthoringRow,
  createSpatialV3WorldBaseReader
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const DATASET =
  'data/world-catalogs/novgorod/temporal-v4/datasets/npc_temporal_profiles_policies.json';
const recordId =
  'record:npc_temporal_profiles_policies:reaction_signal_policy_v1';

async function approvedRow() {
  const records = JSON.parse(await readFile(DATASET, 'utf8'));
  const record = records.find((candidate) => candidate.record_id === recordId);
  assert(record, 'approved reaction policy record is required');
  const row = {
    record_id: record.record_id,
    family_id: record.family_id,
    record_kind: record.record_kind,
    record_version: record.version,
    applicability: record.applicability,
    status: record.status,
    provenance_refs: record.provenance_refs,
    normalized_reference_ids: record.normalized_reference_ids,
    source_history_refs: record.source_history_refs,
    payload: record.payload
  };
  return {
    ...row,
    canonical_digest:
      computeSpatialV3CanonicalDigest(row).replace('sha256:', '')
  };
}

test('approved Temporal reaction record projects to one closed formal policy snapshot', async () => {
  const row = await approvedRow();
  const result = buildNpcReactionPolicySnapshotFromAuthoringRow(row);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(
    validateSpatialV3Contract('npc_reaction_policy_snapshot', result.value),
    []
  );
  assert.deepEqual(
    result.value.option_rules.map(({ option_id }) => option_id),
    ['investigate_signal', 'report_to_authority', 'seek_safety']
  );
  assert.deepEqual(
    result.value.approved_command_records.map(
      ({ command_ref }) => command_ref.entity_ref.entity_id
    ),
    [
      'npc_investigate_signal',
      'npc_report_to_authority',
      'npc_seek_safety'
    ]
  );
  assert.equal(
    result.value.source_record_ref.entity_ref.entity_id,
    recordId
  );
  assert.equal(
    result.value.dependency_pins.pins.some(
      ({ dependency_role }) => dependency_role === 'source_dependency'
    ),
    true
  );
});

test('world-base reader requires the exact approved record version and digest', async () => {
  const row = await approvedRow();
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [structuredClone(row)] };
    }
  });

  const result = await reader.readNpcReactionPolicy({
    id: row.record_id,
    version: row.record_version,
    canonical_digest: row.canonical_digest
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(
    calls[0].sql,
    /FROM world_base\.temporal_authoring_records/u
  );
  assert.match(calls[0].sql, /record_kind='npc_reaction_policy'/u);
  assert.deepEqual(calls[0].params, [
    row.record_id,
    row.record_version,
    row.canonical_digest
  ]);
});

test('reaction policy reader fails closed on drift, missing rows and unregistered handlers', async () => {
  const row = await approvedRow();
  const corrupted = structuredClone(row);
  corrupted.payload.command_records[0].handler_id = 'unregistered.handler';
  assert.equal(
    buildNpcReactionPolicySnapshotFromAuthoringRow(corrupted).error.code,
    'npc_decision_policy_gap'
  );

  const missing = createSpatialV3WorldBaseReader({
    query: async () => ({ rows: [] })
  });
  assert.equal(
    (await missing.readNpcReactionPolicy({
      id: row.record_id,
      version: row.record_version,
      canonical_digest: row.canonical_digest
    })).error.code,
    'npc_decision_policy_gap'
  );

  const drifted = createSpatialV3WorldBaseReader({
    query: async () => ({ rows: [{ ...row, canonical_digest: '0'.repeat(64) }] })
  });
  assert.equal(
    (await drifted.readNpcReactionPolicy({
      id: row.record_id,
      version: row.record_version,
      canonical_digest: row.canonical_digest
    })).error.code,
    'npc_decision_policy_gap'
  );
});
