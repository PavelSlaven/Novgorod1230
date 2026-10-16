import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovedCanonicalNaturalInitialRule } from '@rus/runtime-catalog';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';

test('approved exact canonical initial rule projects without manufacturing a connection binding', async () => {
  const { input, initialRule } = await approvedNaturalPerceptionFixture({ canonical: true });
  const ref = input.currentFacts.canonical_source_binding.rule_ref;
  const result = loadApprovedCanonicalNaturalInitialRule({ ...input, rule_ref: ref });
  assert.equal(result.rule.id, initialRule.rule.id);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(input.currentFacts.source_bindings, []);
  assert.equal(prepareG4NaturalScenePerceptionInput(input).observer.position_id, 'position:shore');
  assert.throws(() => loadApprovedCanonicalNaturalInitialRule({ ...input, rule_ref: { ...ref, version: 2 } }), { code: 'G4_NATURAL_INITIAL_RULE_INVALID' });
});

test('canonical source binding cannot replace the current initial owner guard or escape its scene', async () => {
  for (const mutate of [
    (v) => { delete v.currentFacts.canonical_source_binding; },
    (v) => { v.currentFacts.canonical_source_binding.verified = false; },
    (v) => { v.currentFacts.canonical_source_binding.initial_snapshot_identity.state_version = 1; },
    (v) => { v.currentFacts.canonical_source_binding.initial_request_identity.scenario_id = 'other'; },
    (v) => { v.currentFacts.observer.position_id = 'position:inside'; },
    (v) => { v.currentFacts.scene.site_id = 'other'; }
  ]) {
    const { input } = await approvedNaturalPerceptionFixture({ canonical: true }); mutate(input);
    assert.throws(() => prepareG4NaturalScenePerceptionInput(input), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
});
