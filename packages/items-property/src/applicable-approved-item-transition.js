import { deepFreeze } from '@rus/kernel';
import { planApprovedItemVisibilityTransition } from
  './approved-item-visibility-transition.js';
import { planApprovedItemZoneTransition } from
  './approved-item-zone-transition.js';

export function planApplicableApprovedItemTransition(input = {}) {
  if (!Array.isArray(input.approved_transitions)
      || typeof input.target_ref !== 'string'
      || input.target_ref.length === 0) {
    return failed('APPROVED_ITEM_TRANSITION_SELECTION_INVALID');
  }
  const matches = [];
  for (const transition of input.approved_transitions) {
    if (transitionTarget(transition) !== input.target_ref) continue;
    const planner = transition.write_targets?.includes('item_visibility_state')
      ? planApprovedItemVisibilityTransition
      : planApprovedItemZoneTransition;
    const result = planner({ ...input, approved_transition: transition });
    if (result.pass) matches.push(result.proposal);
  }
  if (matches.length !== 1) {
    return failed(matches.length === 0
      ? 'APPROVED_ITEM_TRANSITION_NOT_APPLICABLE'
      : 'APPROVED_ITEM_TRANSITION_AMBIGUOUS');
  }
  return deepFreeze({ pass: true, proposal: matches[0], errors: [] });
}

function transitionTarget(transition) {
  return transition?.writes?.zone_ref ?? transition?.writes?.location_ref;
}

function failed(code) {
  return deepFreeze({
    pass: false,
    errors: [{ code, category: 'validation', retryable: false }]
  });
}
