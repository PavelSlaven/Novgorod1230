import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTsv, projectLegacyG1Rows, buildG1WorkQueue, validateG1Mask } from '../src/index.js';

const fixturePath = new URL('./fixtures/novgorod-g1-v6.tsv', import.meta.url);

test('legacy v6 fixture is projected without semantic invention and ordered deterministically', async () => {
  const rows = parseTsv(await readFile(fixturePath, 'utf8'));
  const cells = projectLegacyG1Rows(rows);
  assert.equal(cells.length, 70);
  assert.equal(cells.every((cell) => cell.control_status === null), true);
  assert.equal(cells.every((cell) => cell.playability_status === null), true);
  assert.equal(cells.every((cell) => cell.evidence_status === null), true);
  assert.equal(cells.every((cell) => typeof cell.legacy_evidence_status === 'string'), true);
  const revision = { map_revision_id: 'novgorod_1230_research_revision_001', region_id: 'region_novgorod_land', g1_cell_size_km: 32 };
  const report = validateG1Mask(cells, revision);
  assert.equal(report.ok, false);
  assert.equal(report.errors.filter((item) => item.includes('control_status')).length, 70);
  assert.equal(report.errors.filter((item) => item.includes('evidence_status')).length, 70);
  const queue = buildG1WorkQueue(cells, revision, { allowIncomplete: true });
  assert.equal(queue.entries.length, 70);
  assert.equal(queue.entries[0].g1_id, 'gn_nov_g1_00_06');
  assert.equal(queue.entries[0].work_status, 'blocked');
  assert.ok(queue.entries[0].blocking_reasons.includes('missing_control_status'));
  assert.ok(queue.entries[0].blocking_reasons.includes('missing_evidence_status'));
  assert.ok(queue.entries[0].blocking_reasons.includes('missing_land_fraction'));
  assert.ok(queue.entries[0].blocking_reasons.includes('missing_water_fraction'));
  assert.equal(queue.entries[0].cell_class, 'dense_river_road');
});
