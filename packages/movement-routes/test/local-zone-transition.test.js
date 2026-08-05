import test from 'node:test';
import assert from 'node:assert/strict';
import { planApprovedLocalZoneTransition } from '../src/index.js';

const binding = {
  transition_id: 'storehouse-to-river',
  schema: 'rus.trace_local_zone_transition.v1',
  version: 1,
  location_ref: 'storehouse',
  source_zone_candidates: ['inside', 'yard'],
  destination_zone_ref: 'river',
  admitted_subject_classes: ['actor', 'container'],
  duration_minutes: 5,
  elapsed_accounting: { parent_execution_roles: {
    move_bag: { role: 'root_interval', clock_write: 'single' }
  } },
  terminal_outcome: 'same_materialized_location_new_zone'
};

test('approved local-zone owner returns one exact movement proposal', () => {
  const result = planApprovedLocalZoneTransition({
    expected_state_version: 3,
    state_version: 3,
    parent_execution_ref: 'move_bag',
    transition_binding: binding,
    actor: { actor_id: 'zhdanko', location_ref: 'storehouse',
      zone_ref: 'inside' }
  });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.owner, '@rus/movement-routes');
  assert.equal(result.proposal.destination_zone_ref, 'river');
  assert.deepEqual(result.proposal.exact_elapsed.exact_minutes,
    { numerator: '5', denominator: '1' });
});

test('approved local-zone owner rejects stale and mismatched source state', () => {
  assert.equal(planApprovedLocalZoneTransition({
    expected_state_version: 2, state_version: 3
  }).errors[0].code, 'STATE_VERSION_MISMATCH');
  assert.equal(planApprovedLocalZoneTransition({
    expected_state_version: 3,
    state_version: 3,
    parent_execution_ref: 'move_bag',
    transition_binding: binding,
    actor: { actor_id: 'zhdanko', location_ref: 'storehouse',
      zone_ref: 'unknown' }
  }).errors[0].code, 'APPROVED_LOCAL_TRANSITION_SOURCE_MISMATCH');
});
