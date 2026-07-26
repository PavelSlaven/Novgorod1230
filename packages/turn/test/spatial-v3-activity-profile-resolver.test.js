import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveApprovedActivityProfile
} from '../src/spatial-v3-activity-profile-resolver.js';

const profile = (id, overrides = {}) => ({
  activity_profile_id: id,
  status: 'approved',
  category: 'conversation',
  priority: 100,
  applicability: { addressed_scene_npc_required: true },
  completion_model: 'fixed_exact',
  fixed_duration_minutes: 5,
  ...overrides
});
const context = {
  category: 'conversation',
  addressed_scene_npc_required: true
};

test('resolver returns one exact approved ActivityProfile', () => {
  const result = resolveApprovedActivityProfile({
    profiles: [profile('talk-v1')],
    context
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile.activity_profile_id, 'talk-v1');
});

test('missing and ambiguous policy fail before execution or mutation', () => {
  const missing = resolveApprovedActivityProfile({ profiles: [], context });
  const ambiguous = resolveApprovedActivityProfile({
    profiles: [profile('talk-a'), profile('talk-b')],
    context
  });

  assert.equal(missing.code, 'activity_profile_gap');
  assert.equal(missing.execution_created, false);
  assert.equal(ambiguous.code, 'activity_policy_gap');
  assert.equal(ambiguous.reason, 'ambiguous_most_specific_profile');
  assert.equal(ambiguous.elapsed_minutes, 0);
  assert.deepEqual(ambiguous.mutations, []);
});

test('multiple profiles require an exact approved bounded-decision policy', () => {
  const result = resolveApprovedActivityProfile({
    profiles: [profile('talk-a'), profile('talk-b')],
    context,
    boundedDecisionPolicies: [{
      policy_id: 'choose-talk',
      status: 'approved',
      category: 'conversation',
      candidate_profile_ids: ['talk-b', 'talk-a']
    }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.resolution_kind, 'bounded_decision');
  assert.equal(result.bounded_decision_policy.policy_id, 'choose-talk');
});
