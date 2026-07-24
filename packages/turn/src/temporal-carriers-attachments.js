import { exactKeys, positiveInteger, sameEndpoint, sameRef, stableId, success, typed, valid } from './temporal-carriers-support.js';
import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';

const BOARD_KEYS = ['kind', 'expected_state_digest', 'change_set_id', 'attachment', 'position', 'expected_state_versions', 'carrier_capacity_snapshot_digest', 'idempotency_record'];
const ALIGHT_KEYS = ['kind', 'expected_state_digest', 'change_set_id', 'released_attachment', 'handoff_location', 'expected_state_versions', 'carrier_capacity_snapshot_digest', 'idempotency_record'];

const activeAttachments = (attachments) => attachments.filter(({ status }) => status === 'active');
const attachmentSubjectKey = (attachment) => `${attachment.subject_kind}:${attachment.subject_id}`;
const attachmentCarrierKey = (attachment) => `${attachment.carrier_kind}:${attachment.carrier_id}`;

function activeAttachmentMap(attachments) {
  const outgoing = new Map();
  for (const attachment of activeAttachments(attachments)) {
    const subject = attachmentSubjectKey(attachment);
    if (outgoing.has(subject) || !((attachment.subject_kind === 'actor' && ['cohort', 'transport'].includes(attachment.carrier_kind)) || (attachment.subject_kind === 'cohort' && attachment.carrier_kind === 'transport'))) return null;
    outgoing.set(subject, attachmentCarrierKey(attachment));
  }
  return outgoing;
}

function terminalCarrier(outgoing, subjectKind, subjectId, maxDepth) {
  let cursor = `${subjectKind}:${subjectId}`;
  const seen = new Set();
  let depth = 0;
  while (outgoing.has(cursor)) {
    if (seen.has(cursor) || ++depth > maxDepth) return null;
    seen.add(cursor);
    cursor = outgoing.get(cursor);
  }
  if (depth === 0) return null;
  const separator = cursor.indexOf(':');
  return { carrier_kind: cursor.slice(0, separator), carrier_id: cursor.slice(separator + 1), depth };
}

function terminalCarrierRef(terminal) {
  return { entity_kind: terminal.carrier_kind === 'transport' ? 'transport' : 'party_travel_cohort', entity_id: terminal.carrier_id };
}

function matchingMembership(memberships, actorId, cohortId, partyId) {
  return memberships.some((membership) => membership.party_id === partyId && membership.actor_id === actorId && membership.cohort_id === cohortId && membership.status === 'active');
}

export function graphValid(state, attachments = state.attachments, positions = state.positions, journeyLocations = state.journey_locations) {
  const outgoing = activeAttachmentMap(attachments);
  if (!outgoing) return false;
  for (const subject of outgoing.keys()) {
    const separator = subject.indexOf(':');
    if (!terminalCarrier(outgoing, subject.slice(0, separator), subject.slice(separator + 1), 2)) return false;
  }
  for (const attachment of activeAttachments(attachments)) {
    if (attachment.subject_kind === 'actor' && attachment.carrier_kind === 'cohort' && !matchingMembership(state.cohort_memberships, attachment.subject_id, attachment.carrier_id, state.party_id)) return false;
    if (attachment.subject_kind === 'cohort' && attachment.carrier_kind === 'transport' && !state.cohort_memberships.some((membership) => membership.party_id === state.party_id && membership.cohort_id === attachment.subject_id && membership.status === 'active')) return false;
    if (journeyLocations.some((location) => location.party_id === state.party_id && location.owner_kind === attachment.subject_kind && location.owner_id === attachment.subject_id)) return false;
  }
  const activeActors = activeAttachments(attachments).filter(({ subject_kind }) => subject_kind === 'actor');
  for (const attachment of activeActors) {
    const actorPositions = positions.filter((position) => position.party_id === state.party_id && position.actor_id === attachment.subject_id);
    const terminal = terminalCarrier(outgoing, 'actor', attachment.subject_id, 2);
    if (actorPositions.length !== 1 || !terminal || !sameRef(actorPositions[0].root_carrier_ref, terminalCarrierRef(terminal)) || actorPositions[0].attachment_dependency_pins.canonical_digest !== state.dependency_pins.canonical_digest) return false;
  }
  return positions.every((position) => activeActors.some((attachment) => attachment.subject_id === position.actor_id));
}

