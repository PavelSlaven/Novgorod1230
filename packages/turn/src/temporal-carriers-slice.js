import {
  dependencyPins,
  exactKeys,
  freeze,
  isZeroRational,
  pinned,
  record,
  sameEndpoint,
  sameRational,
  typed,
  valid,
  validElapsedTime
} from './temporal-carriers-support.js';
import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';

const SLICE_KEYS = ['kind', 'expected_state_digest', 'slice_input', 'interruption_outcome', 'idempotency_record'];

export function selectCarrierClockCommitMode({ root_transport_execution_ref } = {}) {
  if (root_transport_execution_ref === null) return freeze({ clock_commit_mode: 'direct_party_clock', root_transport_execution_ref: null });
  if (!valid('entity_ref', root_transport_execution_ref) || root_transport_execution_ref.entity_kind !== 'party_route_plan_execution') throw new TypeError('root_transport_execution_ref must be null or a formal party route execution ref');
  return freeze({ clock_commit_mode: 'shared_root_transport_clock', root_transport_execution_ref });
}

function validateInterruption(state, outcome) {
  if (outcome === null) return 'valid';
  if (!valid('interruption_outcome', outcome) || !dependencyPins(outcome.dependency_pins) || outcome.dependency_pins.canonical_digest !== state.dependency_pins.canonical_digest || !pinned(outcome.dependency_pins, 'activity_contract', outcome.progress_preservation_policy_ref) || !pinned(outcome.dependency_pins, 'activity_contract', outcome.resource_preservation_policy_ref) || !validElapsedTime(outcome.elapsed)) return 'invalid';
  if (outcome.outcome_kind === 'strand' && (!outcome.exact_anchor_ref || !state.approved_anchor_refs.some((anchor) => sameEndpoint(anchor, outcome.exact_anchor_ref)))) return 'anchor';
  return 'valid';
}

function validateSliceResponse(state, command, response) {
  if (!record(response) || response.ok !== true || !record(response.root_result) || !Array.isArray(response.local_results)) return { status: 'invalid', reason: 'response_shape' };
  const directOwners = [response.root_result, ...response.local_results].filter(({ clock_commit_mode }) => clock_commit_mode === 'direct_party_clock');
  if (directOwners.length !== 1 || response.root_result.clock_commit_mode !== 'direct_party_clock' || response.local_results.some(({ clock_commit_mode }) => clock_commit_mode !== 'shared_root_transport_clock')) return { status: 'owner_conflict', reason: 'clock_owner_count' };
  const violations = validateSpatialV3Contract('synchronized_time_slice_result', response.slice);
  if (violations.length > 0) return { status: 'invalid', reason: `slice_contract:${violations.map(({ field }) => field).join(',')}` };
  if (response.slice.party_id !== state.party_id || response.slice.idempotency_record_id !== command.idempotency_record.id || response.slice.dependency_pins.canonical_digest !== state.dependency_pins.canonical_digest) return { status: 'invalid', reason: 'slice_identity' };
  if (response.root_result.id !== response.slice.root_traversal_interval_result_id || response.root_result.synchronized_time_slice_result_id !== response.slice.id || response.root_result.crossed_whole_minute_boundaries !== response.slice.crossed_whole_minute_boundaries) return { status: 'invalid', reason: 'root_linkage' };
  if (!sameRational(response.root_result.actual_time, response.slice.exact_elapsed)) return { status: 'invalid', reason: 'root_elapsed' };
  if (response.local_results.some((local) => local.synchronized_time_slice_result_id !== response.slice.id || local.crossed_whole_minute_boundaries !== '0' || (!sameRational(local.actual_time, response.slice.exact_elapsed) && !(isZeroRational(local.actual_time) && ['blocked', 'paused', 'failed'].includes(local.result_kind))))) return { status: 'invalid', reason: 'local_linkage_or_elapsed' };
  if (isZeroRational(response.slice.exact_elapsed) && response.local_results.some((local) => !isZeroRational(local.actual_time))) return { status: 'invalid', reason: 'root_zero_local_progress' };
  if (!record(response.clock_update) || response.clock_update.crossed_whole_minute_boundaries !== response.slice.crossed_whole_minute_boundaries) return { status: 'invalid', reason: 'clock_update' };
  if (!record(response.write_proposal) || !Array.isArray(response.write_proposal.appends) || response.write_proposal.appends.length !== 2 + response.local_results.length) return { status: 'invalid', reason: 'write_proposal' };
  if (command.interruption_outcome !== null && !sameRational(command.interruption_outcome.elapsed.exact_minutes, response.slice.exact_elapsed)) return { status: 'invalid', reason: 'interruption_elapsed' };
  return { status: 'valid' };
}

export function resolveSynchronizedSlice(state, command, resolver) {
  if (!exactKeys(command, SLICE_KEYS) || !record(command.slice_input) || command.slice_input.party_id !== state.party_id || command.slice_input.idempotency_record_id !== command.idempotency_record.id || !dependencyPins(command.slice_input.dependency_pins) || command.slice_input.dependency_pins.canonical_digest !== state.dependency_pins.canonical_digest) return typed('temporal_change_set_conflict', state, { reason: 'invalid_slice_input' });
  const interruption = validateInterruption(state, command.interruption_outcome);
  if (interruption === 'invalid') return typed('temporal_change_set_conflict', state, { reason: 'invalid_interruption_outcome' });
  if (interruption === 'anchor') return typed('travel_interruption_unresolved', state);
  const resolved = resolver(command.slice_input);
  const validation = validateSliceResponse(state, command, resolved);
  if (validation.status === 'owner_conflict') return typed('time_owner_conflict', state);
  if (validation.status !== 'valid') return typed('temporal_change_set_conflict', state, { reason: `invalid_p19_result:${validation.reason}` });
  return { slice: resolved.slice, root_result: resolved.root_result, local_results: resolved.local_results, clock_update: resolved.clock_update, write_proposal: resolved.write_proposal };
}
