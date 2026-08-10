import { deepFreeze } from '@rus/kernel';

/** Plans an approved visibility change without moving or re-owning an item. */
export function planApprovedItemVisibilityTransition(input = {}) {
  const transition = input.approved_transition;
  const source = input.source;
  const item = input.item;
  const subjectId = item?.item_id ?? item?.container_id;
  if (input.expected_state_version !== input.state_version) {
    return failed('STATE_VERSION_MISMATCH');
  }
  if (!transition
      || transition.schema
        !== 'rus.items_property.approved_transition_profile.v1'
      || transition.owner_change !== 'forbidden'
      || transition.contained_item_effect
        !== 'inherit_parent_container_position_holder_controller_and_visibility'
      || !transition.write_targets?.includes('item_visibility_state')
      || !subjectId
      || item.template_id !== transition.subject_ref) {
    return failed('APPROVED_ITEM_VISIBILITY_TRANSITION_INVALID');
  }
  const refs = input.resolved_actor_refs ?? {};
  const required = transition.requires;
  const writes = transition.writes;
  const holder = refs[required?.holder_ref];
  const controller = refs[required?.controller_ref];
  if (!holder || !controller
      || source?.location_ref !== required.location_ref
      || source.zone_ref !== required.zone_ref
      || source.holder_actor_id !== holder
      || source.controller_actor_id !== controller
      || writes.location_ref !== source.location_ref
      || writes.zone_ref !== source.zone_ref
      || typeof writes.visibility_state !== 'string'
      || writes.visibility_state.length === 0) {
    return failed('APPROVED_ITEM_VISIBILITY_TRANSITION_SOURCE_MISMATCH');
  }
  return deepFreeze({
    pass: true,
    proposal: {
      owner: '@rus/items-property',
      transition_profile_id: transition.transition_profile_id,
      item_id: subjectId,
      source: structuredClone(source),
      destination: {
        location_ref: source.location_ref,
        zone_ref: source.zone_ref,
        holder_actor_id: holder,
        controller_actor_id: controller,
        visibility_state: writes.visibility_state
      },
      owner_change: 'forbidden',
      contained_item_effect: transition.contained_item_effect
    },
    errors: []
  });
}

function failed(code) {
  return deepFreeze({
    pass: false,
    errors: [{ code, category: 'validation', retryable: false }]
  });
}