function capacityFor(state, carrierKind, carrierId) {
  return state.carrier_capacity_snapshot.carriers.find((carrier) => carrier.carrier_kind === carrierKind && carrier.carrier_id === carrierId);
}

export function resolveBoard(state, command, limits) {
  if (!exactKeys(command, BOARD_KEYS) || !stableId(command.change_set_id)
    || !valid('party_carrier_attachment', command.attachment) || command.attachment.status !== 'active'
    || command.attachment.released_change_set_id !== null || command.attachment.party_id !== state.party_id
    || command.attachment.created_change_set_id !== command.change_set_id || command.attachment.state_version !== 1
    || !exactKeys(command.expected_state_versions, ['attachment', 'position', 'journey_location'])
    || command.expected_state_versions.attachment !== null
    || command.carrier_capacity_snapshot_digest !== state.carrier_capacity_snapshot.canonical_digest) return typed('temporal_change_set_conflict', state, { reason: 'invalid_board_dto' });
  const existingOutgoing = activeAttachments(state.attachments).find((value) => value.subject_kind === command.attachment.subject_kind && value.subject_id === command.attachment.subject_id);
  const journeyLocation = state.journey_locations.find((value) => value.owner_kind === command.attachment.subject_kind && value.owner_id === command.attachment.subject_id);
  if (existingOutgoing || !journeyLocation || command.expected_state_versions.journey_location !== journeyLocation.state_version) return typed('state_version_conflict', state, { reason: 'attachment_or_location_stale' });
  let proposedPositions = state.positions;
  if (command.attachment.subject_kind === 'actor') {
    if (!valid('party_actor_carrier_position', command.position) || command.expected_state_versions.position !== null || command.position.party_id !== state.party_id || command.position.actor_id !== command.attachment.subject_id || command.position.state_version !== 1 || command.position.updated_change_set_id !== command.change_set_id || command.position.attachment_dependency_pins.canonical_digest !== state.dependency_pins.canonical_digest) return typed('temporal_change_set_conflict', state, { reason: 'invalid_actor_carrier_position' });
    proposedPositions = [...state.positions, command.position];
  } else if (command.position !== null || command.expected_state_versions.position !== null) return typed('temporal_change_set_conflict', state, { reason: 'cohort_board_forbids_actor_position' });
  const proposedAttachments = [...state.attachments, command.attachment];
  const proposedLocations = state.journey_locations.filter((value) => value !== journeyLocation);
  if (!graphValid(state, proposedAttachments, proposedPositions, proposedLocations)) return typed('attachment_graph_invalid', state);
  const capacity = capacityFor(state, command.attachment.carrier_kind, command.attachment.carrier_id);
  const occupied = activeAttachments(state.attachments).filter((value) => value.carrier_kind === command.attachment.carrier_kind && value.carrier_id === command.attachment.carrier_id).length;
  if (!capacity || occupied >= capacity.capacity || occupied + 1 > limits.max_capacity) return typed('state_version_conflict', state, { reason: 'capacity_stale_or_exhausted' });
  return success({ result_set: { proposed_inserts: [command.attachment, ...(command.position === null ? [] : [command.position])], proposed_updates: [], proposed_deletes: [{ contract_name: 'party_journey_location', party_id: state.party_id, owner_kind: command.attachment.subject_kind, owner_id: command.attachment.subject_id, expected_state_version: journeyLocation.state_version }] } });
}

function attachmentIdentityMatches(existing, released) {
  return ['id', 'party_id', 'subject_kind', 'subject_id', 'carrier_kind', 'carrier_id', 'formation_slot_id', 'created_change_set_id'].every((key) => existing[key] === released[key]);
}

