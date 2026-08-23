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
  const expected = ['party_scene_baselines', 'party_g6_instances',
    'scene_position_nodes'];
  const writes = value.map(copy);
  if (writes.length < expected.length || writes.length > expected.length + 1
      || writes.some((entry) => !write(entry))
      || writes.some((entry) => ![...expected, 'party_g5_sites'].includes(
        entry.target_table))
      || expected.some((table) => !writes.some((entry) => entry.target_table === table))) {
    return null;
  }
  const byTable = Object.fromEntries(writes.map((entry) => [entry.target_table, entry]));
  return byTable.party_scene_baselines.id === member.scene_baseline_id
    && byTable.party_g6_instances.id === member.g6_instance_id
    && byTable['scene_position_nodes'].id === member.position_id
    && (byTable.party_g5_sites == null
      || byTable.party_g5_sites.id === member.g5_site_id)
    ? writes : null;
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
