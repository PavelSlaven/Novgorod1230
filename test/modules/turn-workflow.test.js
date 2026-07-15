import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { TURN_WORKFLOW_STAGE_PLAN, runTurnWorkflow } from '@rus/turn';
import { createLegacyTurnCompatibilityAdapter } from '@rus/turn/compat';

test('turn package publishes one modular workflow entry and 14 isolated blocks', () => {
  assert.equal(typeof runTurnWorkflow, 'function');
  assert.equal(typeof createLegacyTurnCompatibilityAdapter, 'function');
  assert.equal(TURN_WORKFLOW_STAGE_PLAN.length, 14);
});

test('turn production sources contain no legacy, provider or database imports', async () => {
  for (const file of ['index.js', 'orchestrator.js', 'workflow-stages.js', 'compat/index.js']) {
    const source = await readFile(`packages/turn/src/${file}`, 'utf8');
    assert.doesNotMatch(source, /legacy\//u);
    assert.doesNotMatch(source, /provider\.js/u);
    assert.doesNotMatch(source, /from ['"]pg['"]/u);
  }
});
