import { actionProducedRational } from
  './action-produced-transition-rational.js';

const PIN_KEYS = [
  'entity_ref', 'state_version', 'access_state', 'holder_ref',
  'controller_ref'
];
const SNAPSHOT_KEYS = [
  'schema', 'commit_state', 'role', 'entity_ref', 'state_version',
  'lifecycle_state', 'access_state', 'holder_ref', 'controller_ref',
  'ownership_snapshot', 'finite_resource'
];
const FINITE_KEYS = [
  'schema', 'commit_state', 'source_resource_node_id', 'state_version',
  'lifecycle_state', 'quantity'
];
const OUTPUT_DESTINATION_KEYS = [
  'schema', 'placement_kind', 'target_ref', 'holder_ref', 'controller_ref',
];
const OWNERSHIP_KEYS = [
  'ownership_id', 'owner_npc_id', 'owner_character_id', 'owner_party',
  'controller_npc_id', 'controller_character_id', 'claim_state'
];
const EXTERNAL_OWNERSHIP_KEYS = [...OWNERSHIP_KEYS, 'owner_external_ref'];

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
    if (!validOwnership(value.ownership_snapshot)) fail();
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
  return (exact(value, OWNERSHIP_KEYS)
      || exact(value, EXTERNAL_OWNERSHIP_KEYS)) && text(value.ownership_id)
    && nullableText(value.owner_npc_id)
    && nullableText(value.owner_character_id)
    && typeof value.owner_party === 'boolean'
    && (!Object.hasOwn(value, 'owner_external_ref')
      || validExternalOwner(value.owner_external_ref))
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
      || !['anchor', 'scene_position'].includes(value.placement_kind)
      || !text(value.target_ref) || value.holder_ref !== null
      || value.controller_ref !== actorRef) fail();
  return value;
}

export function validateActionProducedOutputPropertyBasis(propertySourceRef,
  allocations, sources) {
  const contributors = allocations.map(({ source_ref: sourceRef }) => {
    const contributor = sources.get(sourceRef)?.source;
    if (!contributor) fail();
    return contributor;
  });
  const expected = selectActionProducedPropertySource(contributors);
  if (propertySourceRef !== expected
      || !allocations.some(({ source_ref: sourceRef }) =>
        sourceRef === propertySourceRef)) fail();
}

export function selectActionProducedPropertySource(sources) {
  if (!Array.isArray(sources) || sources.length === 0) fail();
  const basis = ownershipBasis(sources[0]);
  for (const source of sources) {
    if (!text(source.entity_ref) || !sameBasis(basis, ownershipBasis(source))) {
      throw Object.assign(new TypeError(
        'ITEM_ACTION_PRODUCED_PROPERTY_AMBIGUOUS'), {
        code: 'ITEM_ACTION_PRODUCED_PROPERTY_AMBIGUOUS' });
    }
  }
  return sources.map(({ entity_ref: ref }) => ref).sort()[0];
}

function ownershipBasis(source) {
  const value = source?.ownership_snapshot;
  if (!validOwnership(value)) fail();
  return { owner_npc_id: value.owner_npc_id,
    owner_character_id: value.owner_character_id,
    owner_party: value.owner_party,
    owner_external_ref: structuredClone(value.owner_external_ref ?? null),
    claim_state: value.claim_state };
}

function sameBasis(left, right) {
  return left.owner_npc_id === right.owner_npc_id
    && left.owner_character_id === right.owner_character_id
    && left.owner_party === right.owner_party
    && JSON.stringify(left.owner_external_ref)
      === JSON.stringify(right.owner_external_ref)
    && left.claim_state === right.claim_state;
}

function validExternalOwner(value) {
  return value === null || exact(value, ['entity_kind', 'entity_id'])
    && text(value.entity_kind) && text(value.entity_id);
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
