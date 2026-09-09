import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildArchiveDispositions } from '../src/archive-dispositions.js';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { fileURLToPath } from 'node:url';

const inventoryUrl = new URL('../../../data/world-catalogs/novgorod/world-knowledge/archive-v1/staging/archive-inventory.json', import.meta.url);
const dispositionsUrl = new URL('../../../data/world-catalogs/novgorod/world-knowledge/archive-v1/archive-dispositions.json', import.meta.url);
const coverageUrl = new URL('../../../data/world-catalogs/novgorod/world-knowledge/archive-v1/coverage-matrix.json', import.meta.url);
const productionAuthoringUrl = new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/authoring.json', import.meta.url);

test('every archive file has exactly one final disposition', async () => {
  const inventory = JSON.parse(await readFile(inventoryUrl));
  const committed = JSON.parse(await readFile(dispositionsUrl));
  const generated = buildArchiveDispositions(inventory);
  assert.deepEqual(committed, generated);
  assert.equal(committed.file_count, 1497);
  assert.equal(committed.records.length, 1497);
  assert.equal(new Set(committed.records.map((record) => record.archive_relative_path)).size, 1497);
  assert.ok(committed.records.every((record) => !/pending|not_checked|not_reviewed|todo/iu.test(record.disposition)));
  assert.equal(committed.counts.unresolved_after_research, 0);
});

test('coverage cartography has every required axis and only final statuses', async () => {
  const matrix = JSON.parse(await readFile(coverageUrl));
  const authoring = await loadWorldKnowledgeAuthoringInput(fileURLToPath(productionAuthoringUrl));
  const claimRefs = new Set(authoring.claims.map((claim) => claim.claim_ref));
  const statuses = new Set(matrix.allowed_statuses);
  const required = ['domain', 'subdomain', 'family', 'time', 'region',
    'location', 'npc_role', 'material_resource', 'process',
    'player_interaction', 'knowledge_purpose', 'coverage_status',
    'criticality', 'evidence_quality'];
  assert.equal(matrix.schema, 'world_knowledge_coverage_matrix_v2');
  assert.ok(matrix.cells.length >= 25);
  assert.equal(new Set(matrix.cells.map((cell) => cell.cell_ref)).size,
    matrix.cells.length);
  for (const cell of matrix.cells) {
    assert.ok(required.every((key) => Object.hasOwn(cell, key)),
      `${cell.cell_ref} lacks a required coverage axis`);
    assert.ok(statuses.has(cell.coverage_status),
      `${cell.cell_ref} has a non-final status`);
    assert.ok(['P0', 'P1', 'P2', 'P3'].includes(cell.criticality));
    assert.ok(cell.claim_refs.every((claimRef) => claimRefs.has(claimRef)),
      `${cell.cell_ref} points outside the production pack`);
    if (['P0', 'P1'].includes(cell.criticality)) {
      assert.ok(['covered', 'not_applicable'].includes(cell.coverage_status),
        `${cell.cell_ref} is an unresolved readiness gap`);
    }
  }
});
