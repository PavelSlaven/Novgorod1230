import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessFirstPlayableContent
} from '../../tools/spatial-v3/lower-dvina-first-playable-content.mjs';

test('first playable content has non-empty compatible PC and NPC tuples', async () => {
  const assessment = await assessFirstPlayableContent();

  assert.equal(assessment.valid, true, JSON.stringify(assessment.errors));
  assert.equal(assessment.manifest.candidate_sets.player_boatman.compatible_tuple_count, 2);
  assert.equal(assessment.manifest.candidate_sets.scene_fisher.compatible_tuple_count, 3);
});

test('global activity resolver produces one approved profile for every local context', async () => {
  const assessment = await assessFirstPlayableContent();

  for (const resolution of Object.values(
    assessment.manifest.activity_profile_resolution
  )) {
    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.candidate_count, 1);
  }
});

test('local readiness is independent from typed boundary gaps', async () => {
  const assessment = await assessFirstPlayableContent();

  assert.deepEqual(
    assessment.manifest.capabilities.boundary_crossing.blocking_gaps,
    [
      'approved_directed_segments_missing',
      'approved_boundary_check_policy_missing',
      'approved_boundary_risk_policy_missing',
      'approved_boundary_consequence_policy_missing'
    ]
  );
  assert.equal(assessment.manifest.fallback_policy, 'forbidden');
  assert.equal(assessment.manifest.llm_repair, 'forbidden');
});
