import assert from 'node:assert/strict';
import test from 'node:test';

import { applySupplementalCatalogBundle, supplementalDigest } from '../src/index.js';

const manifest = {
  schema_version: 1,
  bundle_id: 'draft-test',
  world_revision_id: 'revision',
  approval: 'draft',
  deletion_policy: 'none',
  provenance: { source_ids: ['source'], effective_at: '1230-01-01' },
  datasets: []
};

test('supplemental PostgreSQL executor commits a validated dependency plan and audits readback', async () => {
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async insert(table, records) { calls.push(`insert:${table}:${records.length}`); },
    async readback() { return { record_count: 0, payload_digest: supplementalDigest([]) }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }
  };
  const result = await applySupplementalCatalogBundle({ manifest, recordsByTable: {}, adapter });
  assert.equal(result.applied, true);
  assert.deepEqual(calls, ['begin', 'commit']);
});

test('supplemental PostgreSQL executor rolls back a failed readback audit', async () => {
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async insert() { calls.push('insert'); },
    async readback() { return { record_count: 1, payload_digest: 'wrong' }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }
  };
  const oneDataset = { ...manifest, datasets: [{ table: 'source_records', path: 'source.json', schema_id: 'rus.source_records.v1', record_count: 0, sha256: supplementalDigest([]), dependency_order: 0 }] };
  await assert.rejects(() => applySupplementalCatalogBundle({ manifest: oneDataset, recordsByTable: { source_records: [] }, adapter }), /SUPPLEMENTAL_READBACK_MISMATCH:source_records/u);
  assert.deepEqual(calls, ['begin', 'insert', 'rollback']);
});

test('supplemental PostgreSQL executor can repeat a complete validated apply without changing its plan', async () => {
  const calls = [];
  const source = { id: 'src', title: 'Source', source_type: 'project_note', summary: 'Draft source', status: 'draft', confidence: 'medium' };
  const sourceManifest = { ...manifest, datasets: [{ table: 'source_records', path: 'source.json', schema_id: 'rus.source_records.v1', record_count: 1, sha256: supplementalDigest([source]), dependency_order: 0 }] };
  const adapter = {
    async begin() { calls.push('begin'); }, async insert() { calls.push('insert'); },
    async readback() { return { record_count: 1, payload_digest: supplementalDigest([source]) }; },
    async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); }
  };
  const first = await applySupplementalCatalogBundle({ manifest: sourceManifest, recordsByTable: { source_records: [source] }, adapter });
  const repeated = await applySupplementalCatalogBundle({ manifest: sourceManifest, recordsByTable: { source_records: [source] }, adapter });
  assert.deepEqual(first.tables, repeated.tables);
  assert.deepEqual(calls, ['begin', 'insert', 'commit', 'begin', 'insert', 'commit']);
});
