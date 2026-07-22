import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCompatibilityReport, compatibilityFixtures } from '../../tools/spatial-v3/red-contract-harness.mjs';

test('P27: v2/v3 compatibility boundary distinguishes coexistence from runtime mixing', async () => {
  const report = await collectCompatibilityReport();
  assert.equal(typeof report.validateRuntimeComposition, 'function', `missing target compatibility evaluator: ${report.artifact.path}`);
  for (const fixture of compatibilityFixtures) {
    assert.equal(
      report.validateRuntimeComposition(fixture.input).ok,
      fixture.valid,
      fixture.name
    );
  }
});
