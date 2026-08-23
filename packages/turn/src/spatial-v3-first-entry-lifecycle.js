import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';

import { FIRST_ENTRY_BINDING_FIELDS } from './spatial-v3-write-plan-policy.js';

const text = (value) => typeof value === 'string' && value.trim() === value
  && value.length > 0;
const version = (value) => Number.isInteger(value) && value >= 0;
const copy = (value) => structuredClone(value);
const freeze = (value) => Object.freeze(value);

/**
 * Turns an already approved topology arrival and its deterministic prepared
 * destination rows into the caller-ready P16 first-entry extension.  It does
 * not plan topology, prepare a target, read state, or invoke a model.
 */
export function resolveSpatialV3FirstEntryLifecycle(input = {}) {
  const partyId = input.party_id;
  const transition = input.approved_transition;
  const destination = input.destination;
  if (!text(partyId) || !transition || transition.status !== 'approved') {
    return fail('route_plan_snapshot_missing', partyId);
  }
  if (!text(transition.from_g4_id) || !text(transition.to_g4_id)
      || !text(transition.relation_ref)) {
    return fail('route_endpoint_invalid', partyId);
  }
  if (!text(transition.route_plan_id) || !text(transition.route_plan_digest)
      || !text(transition.route_plan_execution_id)
      || !destination || destination.g4_id !== transition.to_g4_id
      || !['prepared', 'unprepared'].includes(destination.status)) {
    return fail('route_plan_snapshot_missing', partyId);
  }
  if (destination.status === 'prepared') return freeze({ ok: true,
    disposition: 'prepared', extension: emptyExtension() });

  const preparation = input.preparation;
  const member = preparation?.member;
  if (!text(preparation?.snapshot_id) || !text(preparation?.snapshot_digest)
      || !memberMatches(member, transition, destination, preparation)) {
    return fail('target_preparation_failed', partyId);
  }
  const claim = preparation.claim;
  const journeyLocation = preparation.journey_location;
  if (!write(claim) || !version(claim.state_version)
      || claim.id !== member.preparation_claim_id) {
    return fail('preparation_claim_conflict', partyId);
  }
  if (!write(journeyLocation) || !version(journeyLocation.state_version)) {
    return fail('journey_location_ownership_mismatch', partyId);
  }
  const physical = physicalWrites(preparation.physical_writes, member);
  if (physical == null) return fail('target_preparation_failed', partyId);

  const binding = Object.fromEntries(FIRST_ENTRY_BINDING_FIELDS.map((field) =>
    [field, member[field]]));
  const physicalRecheck = {
    kind: 'physical',
    materialization_scope_key:
      `party_runtime.party_scene_baselines:${member.scene_baseline_id}`,
    ...binding
  };
  physicalRecheck.digest = computeSpatialV3CanonicalDigest(physicalRecheck);
  const location = { ...copy(journeyLocation), record: {
    ...copy(journeyLocation.record), location_kind: 'scene',
    scene_position_id: member.position_id
  } };
  const consumedClaim = { ...copy(claim), record: {
    ...copy(claim.record), claim_status: 'consumed',
    terminal_change_set_id: input.change_set_id
  } };
  if (!text(input.change_set_id)) return fail('target_preparation_failed', partyId);
  const writes = { inserts: physical, updates: [location, consumedClaim] };
  return freeze({ ok: true, disposition: 'first_entry', extension: freeze({
    operation_kind: 'first_entry',
    commit_rechecks: freeze([freeze(physicalRecheck)]),
    approved_write_sets: freeze([freeze(writes)]),
    expected_state_versions: freeze([
      freeze({ target_table: 'party_journey_locations', id: location.id,
        state_version: journeyLocation.state_version }),
      freeze({ target_table: 'preparation_claims', id: consumedClaim.id,
        state_version: claim.state_version })
    ]),
    lock_context: freeze({
      g4_keys: freeze([`${partyId}:${member.g4_id}`]),
      physical_keys: freeze([
        physicalRecheck.materialization_scope_key,
        ...[...physical, location, consumedClaim].map(keyOf)
      ].sort())
    })
  }) });
}

function emptyExtension() {
  return freeze({ commit_rechecks: freeze([]), approved_write_sets: freeze([]),
    expected_state_versions: freeze([]), lock_context: freeze({
      g4_keys: freeze([]), physical_keys: freeze([]) }) });
}

function memberMatches(member, transition, destination, preparation) {
  if (!member || !['create', 'reuse'].includes(member.baseline_disposition)
      || !FIRST_ENTRY_BINDING_FIELDS.every((field) => text(member[field])
        || field === 'preparation_member_ordinal'
          && Number.isInteger(member[field]) && member[field] >= 0)) return false;
  return member.g4_id === destination.g4_id
    && member.preparation_snapshot_id === preparation.snapshot_id
    && member.preparation_snapshot_digest === preparation.snapshot_digest
    && member.route_plan_id === transition.route_plan_id
    && member.route_plan_digest === transition.route_plan_digest
    && member.route_plan_execution_id === transition.route_plan_execution_id;
}

