import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  READINESS_MANIFEST_PATH,
  validateFirstPlayableReadiness
} from '../../tools/spatial-v3/lower-dvina-first-playable-readiness.mjs';

async function manifest() {
  return JSON.parse(await readFile(READINESS_MANIFEST_PATH, 'utf8'));
}

test('first-playable readiness keeps local and boundary capability gates independent', async () => {
  const input = await manifest();
  const result = await validateFirstPlayableReadiness(input);

  assert.equal(result.valid, true);
  assert.equal(result.capability_gates.local_scene.ready, true);
  assert.equal(result.capability_gates.boundary_crossing.ready, false);
  assert.ok(!result.capability_gates.local_scene.blocking_gaps.includes(
    'approved_item_container_promotion_gap'
  ));
  assert.ok(result.capability_gates.boundary_crossing.blocking_gaps.includes(
    'approved_directed_segment_gap'
  ));
});

test('first-playable readiness uses typed scope keys and fails closed for empty candidates', async () => {
  const input = await manifest();
  input.scopes[0].scope_key = 'lower_dvina_boatman';
  input.scopes[0].compatible_tuple_count = 0;
  input.scopes[0].blocking_gaps = [];

  const result = await validateFirstPlayableReadiness(input);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ code }) => code === 'readiness_typed_scope_key_invalid'));
  assert.ok(result.errors.some(({ code }) => code === 'readiness_empty_candidate_set_without_gap'));
});

test('first-playable readiness pins check identity to the canonical execution owner', async () => {
  const result = await validateFirstPlayableReadiness(await manifest());

  assert.deepEqual(result.check_identity, {
    immediate_action: 'action_run_id',
    timed_activity: 'activity_execution_id+attempt_ordinal',
    traversal: 'traversal_interval_result_id'
  });
});
