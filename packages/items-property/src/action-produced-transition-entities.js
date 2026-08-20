import { sha256 } from '@rus/kernel';
import { actionProducedRational } from
  './action-produced-transition-rational.js';

const PIN_KEYS = [
  'entity_ref', 'state_version', 'access_state', 'holder_ref',
  'controller_ref', 'mechanics_state_ref', 'property_state_ref',
  'ownership_state_ref', 'ownership_basis_ref', 'property_basis_ref',
  'placement_state_ref'
];
const SNAPSHOT_KEYS = [
  'schema', 'commit_state', 'role', 'entity_ref', 'state_version',
  'lifecycle_state', 'access_state', 'holder_ref', 'controller_ref',
  'mechanics_state_ref', 'property_state_ref', 'ownership_state_ref',
  'ownership_basis_ref', 'property_basis_ref', 'ownership_snapshot',
  'placement_state_ref', 'finite_resource'
];
const FINITE_KEYS = [
  'schema', 'commit_state', 'source_resource_node_id', 'state_version',
  'lifecycle_state', 'quantity'
];
const OUTPUT_DESTINATION_KEYS = [
  'schema', 'placement_kind', 'target_ref', 'holder_ref', 'controller_ref',
  'placement_state_ref'
];
const OWNERSHIP_KEYS = [
  'ownership_id', 'owner_npc_id', 'owner_character_id', 'owner_party',
  'controller_npc_id', 'controller_character_id', 'claim_state'
];

export function validateActionProducedEntitySnapshots(values, role, pins) {
  if (!Array.isArray(values) || values.length !== pins.length) fail();
  const snapshots = values.map((value, index) => {
    if (!exact(value, SNAPSHOT_KEYS)
        || value.schema
          !== 'rus.items.action_produced_committed_entity_snapshot.v1'
        || value.commit_state !== 'committed' || value.role !== role
        || value.lifecycle_state !== 'active') fail();
    const pin = pins[index];
    for (const key of PIN_KEYS) {
      if (value[key] !== pin[key]) fail();
    }
    if (!validOwnership(value.ownership_snapshot)
        || value.ownership_state_ref
          !== `sha256:${sha256(value.ownership_snapshot)}`) fail();
    if (value.finite_resource !== null) validateFinite(value.finite_resource);
    return value;
  });
  if (new Set(snapshots.map(({ entity_ref: ref }) => ref)).size
      !== snapshots.length) fail();
  if (role === 'source') {
    const finiteRefs = snapshots
      .filter(({ finite_resource: finite }) => finite !== null)
      .map(({ finite_resource: finite }) => finite.source_resource_node_id);
    if (new Set(finiteRefs).size !== finiteRefs.length) fail();
  }
  return snapshots;
}

function validOwnership(value) {
  return exact(value, OWNERSHIP_KEYS) && text(value.ownership_id)
    && nullableText(value.owner_npc_id)
    && nullableText(value.owner_character_id)
    && typeof value.owner_party === 'boolean'
    && nullableText(value.controller_npc_id)
    && nullableText(value.controller_character_id)
    && text(value.claim_state);
}

export function validateActionProducedOutputDestination(value, mode,
  actorRef) {
  if (mode !== 'independent_outputs') {
    if (value !== null) fail();
    return null;
  }
  if (!exact(value, OUTPUT_DESTINATION_KEYS)
      || value.schema !== 'rus.items.action_produced_output_destination.v1'
      || value.placement_kind !== 'anchor'
      || !text(value.target_ref) || value.holder_ref !== null
      || value.controller_ref !== actorRef
      || !text(value.placement_state_ref)) fail();
  return value;
}

export function validateActionProducedOutputPropertyBasis(propertySourceRef,
  allocations, sources) {
  const selected = sources.get(propertySourceRef)?.source;
  if (!selected || !allocations.some(({ source_ref: sourceRef }) =>
    sourceRef === propertySourceRef)) fail();
  for (const { source_ref: sourceRef } of allocations) {
    const contributor = sources.get(sourceRef)?.source;
    if (!contributor
        || contributor.ownership_basis_ref !== selected.ownership_basis_ref) {
      fail();
    }
  }
}

function validateFinite(value) {
  if (!exact(value, FINITE_KEYS)
      || value.schema !== 'rus.items.finite_resource_snapshot.v1'
      || value.commit_state !== 'committed'
      || !text(value.source_resource_node_id)
      || !Number.isSafeInteger(value.state_version)
      || value.state_version < 1 || value.lifecycle_state !== 'active') fail();
  actionProducedRational(value.quantity, true);
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function nullableText(value) { return value === null || text(value); }
function fail() {
  throw Object.assign(new TypeError('ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' });
}
