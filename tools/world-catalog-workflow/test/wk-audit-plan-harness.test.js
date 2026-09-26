import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runPlanModeFixture } from '../src/wk-audit-plan-harness.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const FIX = join(HERE, 'fixtures/wk-audit-plan');

test('plan-mode harness enforces access/date gates without LLM/encoder', async () => {
  const results = await runPlanModeFixture({
    rootDir: ROOT,
    situationsPath: join(FIX, 'situations.jsonl'),
    plansPath: join(FIX, 'plans.jsonl')
  });
  assert.equal(results.length, 5);
  const byId = Object.fromEntries(results.map((row) => [row.id, row]));
  assert.equal(byId['plan-access-dio'].claim_refs
    .includes('claim:ordinary-life-smith-anvil-hammer-tongs'), false);
  assert.equal(byId['plan-access-role'].claim_refs
    .includes('claim:population-bark-bast'), false);
  // Planner focus may still name the cut claim; Core must exclude it.
  assert.equal(byId['plan-access-role'].focus_refs
    .includes('claim:population-bark-bast'), true);
  assert.equal(byId['plan-semantic-ok'].claim_refs
    .includes('claim:ordinary-life-smith-anvil-hammer-tongs'), true);
  assert.equal(byId['plan-future-date'].claim_refs
    .includes('claim:candidate-gramota199-onfim-instructional-text'), false);
  assert.equal(byId['plan-npc-dio'].claim_refs
    .includes('claim:ordinary-life-smith-anvil-hammer-tongs'), true);
  assert.ok(Array.isArray(byId['plan-npc-dio'].disputes));
});
