import { isDeepStrictEqual } from 'node:util';
import { actionProducedAccessState,
  actionProducedControllerPermitted,
  actionProducedControllerRef,
  actionProducedPlacementAccessible,
  validActionProducedAccessContainer } from
  './action-produced-contained-access.js';
import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';

const ROW_PIN_KEYS = [
  'role', 'item_id', 'item', 'placement', 'ownership', 'entity_snapshot',
  'finite_resource_row'
];
const PREPARED_ROW_PIN_KEYS = [...ROW_PIN_KEYS, 'prepared_ordinary'];
const PREPARED_ACTION_ROW_PIN_KEYS = [...ROW_PIN_KEYS, 'prepared_action'];
const CONTAINED_ROW_PIN_KEYS = [...ROW_PIN_KEYS, 'access_container'];
const ENTITY_KEYS = [
  'schema', 'commit_state', 'role', 'entity_ref', 'state_version',
  'lifecycle_state', 'access_state', 'holder_ref', 'controller_ref',
  'ownership_snapshot', 'finite_resource'
];
const RESOURCE_ROW_KEYS = [
  'resource_node_id', 'source_resource_ref', 'quantity_numerator',
  'quantity_denominator', 'quantity_unit_ref', 'lifecycle_state',
  'state_version', 'position_node_id', 'property_basis_ref'
];
export function validateActionProducedDestinationPin(pin) {
  if (pin === null) return null;
  const keys = ['schema', 'destination_kind', 'anchor_id', 'item_capacity',
    'used_item_ids'];
  if (!exact(pin, keys)
      || pin.schema !== 'action_production_output_destination_pin_v1'
      || pin.destination_kind !== 'party_current_anchor'
      || !text(pin.anchor_id) || !Number.isSafeInteger(pin.item_capacity)
      || pin.item_capacity < 0 || !Array.isArray(pin.used_item_ids)
      || pin.used_item_ids.some((itemId) => !text(itemId))
      || new Set(pin.used_item_ids).size !== pin.used_item_ids.length
      || pin.used_item_ids.length > pin.item_capacity) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return pin;
}

export function actionProducedDestinationFits(pin, sourceUpdates,
  resultItems) {
  const destination = validateActionProducedDestinationPin(pin);
  if (destination === null) return resultItems.length === 0;
  const retired = new Set(sourceUpdates.filter((update) =>
    update.after_item?.state?.lifecycle_status === 'retired')
    .map(({ item_id: itemId }) => itemId));
  const remaining = destination.used_item_ids.filter((itemId) =>
    !retired.has(itemId)).length;
  return remaining + resultItems.length <= destination.item_capacity;
}

export function actionProducedOutputPlacement(destinationPin) {
  const pin = validateActionProducedDestinationPin(destinationPin);
  if (pin === null) fail('ACTION_PRODUCED_DESTINATION_INVALID');
  return {
    anchor_id: pin.anchor_id, container_id: null,
    holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null
  };
}

export function actionProducedOwnerOutputDestination(destinationPin,
  actorRef) {
  if (destinationPin === null) return null;
  if (!text(actorRef)) fail('ACTION_PRODUCED_DESTINATION_INVALID');
  const placement = actionProducedOutputPlacement(destinationPin);
  return {
    schema: 'rus.items.action_produced_output_destination.v1',
    placement_kind: 'anchor', target_ref: placement.anchor_id,
    holder_ref: null, controller_ref: actorRef
  };
}

