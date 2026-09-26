import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runPlanModeFixture } from '../src/wk-audit-plan-harness.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const FIX = join(HERE, 'fixtures/wk-audit-plan');

test('plan-mode harness enforces access gates without LLM/encoder', async () => {
  const results = await runPlanModeFixture({
    rootDir: ROOT,
    situationsPath: join(FIX, 'situations.jsonl'),
    plansPath: join(FIX, 'plans.jsonl')
  });
  assert.equal(results.length, 3);
  const byId = Object.fromEntries(results.map((row) => [row.id, row]));
  assert.equal(byId['plan-access-dio'].claim_refs
    .includes('claim:ordinary-life-smith-anvil-hammer-tongs'), false);
  assert.equal(byId['plan-access-role'].claim_refs
    .includes('claim:population-bark-bast'), false);
  assert.equal(byId['plan-semantic-ok'].claim_refs
    .includes('claim:ordinary-life-smith-anvil-hammer-tongs'), true);
});
