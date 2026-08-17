import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { deriveActionProducedPropertyCompatibilityBasis } from
  '@rus/items-property';
import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';

const ROW_PIN_KEYS = [
  'role', 'item_id', 'item', 'placement', 'ownership', 'item_digest',
  'placement_digest', 'ownership_digest', 'entity_snapshot',
  'finite_resource_row'
];
const ENTITY_KEYS = [
  'schema', 'commit_state', 'role', 'entity_ref', 'state_version',
  'lifecycle_state', 'access_state', 'holder_ref', 'controller_ref',
  'mechanics_state_ref', 'property_state_ref', 'ownership_state_ref',
  'ownership_basis_ref', 'property_basis_ref', 'ownership_snapshot',
  'placement_state_ref', 'finite_resource'
];
const RESOURCE_ROW_KEYS = [
  'resource_node_id', 'source_resource_ref', 'quantity_numerator',
  'quantity_denominator', 'quantity_unit_ref', 'lifecycle_state',
  'state_version', 'position_node_id', 'property_basis_ref'
];
const AUTHORITY_PIN_KEYS = [
  'schema', 'authority_digest', 'persisted_row_digest', 'persisted_row'
];
const AUTHORITY_ROW_KEYS = [
  'party_id', 'actor_ref', 'context_ref', 'profile_ref', 'profile_version',
  'policy_ref', 'policy_version', 'max_new_entities',
  'allowed_access_states', 'allowed_identity_modes', 'allowed_origins',
  'allowed_result_classes', 'authority_state_version', 'status',
  'authority_digest'
];

export function validateActionProducedAuthorityPin(pin) {
  if (!exact(pin, AUTHORITY_PIN_KEYS)
      || pin.schema !== 'action_production_committed_authority_pin_v1'
      || !exact(pin.persisted_row, AUTHORITY_ROW_KEYS)
      || digest(Object.fromEntries(Object.entries(pin.persisted_row)
        .filter(([key]) => key !== 'authority_digest')))
        !== pin.authority_digest
      || pin.persisted_row.authority_digest !== pin.authority_digest
      || digest(pin.persisted_row) !== pin.persisted_row_digest) {
    fail('ACTION_PRODUCED_AUTHORITY_INVALID');
  }
  return pin;
}

export function validateActionProducedDestinationPin(pin) {
  if (pin === null) return null;
  const keys = ['schema', 'destination_kind', 'anchor_id', 'item_capacity',
    'used_item_ids', 'destination_digest'];
  const value = { anchor_id: pin?.anchor_id,
    item_capacity: pin?.item_capacity, used_item_ids: pin?.used_item_ids };
  if (!exact(pin, keys)
      || pin.schema !== 'action_production_output_destination_pin_v1'
      || pin.destination_kind !== 'party_current_anchor'
      || !text(pin.anchor_id) || !Number.isSafeInteger(pin.item_capacity)
      || pin.item_capacity < 0 || !Array.isArray(pin.used_item_ids)
      || pin.used_item_ids.some((itemId) => !text(itemId))
      || new Set(pin.used_item_ids).size !== pin.used_item_ids.length
      || pin.used_item_ids.length > pin.item_capacity
      || digest(value) !== pin.destination_digest) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return pin;
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
    holder_ref: null, controller_ref: actorRef,
    placement_state_ref: digest(placement)
  };
}

export function validateActionProducedRowPins(pins, role, actorRef,
  contextVersion) {
  const seenItems = new Set();
  const seenResources = new Set();
  for (const pin of pins) {
    if (!exact(pin, ROW_PIN_KEYS) || pin.role !== role
        || !text(pin.item_id) || seenItems.has(pin.item_id)
        || pin.item?.item_id !== pin.item_id
        || digest(pin.item) !== pin.item_digest
        || digest(pin.placement) !== pin.placement_digest
        || digest(pin.ownership) !== pin.ownership_digest) {
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
      finite);
    if (digest(pin.entity_snapshot) !== digest(expected)) {
      fail('ACTION_PRODUCED_PLAN_INVALID');
    }
  }
}

function expectedEntity(pin, role, actorRef, contextVersion, finite) {
  const { item, placement, ownership } = pin;
  const accessState = access(placement.physical_position);
  const propertyBasis = deriveActionProducedPropertyCompatibilityBasis(
    ownership, item.state?.property_state ?? null);
  if (!exact(pin.entity_snapshot, ENTITY_KEYS)
      || !Number.isSafeInteger(item.state_version) || item.state_version < 1
      || item.state?.lifecycle_status != null
        && item.state.lifecycle_status !== 'active'
      || placement.holder_character_id !== actorRef
      || placement.holder_npc_id !== null
      || ownership.owner_character_id !== actorRef
      || ownership.owner_npc_id !== null
      || ownership.owner_party !== false
      || ownership.claim_state !== 'owned'
      || ownership.controller_character_id !== actorRef
      || ownership.controller_npc_id !== null) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  return {
    schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role, entity_ref: pin.item_id,
    state_version: contextVersion, lifecycle_state: 'active',
    access_state: accessState, holder_ref: actorRef,
    controller_ref: actorRef,
    mechanics_state_ref: digest({
      runtime_instance_mechanics_snapshot:
        item.state?.runtime_instance_mechanics_snapshot ?? null,
      template_id: item.template_id, profile_id: item.profile_id,
      category_id: item.category_id, quantity: item.quantity
    }),
    property_state_ref: digest({
      property_state: item.state?.property_state ?? null, ownership
    }),
    ownership_state_ref: digest(ownership),
    ...propertyBasis,
    ownership_snapshot: structuredClone(ownership),
    placement_state_ref: pin.placement_digest,
    finite_resource: finite
  };
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

function access(position) {
  if (['hands', 'equipped', 'worn_quick'].includes(position)) {
    return 'immediate';
  }
  if (['worn', 'external', 'external_load'].includes(position)) return 'quick';
  fail('ACTION_PRODUCED_PLAN_INVALID');
}
