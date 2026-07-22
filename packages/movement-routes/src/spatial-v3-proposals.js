import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { validPins } from './spatial-v3-validation.js';

const digest = (value) => computeSpatialV3CanonicalDigest(value);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const hex = (value) => typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);

// P18 command proposals are a separate immutable protocol. Keeping it here
// prevents path traversal from acquiring materialization/preparation ownership.
export function validCommandProposal(edge, query) {
  if (edge.readiness === 'ready' || edge.readiness === 'temporarily_blocked' || edge.readiness === 'data_gap') return true;
  const proposal = edge.command_proposal;
  if (edge.readiness === 'requires_frontier_resolution') {
    const keys = ['command_id', 'frontier_id', 'command_kind', 'reservation_request', 'terminal_policy_ref', 'resolved_terminal_target_ref', 'resolved_terminal_target_pins', 'expected_state_versions', 'idempotency_key', 'canonical_digest'];
    if (!sealed(proposal, keys) || !text(proposal.command_id) || !text(proposal.frontier_id) || !['materialize_next_g5', 'resolve_terminal_connection', 'resolve_world_route_exit_connection', 'create_physical_boundary'].includes(proposal.command_kind) || !text(proposal.idempotency_key) || !exactVersions(proposal.expected_state_versions)) return false;
    if (proposal.command_kind === 'materialize_next_g5') return validReservationRequest(proposal.reservation_request, query) && proposal.frontier_id === proposal.reservation_request.frontier_id && proposal.terminal_policy_ref == null && proposal.resolved_terminal_target_ref == null && proposal.resolved_terminal_target_pins == null;
    return proposal.reservation_request == null && versioned(proposal.terminal_policy_ref) && proposal.resolved_terminal_target_ref && text(proposal.resolved_terminal_target_ref.entity_kind) && text(proposal.resolved_terminal_target_ref.entity_id) && validPins(proposal.resolved_terminal_target_pins);
  }
  const keys = ['command_id', 'planning_request_id', 'planning_request_digest', 'party_id', 'proposed_member_set_digest', 'expected_state_versions', 'idempotency_key', 'canonical_digest', 'required_member_proposals'];
  const members = proposal?.required_member_proposals;
  return sealed(proposal, keys) && text(proposal.command_id) && proposal.planning_request_id === query.request_id && proposal.planning_request_digest === query.canonical_digest && proposal.party_id === query.party_id && hex(proposal.proposed_member_set_digest) && proposal.proposed_member_set_digest === digest(members).replace('sha256:', '') && text(proposal.idempotency_key) && exactVersions(proposal.expected_state_versions) && validPreparationMembers(members);
}

function exactVersions(value) {
  return value && Array.isArray(value.entries) && value.entries.length > 0 && hex(value.canonical_digest) && value.canonical_digest === digest(value.entries).replace('sha256:', '') && value.entries.every((entry) => entry?.entity_ref && text(entry.entity_ref.entity_kind) && text(entry.entity_ref.entity_id) && Number.isInteger(entry.state_version) && entry.state_version > 0);
}

function sealed(value, keys) {
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !keys.includes(key)) || !hex(value.canonical_digest)) return false;
  const payload = { ...value }; delete payload.canonical_digest;
  return value.canonical_digest === digest(payload);
}

function versioned(ref) { return ref?.entity_ref && text(ref.entity_ref.entity_kind) && text(ref.entity_ref.entity_id) && text(ref.authoring_version); }

function validReservationRequest(value, query) {
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !['party_id', 'g4_id', 'profile_ref', 'slot_ref', 'frontier_id', 'selected_template_ref', 'requested_units'].includes(key))) return false;
  return value.party_id === query.party_id && text(value.g4_id) && text(value.frontier_id) && value.requested_units === 1 && versioned(value.profile_ref) && versioned(value.slot_ref) && versioned(value.selected_template_ref);
}

function validPreparationMembers(members) {
  if (!Array.isArray(members) || !members.length) return false;
  const seen = new Set();
  return members.every((member, ordinal) => {
    if (!member || typeof member !== 'object' || member.ordinal !== ordinal || !['endpoint', 'transfer_scene'].includes(member.member_kind) || !['execution_exclusive', 'reusable'].includes(member.share_mode) || !validPins(member.dependency_pins) || !versioned(member.source_authoring_ref)) return false;
    const identity = `${member.member_kind}:${member.dependency_pins.canonical_digest}`; if (seen.has(identity)) return false; seen.add(identity);
    const payload = { ...member }; delete payload.member_digest;
    return hex(member.member_digest) && member.member_digest === digest(payload);
  });
}

export function matchesTarget(endpoint, target) {
  // The topology provider must explicitly project target membership; no
  // containment traversal or name/nearest-location inference is performed.
  return endpoint?.target_ref && endpoint.target_ref.spatial_kind === target.spatial_kind && endpoint.target_ref.spatial_id === target.spatial_id
    || endpoint?.spatial_ref && endpoint.spatial_ref.spatial_kind === target.spatial_kind && endpoint.spatial_ref.spatial_id === target.spatial_id;
}
