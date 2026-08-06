import assert from 'node:assert/strict';
import test from 'node:test';
import { selectApplicableNpcActivityExecution } from '../src/index.js';

const wait = {
  execution_binding_id: 'wait', activity_profile_ref: 'wait-profile',
  movement_ref: null, property_transition_refs: []
};
const carry = {
  execution_binding_id: 'carry', activity_profile_ref: 'carry-profile',
  movement_ref: 'inside-to-river', property_transition_refs: ['bag-to-river']
};
const input = {
  activity_profiles: [
    { profile_id: 'wait-profile', activity_type: 'autonomous_wait',
      resource_refs: [] },
    { profile_id: 'carry-profile',
      activity_type: 'autonomous_local_property_transfer',
      resource_refs: ['road-bag'] }
  ],
  execution_bindings: [wait, carry],
  movement_bindings: [{ transition_id: 'inside-to-river',
    destination_zone_ref: 'river' }],
  property_transition_profiles: [{ transition_profile_id: 'bag-to-river',
    subject_ref: 'road-bag', writes: { zone_ref: 'river' } }]
};

test('NPC activity owner selects carry only from explicit real refs', () => {
  const result = selectApplicableNpcActivityExecution({
    ...input,
    operation: { op: 'request_activity', activity_kind: 'carry',
      target_refs: ['road-bag', 'river'] }
  });
  assert.equal(result.pass, true);
  assert.equal(result.execution_binding.execution_binding_id, 'carry');
});

test('NPC activity owner rejects carry without its destination ref', () => {
  const result = selectApplicableNpcActivityExecution({
    ...input,
    operation: { op: 'request_activity', activity_kind: 'carry',
      target_refs: ['road-bag'] }
  });
  assert.equal(result.pass, false);
  assert.equal(result.errors[0].code,
    'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE');
});
