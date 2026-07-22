import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('P12 V1.1 equivalence report proves semantic target rows, pins, profiles and routes are unchanged from V1', async () => {
  const report = JSON.parse(await readFile('data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1_EQUIVALENCE.json', 'utf8'));
  assert.equal(report.unchanged, true);
  assert.ok(report.row_count > 30);
  assert.ok(report.rows.every((row) => row.unchanged));
  assert.ok(report.rows.some((row) => row.path === 'target/canonical-spatial-nodes.json'));
  assert.ok(report.rows.some((row) => row.path === 'target/world-routes.json'));
  assert.ok(report.rows.some((row) => row.path === 'target/scene-materialization-profiles.json'));
});
