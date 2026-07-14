import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildCutoverProfile, loadCutoverPlan, validateCutoverPlan } from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

test('cutover plan contains the normative 13 ordered steps and all gates', async () => {
  const plan = await loadCutoverPlan(root);
  assert.equal(validateCutoverPlan(plan), plan);
  assert.equal(plan.steps.length, 13);
  assert.deepEqual(plan.steps.map((step) => step.id), Array.from({ length: 13 }, (_, index) => index + 1));
  assert.deepEqual(plan.required_gates, ['smoke', 'shadow', 'db_dry_run', 'diagnostics', 'rollback']);
});

test('profiles are cumulative and modular route is not default before game-web', async () => {
  const plan = await loadCutoverPlan(root);
  const step11 = buildCutoverProfile(plan, 11);
  assert.equal(step11.RUS_GAME_SERVER_MODULES_ENABLED, 'true');
  assert.equal(step11.RUS_UI_MODULES_ENABLED, 'false');
  assert.equal(step11.RUS_RUNTIME_ROUTE, 'legacy');
  const step12 = buildCutoverProfile(plan, 12, { RUS_RUNTIME_BINDINGS_MODULE: './bindings.js' });
  assert.equal(step12.RUS_UI_MODULES_ENABLED, 'true');
  assert.equal(step12.RUS_RUNTIME_ROUTE, 'modular');
  assert.equal(step12.RUS_RUNTIME_BINDINGS_MODULE, './bindings.js');
});