function physicalWrites(value, member) {
  if (!Array.isArray(value)) return null;
  if (member.baseline_disposition === 'reuse') {
    return value.length === 0 ? [] : null;
  }
  const writes = value.map(copy);
  const hasSlot = writes.filter((entry) => entry.target_table === 'party_g6_instances').length === 2;
  if ((!hasSlot && (writes.length < 3 || writes.length > 4))
      || (hasSlot && writes.length !== 10) || writes.some((entry) => !write(entry))
      || writes.some((entry) => !['party_scene_baselines', 'party_g5_sites', 'party_g6_instances',
        'scene_position_nodes', 'scene_movement_edges', 'visibility_links'].includes(
        entry.target_table))
      || !writes.some((entry) => entry.target_table === 'party_scene_baselines')
      || (hasSlot && !completeS1Topology(writes, member))) {
    return null;
  }
  const one = (table, id) => writes.find((entry) => entry.target_table === table && entry.id === id);
  return Boolean(one('party_scene_baselines', member.scene_baseline_id)
    && one('party_g6_instances', member.g6_instance_id)
    && one('scene_position_nodes', member.position_id)
    && (!hasSlot || one('party_g5_sites', member.g5_site_id)))
    ? writes : null;
}

function completeS1Topology(writes, member) {
  const one = (table, id) => writes.find((entry) => entry.target_table === table && entry.id === id);
  const baseline = one('party_scene_baselines', member.scene_baseline_id);
  const g6 = one('party_g6_instances', member.g6_instance_id);
  const position = one('scene_position_nodes', member.position_id);
  const slots = writes.filter((entry) => entry.target_table === 'party_g6_instances'
    || entry.target_table === 'scene_position_nodes');
  const slotG6 = slots.find((entry) => entry.target_table === 'party_g6_instances'
    && entry.id !== member.g6_instance_id);
  const slotPosition = slots.find((entry) => entry.target_table === 'scene_position_nodes'
    && entry.id !== member.position_id);
  const edges = writes.filter((entry) => entry.target_table === 'scene_movement_edges');
  const links = writes.filter((entry) => entry.target_table === 'visibility_links');
  if (!baseline || !g6 || !position || !slotG6 || !slotPosition) return false;
  const source = baseline?.record?.scene_template_ref;
  return slots.length === 4 && edges.length === 2 && links.length === 2
    && sameVersioned(source, g6?.record?.source_scene_template_ref)
    && sameVersioned(source, slotG6?.record?.source_scene_template_ref)
    && g6?.record?.scene_baseline_id === member.scene_baseline_id
    && position?.record?.g6_instance_id === member.g6_instance_id
    && slotG6?.record?.scene_baseline_id === member.scene_baseline_id
    && slotPosition?.record?.g6_instance_id === slotG6.id
    && edges.every((edge) => edge.record?.scene_baseline_id === member.scene_baseline_id
      && sameVersioned(source, edge.record?.source_scene_template_ref))
    && links.every((link) => link.record?.scene_baseline_id === member.scene_baseline_id
      && sameVersioned(source, link.record?.source_scene_template_ref))
    && reciprocal(edges, 'reverse_edge_id', member.position_id, slotPosition?.id)
    && reciprocal(links, 'reverse_link_id', member.position_id, slotPosition?.id);
}

function reciprocal(rows, reverseKey, basePositionId, slotPositionId) {
  return rows.length === 2 && rows.every((row) => rows.some((other) => other.id === row.record?.[reverseKey]
    && other.record?.[reverseKey] === row.id && row.record?.from_position_id === other.record?.to_position_id
    && row.record?.to_position_id === other.record?.from_position_id))
    && rows.some((row) => row.record?.from_position_id === basePositionId
      && row.record?.to_position_id === slotPositionId)
    && rows.some((row) => row.record?.from_position_id === slotPositionId
      && row.record?.to_position_id === basePositionId);
}

function sameVersioned(left, right) {
  return validSceneTemplate(left) && validSceneTemplate(right)
    && left.authoring_version === right.authoring_version
    && left.entity_ref.entity_kind === right.entity_ref.entity_kind
    && left.entity_ref.entity_id === right.entity_ref.entity_id;
}

function validSceneTemplate(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'entity_ref') && Object.hasOwn(value, 'authoring_version')
    && value.authoring_version === '1' && value.entity_ref
    && typeof value.entity_ref === 'object' && !Array.isArray(value.entity_ref)
    && Object.keys(value.entity_ref).length === 2
    && Object.hasOwn(value.entity_ref, 'entity_kind')
    && Object.hasOwn(value.entity_ref, 'entity_id')
    && value.entity_ref.entity_kind === 'scene_template'
    && text(value.entity_ref.entity_id);
}

function write(value) {
  return value && text(value.id) && value.target_schema === 'party_runtime'
    && text(value.target_table) && value.record && typeof value.record === 'object';
}

function keyOf(value) {
  return `${value.target_schema}.${value.target_table}:${value.id}`;
}

function fail(code, partyId) {
  const pins = [{ dependency_role: 'planning_context_dependency',
    entity_ref: { entity_kind: 'party_change_set', entity_id: partyId || 'unknown' },
    version_pin: { pin_kind: 'party_state_version', state_version: 1 } }];
  return freeze({ ok: false, error: createSpatialV3TypedError(code, {
    subject_ref: { entity_kind: 'party_change_set', entity_id: partyId || 'unknown' },
    dependency_pins: { pins,
      canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') }
  }) });
}