export function validateActionProducedRowPins(pins, role, actorRef,
  contextVersion, causalIdentity, accessAnchorId = null) {
  const seenItems = new Set();
  const seenResources = new Set();
  for (const pin of pins) {
    const prepared = Object.hasOwn(pin, 'prepared_ordinary')
      ? pin.prepared_ordinary : null;
    const preparedAction = Object.hasOwn(pin, 'prepared_action')
      ? pin.prepared_action : null;
    const accessContainer = Object.hasOwn(pin, 'access_container')
      ? pin.access_container : null;
    const exactPin = prepared !== null ? exact(pin, PREPARED_ROW_PIN_KEYS)
      : preparedAction !== null
        ? exact(pin, PREPARED_ACTION_ROW_PIN_KEYS)
      : accessContainer !== null ? exact(pin, CONTAINED_ROW_PIN_KEYS)
        : exact(pin, ROW_PIN_KEYS);
    if (!exactPin
        || prepared !== null && (!exact(prepared,
          ['schema', 'request_identity', 'root_turn_id',
            'step_index'])
          || prepared.schema
            !== 'action_production_prepared_ordinary_pin_v1'
          || !text(prepared.request_identity)
          || prepared.root_turn_id !== causalIdentity.root_turn_id
          || !Number.isSafeInteger(prepared.step_index)
          || prepared.step_index < 1
          || prepared.step_index >= causalIdentity.step_index
          || pin.item.state?.runtime_instance_mechanics_snapshot?.provenance
            ?.root_turn_id !== prepared.root_turn_id
          || pin.item.state?.runtime_instance_mechanics_snapshot?.provenance
            ?.step_index !== prepared.step_index)
        || preparedAction !== null && (!exact(preparedAction,
          ['schema', 'root_turn_id', 'step_index'])
          || preparedAction.schema
            !== 'action_production_prepared_action_pin_v1'
          || preparedAction.root_turn_id !== causalIdentity.root_turn_id
          || !Number.isSafeInteger(preparedAction.step_index)
          || preparedAction.step_index < 1
          || preparedAction.step_index >= causalIdentity.step_index)
        || pin.role !== role
        || !text(pin.item_id) || seenItems.has(pin.item_id)
        || pin.item?.item_id !== pin.item_id
        || accessContainer !== null
          && (!validActionProducedAccessContainer(accessContainer, actorRef,
            accessAnchorId)
            || pin.placement.container_id !== accessContainer.container_id)) {
      fail('ACTION_PRODUCED_PLAN_INVALID');
    }
    seenItems.add(pin.item_id);
    if (pin.finite_resource_row != null
        && (pin.finite_resource_row.position_node_id
          !== pin.item.state?.resource_position_node_id
          || pin.finite_resource_row.property_basis_ref
            !== pin.item.state?.property_state?.resource_property_basis_ref)) {
      fail('ACTION_PRODUCED_PLAN_INVALID');
    }
    const finite = finiteSnapshot(pin.finite_resource_row, pin.item_id,
      role, seenResources);
    const expected = expectedEntity(pin, role, actorRef, contextVersion,
      finite, accessAnchorId, accessContainer);
    if (!isDeepStrictEqual(pin.entity_snapshot, expected)) {
      fail('ACTION_PRODUCED_PLAN_INVALID');
    }
  }
}

function expectedEntity(pin, role, actorRef, contextVersion, finite,
  accessAnchorId, accessContainer) {
  const { item, placement, ownership } = pin;
  const prepared = pin.prepared_ordinary != null
    || pin.prepared_action != null;
  const accessState = prepared ? 'quick'
    : actionProducedAccessState(placement, accessContainer, actorRef,
      accessAnchorId);
  const holderRef = placement.holder_character_id === actorRef
    ? actorRef : null;
  if (!exact(pin.entity_snapshot, ENTITY_KEYS)
      || !Number.isSafeInteger(item.state_version) || item.state_version < 1
      || item.state?.lifecycle_status != null
        && item.state.lifecycle_status !== 'active'
      || !prepared && !actionProducedPlacementAccessible(placement,
        accessContainer, actorRef, accessAnchorId)
      || placement.holder_npc_id !== null
      || !validOwnership(ownership)
      || !actionProducedControllerPermitted(ownership, role, actorRef)) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  return {
    schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role, entity_ref: pin.item_id,
    state_version: contextVersion, lifecycle_state: 'active',
    access_state: accessState, holder_ref: holderRef,
    controller_ref: actionProducedControllerRef(ownership),
    ownership_snapshot: structuredClone(ownership),
    finite_resource: finite
  };
}

function validOwnership(value) {
  const owners = Number(text(value.owner_character_id))
    + Number(text(value.owner_npc_id)) + Number(value.owner_party === true);
  return owners === 1 && typeof value.owner_party === 'boolean'
    && text(value.claim_state);
}

function finiteSnapshot(row, itemId, role, seenResources) {
  if (row === null) return null;
  const unit = row?.quantity_unit_ref?.entity_id;
  if (role !== 'source' || !exact(row, RESOURCE_ROW_KEYS)
      || !text(row.resource_node_id) || seenResources.has(row.resource_node_id)
      || !exact(row.source_resource_ref, ['entity_kind', 'entity_id'])
      || row.source_resource_ref.entity_kind !== 'party_item'
      || row.source_resource_ref.entity_id !== itemId || !text(unit)
      || !Number.isSafeInteger(row.quantity_numerator)
      || row.quantity_numerator < 0
      || !Number.isSafeInteger(row.quantity_denominator)
      || row.quantity_denominator < 1
      || !Number.isSafeInteger(row.state_version) || row.state_version < 1
      || row.lifecycle_state !== 'active') {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  seenResources.add(row.resource_node_id);
  return {
    schema: 'rus.items.finite_resource_snapshot.v1',
    commit_state: 'committed',
    source_resource_node_id: row.resource_node_id,
    state_version: row.state_version,
    lifecycle_state: row.lifecycle_state,
    quantity: { numerator: row.quantity_numerator,
      denominator: row.quantity_denominator, unit }
  };
}
