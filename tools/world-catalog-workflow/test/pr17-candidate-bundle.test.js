import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { applyPr17ItemContainerCandidateBundle, digestValue, validatePr17ItemContainerCandidateBundle } from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');

test('generated PR17 candidate validates exact manifests, JSON schemas, references and reports', () => {
  const input = loadCandidate();
  const result = validatePr17ItemContainerCandidateBundle(input);
  assert.deepEqual(result.errors, []);
  assert.equal(result.pass, true);
});

test('candidate validation rejects manifest count and digest tampering', () => {
  const input = loadCandidate();
  input.manifest.datasets.find((dataset) => dataset.table === 'item_templates').record_count -= 1;
  input.records_by_table.container_templates[0].capacity += 1;
  const result = validatePr17ItemContainerCandidateBundle(input);
  assert.ok(result.errors.includes('CANDIDATE_RECORD_COUNT_MISMATCH:item_templates'));
  assert.ok(result.errors.includes('CANDIDATE_DATASET_DIGEST_MISMATCH:container_templates'));
});

test('candidate importer exposes a read-only dry-run and commits exact readback', async () => {
  const input = loadCandidate();
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async insert(table, rows) { calls.push(`insert:${table}:${rows.length}`); },
    async readback(_table, rows) { return { record_count: rows.length, payload_digest: digestValue(rows) }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }
  };
  const dryRun = await applyPr17ItemContainerCandidateBundle({ ...input, mode: 'dry-run', adapter });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.activation_performed, false);
  assert.deepEqual(calls, []);
  const applied = await applyPr17ItemContainerCandidateBundle({ ...input, mode: 'apply', adapter });
  assert.equal(applied.applied, true);
  assert.equal(applied.candidate_digest, input.manifest.candidate_digest);
  assert.equal(calls.at(0), 'begin');
  assert.equal(calls.at(-1), 'commit');
  assert.equal(calls.filter((call) => call.startsWith('insert:')).length, input.manifest.datasets.length);
});

test('candidate importer rolls back exact-readback mismatch', async () => {
  const input = loadCandidate();
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async insert() { calls.push('insert'); },
    async readback() { return { record_count: 0, payload_digest: digestValue([]) }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }
  };
  await assert.rejects(() => applyPr17ItemContainerCandidateBundle({ ...input, mode: 'apply', adapter }), /PR17_READBACK_MISMATCH/u);
  assert.equal(calls.at(-1), 'rollback');
  assert.ok(!calls.includes('commit'));
});

function loadCandidate() {
  const manifest = readJson('manifest.json');
  const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const compilation = readJson('reports/COMPILATION_REPORT.json');
  const graphNodeIds = compilation.graph_node_status_transitions.map((transition) => transition.graph_node_id);
  return {
    manifest,
    records_by_table: records,
    reports: { compilation, editorial_readiness: readJson('reports/EDITORIAL_READINESS_REPORT.json'), g4_coverage: readJson('reports/G4_COVERAGE_REPORT.json') },
    external_ids: { regions: ['region_novgorod_land'], world_revisions: ['novgorod_1230_research_revision_001'], graph_nodes: graphNodeIds, region_social_roles: ['nov_role_guard'] }
  };
}
function readJson(path) { return JSON.parse(readFileSync(resolve(candidateRoot, path), 'utf8')); }