function locationMatchesEndpoint(location) {
  if (location.last_confirmed_endpoint_ref.endpoint_kind === 'scene_position') return location.location.location_kind === 'scene' && location.location.scene_position_id === location.last_confirmed_endpoint_ref.endpoint_id;
  return location.last_confirmed_endpoint_ref.endpoint_kind === 'transit_anchor' && location.location.location_kind === 'transit_anchor' && location.location.transit_anchor_id === location.last_confirmed_endpoint_ref.endpoint_id;
}

export function resolveAlight(state, command) {
  if (!exactKeys(command, ALIGHT_KEYS)) return typed('temporal_change_set_conflict', state, { reason: 'invalid_alight_command_shape' });
  if (!stableId(command.change_set_id)) return typed('temporal_change_set_conflict', state, { reason: 'invalid_alight_change_set' });
  if (!valid('party_carrier_attachment', command.released_attachment)
    || command.released_attachment.status !== 'released'
    || command.released_attachment.released_change_set_id !== command.change_set_id) return typed('temporal_change_set_conflict', state, { reason: 'invalid_released_attachment' });
  const handoffViolations = validateSpatialV3Contract('party_journey_location', command.handoff_location);
  if (handoffViolations.length > 0 || command.handoff_location.updated_change_set_id !== command.change_set_id) return typed('temporal_change_set_conflict', state, { reason: 'invalid_handoff_location', violation_fields: handoffViolations.map(({ field }) => field) });
  if (!exactKeys(command.expected_state_versions, ['attachment', 'position', 'journey_location']) || command.expected_state_versions.journey_location !== null) return typed('temporal_change_set_conflict', state, { reason: 'invalid_alight_expected_versions' });
  if (command.carrier_capacity_snapshot_digest !== state.carrier_capacity_snapshot.canonical_digest) return typed('temporal_change_set_conflict', state, { reason: 'invalid_alight_capacity_digest' });
  const existing = state.attachments.find(({ id }) => id === command.released_attachment.id);
  if (!existing || existing.status !== 'active' || !attachmentIdentityMatches(existing, command.released_attachment) || command.expected_state_versions.attachment !== existing.state_version || !positiveInteger(existing.state_version) || command.released_attachment.state_version !== existing.state_version + 1) return typed('state_version_conflict', state, { reason: 'attachment_identity_or_version_stale' });
  if (command.handoff_location.party_id !== state.party_id || command.handoff_location.owner_kind !== existing.subject_kind || command.handoff_location.owner_id !== existing.subject_id || command.handoff_location.state_version !== 1 || state.journey_locations.some((location) => location.owner_kind === existing.subject_kind && location.owner_id === existing.subject_id)) return typed('state_version_conflict', state, { reason: 'handoff_location_stale' });
  if (!locationMatchesEndpoint(command.handoff_location) || !state.approved_anchor_refs.some((anchor) => sameEndpoint(anchor, command.handoff_location.last_confirmed_endpoint_ref))) return typed('travel_interruption_unresolved', state, { reason: 'handoff_anchor_not_approved' });
  const existingPosition = existing.subject_kind === 'actor' ? state.positions.find((position) => position.actor_id === existing.subject_id) : null;
  if ((existing.subject_kind === 'actor' && (!existingPosition || command.expected_state_versions.position !== existingPosition.state_version)) || (existing.subject_kind === 'cohort' && command.expected_state_versions.position !== null)) return typed('state_version_conflict', state, { reason: 'carrier_position_stale' });
  const updatedAttachments = state.attachments.map((value) => value.id === existing.id ? command.released_attachment : value);
  const updatedPositions = existingPosition ? state.positions.filter((value) => value !== existingPosition) : state.positions;
  const updatedLocations = [...state.journey_locations, command.handoff_location];
  if (!graphValid(state, updatedAttachments, updatedPositions, updatedLocations)) return typed('attachment_graph_invalid', state);
  return success({ result_set: { proposed_inserts: [command.handoff_location], proposed_updates: [command.released_attachment], proposed_deletes: existingPosition ? [{ contract_name: 'party_actor_carrier_position', party_id: state.party_id, actor_id: existing.subject_id, expected_state_version: existingPosition.state_version }] : [] } });
}
