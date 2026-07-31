import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { deepFreeze } from '@rus/kernel';
import {
  addElapsedTime,
  compareGameTimestamp,
  countCrossedWholeMinuteBoundaries,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { mergeTemporalProposals } from './temporal-proposal-merger.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refKey = (value) => object(value) ? `${value.entity_kind}\u0000${value.entity_id}` : '';

const fail = (code, message, details = {}) => {
  const error = new Error(message);
  error.name = 'TemporalAdvanceError';
  error.code = code;
  error.details = deepFreeze(structuredClone(details));
  throw error;
};

export function cloneFrozen(value) {
  try { return deepFreeze(structuredClone(value)); } catch (error) {
    fail('generated_schema_mismatch', 'Temporal data must be structured-cloneable.', { cause: error instanceof Error ? error.message : String(error) });
  }
}

function assertContract(contractName, value) {
  const errors = validateSpatialV3Contract(contractName, value);
  if (errors.length) fail(errors[0].code, errors[0].message, { contract_name: contractName, field: errors[0].field, validation_errors: errors });
}

function assertUniqueVersionedRefs(values, field) {
  if (!Array.isArray(values) || values.length === 0) fail('temporal_execution_unbounded', `${field} must be a finite non-empty versioned-ref set.`);
  const keys = new Set();
  for (const value of values) {
    assertContract('versioned_ref', value);
    const key = refKey(value.entity_ref);
    if (keys.has(key)) fail('temporal_execution_unbounded', `${field} contains a duplicate provider identity.`, { provider_ref: value.entity_ref });
    keys.add(key);
  }
  return keys;
}

export function validateConfiguration(configuration) {
  if (!object(configuration) || typeof configuration.engine_version !== 'string' || !configuration.engine_version || typeof configuration.temporal_resolution_policy_version !== 'string' || !configuration.temporal_resolution_policy_version) fail('temporal_execution_unbounded', 'Temporal engine requires explicit engine and resolution policy versions.');
  const limits = configuration.safety_limits;
  if (!object(limits) || ['max_slices', 'max_candidates', 'max_iterations'].some((name) => !Number.isSafeInteger(limits[name]) || limits[name] <= 0)) fail('temporal_execution_unbounded', 'Temporal engine requires positive explicit safety limits.');
  if (!Array.isArray(configuration.providers) || configuration.providers.length === 0) fail('temporal_execution_unbounded', 'Temporal engine requires a finite non-empty provider set.');
  const providerKeys = new Set();
  for (const provider of configuration.providers) {
    if (!object(provider) || typeof provider.collect !== 'function') fail('temporal_execution_unbounded', 'Temporal provider requires a versioned provider_ref and pure collect handler.');
    assertContract('versioned_ref', provider.provider_ref);
    const key = refKey(provider.provider_ref.entity_ref);
    if (providerKeys.has(key)) fail('temporal_execution_unbounded', 'Temporal provider identities must be unique.', { provider_ref: provider.provider_ref.entity_ref });
    providerKeys.add(key);
  }
  for (const handler of ['applyContinuous', 'resolve', 'finalize']) if (typeof configuration.handlers?.[handler] !== 'function') fail('temporal_execution_unbounded', `Temporal engine requires an explicit ${handler} handler.`);
}

export function immutableConfiguration(configuration) {
  validateConfiguration(configuration);
  return Object.freeze({ engine_version: configuration.engine_version, temporal_resolution_policy_version: configuration.temporal_resolution_policy_version, safety_limits: cloneFrozen(configuration.safety_limits), providers: Object.freeze(configuration.providers.map((provider) => Object.freeze({ provider_ref: cloneFrozen(provider.provider_ref), collect: provider.collect }))), handlers: Object.freeze({ applyContinuous: configuration.handlers.applyContinuous, resolve: configuration.handlers.resolve, finalize: configuration.handlers.finalize }) });
}

export function idempotencyDigests(request) {
  const canonicalInput = structuredClone(request); delete canonicalInput.idempotency_context.persisted_replay;
  return { canonical_input_digest: computeSpatialV3CanonicalDigest(canonicalInput), expected_state_versions_digest: computeSpatialV3CanonicalDigest({ base_state_version: request.base_state_version, catalog_pins: request.catalog_pins, provider_versions: request.provider_versions, temporal_resolution_policy_ref: request.temporal_resolution_policy_ref }) };
}

export function replayCommittedResult(request, digests) {
  const replay = request.idempotency_context.persisted_replay;
  if (replay === undefined) return null;
  if (!object(replay) || !object(replay.record)) fail('idempotency_conflict', 'Persisted temporal replay must contain an idempotency record.');
  assertContract('idempotency_record', replay.record);
  const record = replay.record;
  const sameIdentity = record.id === request.idempotency_context.record_id && record.party_id === request.party_id && record.operation_kind === 'temporal_advance' && record.idempotency_key === request.idempotency_context.idempotency_key;
  const sameInput = record.canonical_input_digest === digests.canonical_input_digest && record.expected_state_versions_digest === digests.expected_state_versions_digest;
  if (!sameIdentity || !sameInput) fail('idempotency_conflict', 'The persisted temporal idempotency key belongs to another canonical request.', { idempotency_record_id: record.id });
  if (record.status !== 'committed' || !object(replay.result) || record.result_change_set_id !== request.idempotency_context.change_set_id) fail('idempotency_conflict', 'TemporalAdvance accepts only a matching committed persisted replay.');
  assertContract('temporal_advance_result', replay.result);
  if (replay.result.combined_change_set?.change_set_id !== record.result_change_set_id) fail('idempotency_conflict', 'Persisted temporal result does not match its committed change set.');
  return cloneFrozen(replay.result);
}

export function validateRequest(config, rawRequest) {
  if (!object(rawRequest)) fail('generated_schema_mismatch', 'Temporal advance request must be an object.');
  const request = cloneFrozen(rawRequest); assertContract('temporal_advance_request', request);
  if (compareGameTimestamp(request.inclusive_limit_timestamp, request.clock_before) < 0) fail('time_window_invalid', 'Temporal advance limit precedes its clock.');
  if (!object(request.idempotency_context) || typeof request.idempotency_context.record_id !== 'string' || !request.idempotency_context.record_id || typeof request.idempotency_context.idempotency_key !== 'string' || !request.idempotency_context.idempotency_key || typeof request.idempotency_context.change_set_id !== 'string' || !request.idempotency_context.change_set_id) fail('generated_schema_mismatch', 'Temporal idempotency context requires stable record, key and change-set identities.');
  if (!object(request.relevant_state_projection) || !object(request.relevant_state_projection.calendar_profile_ref) || !Array.isArray(request.relevant_state_projection.active_execution_refs)) fail('temporal_execution_unbounded', 'Temporal projection must explicitly contain its calendar profile and active executions.');
  const requestedKeys = assertUniqueVersionedRefs(request.provider_versions, 'provider_versions');
  const configuredKeys = new Set(config.providers.map(({ provider_ref }) => refKey(provider_ref.entity_ref)));
  if (requestedKeys.size !== configuredKeys.size || [...requestedKeys].some((key) => !configuredKeys.has(key))) fail('temporal_execution_unbounded', 'Temporal provider versions do not exactly match the configured provider set.');
  const requestedVersionByKey = new Map(request.provider_versions.map((value) => [refKey(value.entity_ref), value.authoring_version]));
  for (const provider of config.providers) if (requestedVersionByKey.get(refKey(provider.provider_ref.entity_ref)) !== provider.provider_ref.authoring_version) fail('temporal_execution_unbounded', 'Temporal provider version is absent or mismatched.', { provider_ref: provider.provider_ref.entity_ref });
  return request;
}

export function collectProviderCandidates(config, request, projection, clock, processed, deferredCandidates) {
  const candidates = [...deferredCandidates];
  for (const provider of config.providers) {
    const input = { from_timestamp: clock, limit_timestamp: request.inclusive_limit_timestamp, party_state_version: request.base_state_version, relevant_state_projection: projection, calendar_profile_ref: projection.calendar_profile_ref, catalog_pins: request.catalog_pins, provider_version: provider.provider_ref.authoring_version, active_execution_refs: projection.active_execution_refs };
    assertContract('temporal_boundary_provider_input', input);
    const returned = provider.collect(cloneFrozen(input)); const values = returned == null ? [] : Array.isArray(returned) ? returned : [returned];
    if (values.length + candidates.length > config.safety_limits.max_candidates) fail('temporal_boundary_cycle', 'Temporal providers exceeded the explicit candidate safety limit.');
    for (const candidate of values) { assertContract('temporal_boundary_candidate', candidate); candidates.push(candidate); }
  }
  return candidates.filter((candidate) => !processed.has(candidate.boundary_id));
}

export function createSlicePlan(request, sliceIndex, fromTimestamp, toTimestamp, batch) {
  const boundaryBatch = batch && { batch_id: batch.batch_id, scheduled_at: batch.scheduled_at, is_current_timestamp_batch: batch.is_current_timestamp_batch, resolution_policy_ref: request.temporal_resolution_policy_ref, candidate_set_digest: computeSpatialV3CanonicalDigest(batch.candidates), candidates: batch.candidates };
  if (boundaryBatch) assertContract('temporal_boundary_batch', boundaryBatch);
  const draft = { slice_id: `${request.turn_id}:temporal-slice:${sliceIndex}`, from_timestamp: fromTimestamp, to_timestamp: toTimestamp, planned_elapsed: { exact_minutes: subtractGameTimestamp(toTimestamp, fromTimestamp) }, clock_commit_mode: request.clock_commit_mode, clock_owner_ref: request.clock_owner_ref, requested_execution_ref: request.requested_execution_ref, dependency_pins: request.catalog_pins, idempotency_key: `${request.idempotency_context.idempotency_key}:slice:${sliceIndex}`, ...(boundaryBatch ? { boundary_batch: boundaryBatch } : {}) };
  const plan = { ...draft, canonical_digest: computeSpatialV3CanonicalDigest(draft) }; assertContract('time_slice_plan', plan); return cloneFrozen(plan);
}

export function normalizeHandlerOutcome(raw, handlerName) {
  if (!object(raw) || !Array.isArray(raw.proposals)) fail('temporal_change_set_conflict', `${handlerName} must return an explicit proposal array.`);
  if (raw.state_projection !== undefined && !object(raw.state_projection)) {
    fail('temporal_change_set_conflict', `${handlerName} state_projection must be an explicit object.`);
  }
  return {
    proposals: raw.proposals,
    state_projection: raw.state_projection === undefined
      ? null
      : cloneFrozen(raw.state_projection)
  };
}

export function normalizeResolution(raw, candidate, clock, request, deferredCandidates) {
  if (!object(raw) || !['execute', 'cancel', 'replace', 'hard_block'].includes(raw.disposition)) fail('temporal_candidate_stale', 'Temporal candidate requires explicit execute/cancel/replace/hard_block disposition.', { boundary_id: candidate.boundary_id });
  if (raw.disposition === 'hard_block') fail(raw.code ?? 'temporal_candidate_stale', 'Temporal candidate was hard-blocked by its explicit disposition.', { boundary_id: candidate.boundary_id });
  if (!Array.isArray(raw.proposals ?? []) || !Array.isArray(raw.follow_up_candidates ?? [])) fail('temporal_change_set_conflict', 'Temporal resolution proposals and follow-up candidates must be arrays.', { boundary_id: candidate.boundary_id });
  const sameTimeFollowUps = [...(raw.follow_up_candidates ?? [])]; for (const followUp of sameTimeFollowUps) assertContract('temporal_boundary_candidate', followUp);
  if (raw.disposition === 'replace') { if (!object(raw.replacement)) fail('temporal_candidate_stale', 'Replace disposition requires an explicit replacement boundary.', { boundary_id: candidate.boundary_id }); assertContract('temporal_boundary_candidate', raw.replacement); if (compareGameTimestamp(raw.replacement.scheduled_at, clock) < 0) fail('time_window_invalid', 'A replacement boundary cannot precede the resolved boundary.', { boundary_id: candidate.boundary_id, replacement_boundary_id: raw.replacement.boundary_id }); if (compareGameTimestamp(raw.replacement.scheduled_at, clock) === 0) sameTimeFollowUps.push(raw.replacement); else deferredCandidates.push(raw.replacement); }
  for (const followUp of sameTimeFollowUps) if (compareGameTimestamp(followUp.scheduled_at, clock) !== 0) fail('time_window_invalid', 'Same-time follow-up candidates must use the current cascade timestamp.', { boundary_id: followUp.boundary_id });
  if (raw.state_projection !== undefined && !object(raw.state_projection)) {
    fail('temporal_change_set_conflict', 'Temporal resolution state_projection must be an explicit object.', { boundary_id: candidate.boundary_id });
  }
  if (raw.stop_after_current_batch !== undefined
      && typeof raw.stop_after_current_batch !== 'boolean') {
    fail('temporal_change_set_conflict',
      'Temporal resolution stop_after_current_batch must be boolean.',
      { boundary_id: candidate.boundary_id });
  }
  return {
    disposition: raw.disposition,
    proposals: raw.proposals ?? [],
    follow_up_candidates: sameTimeFollowUps,
    replacement_outside_window: raw.disposition === 'replace' && compareGameTimestamp(raw.replacement.scheduled_at, request.inclusive_limit_timestamp) > 0,
    state_projection: raw.state_projection === undefined
      ? null
      : cloneFrozen(raw.state_projection),
    stop_after_current_batch: raw.stop_after_current_batch === true
  };
}

export function createSliceResult(request, plan, proposals, processedCandidates, dispositions) {
  const isZero = compareGameTimestamp(plan.from_timestamp, plan.to_timestamp) === 0;
  const value = { slice_id: plan.slice_id, result_kind: isZero ? 'zero_time_cascade' : 'positive_slice', actual_elapsed: { exact_minutes: subtractGameTimestamp(plan.to_timestamp, plan.from_timestamp) }, clock_before: plan.from_timestamp, clock_after: plan.to_timestamp, crossed_whole_minute_boundaries: countCrossedWholeMinuteBoundaries(plan.from_timestamp, plan.to_timestamp), proposal_digest: computeSpatialV3CanonicalDigest(proposals), change_set_id: request.idempotency_context.change_set_id, idempotency_record_id: request.idempotency_context.record_id, trace: { time_slice_plan_digest: plan.canonical_digest, dispositions }, processed_boundary_refs: processedCandidates.map(({ boundary_id }) => ({ entity_kind: 'temporal_boundary_candidate', entity_id: boundary_id })) };
  assertContract('time_slice_result', value); return cloneFrozen(value);
}

export function finalizeResult(config, request, projection, clockAfter, proposals, timeSliceResults, processedBoundaryIds, dispositions, deferredCandidates, digests) {
  const clockProposal = request.clock_commit_mode !== 'direct_party_clock' || compareGameTimestamp(request.clock_before, clockAfter) === 0 ? null : { proposal_id: `${request.turn_id}:party-clock-update`, write_target: `party_clock:${request.party_id}`, clock_owner_ref: request.clock_owner_ref, clock_update: { clock_before: request.clock_before, clock_after: clockAfter, actual_elapsed: { exact_minutes: subtractGameTimestamp(clockAfter, request.clock_before) }, crossed_whole_minute_boundaries: countCrossedWholeMinuteBoundaries(request.clock_before, clockAfter) } };
  const merged = mergeTemporalProposals({ proposals: clockProposal ? [...proposals, clockProposal] : proposals, expected_clock_owner_ref: request.clock_owner_ref, available_event_ids: request.relevant_state_projection.available_event_ids ?? [] });
  const combinedChangeSet = cloneFrozen({ change_set_id: request.idempotency_context.change_set_id, proposals: merged.proposals, clock_owner_ref: merged.clock_owner_ref, time_slice_results: timeSliceResults, deferred_boundary_candidates: deferredCandidates.filter((candidate) => !processedBoundaryIds.includes(candidate.boundary_id)), idempotency_claim: { record_id: request.idempotency_context.record_id, idempotency_key: request.idempotency_context.idempotency_key, ...digests } });
  const finalization = config.handlers.finalize(cloneFrozen({ request, state_projection: projection, clock_after: clockAfter, combined_change_set: combinedChangeSet, time_slice_results: timeSliceResults, processed_boundary_ids: processedBoundaryIds, dispositions }));
  if (!object(finalization) || !object(finalization.execution_state_ref) || !object(finalization.visible_package_candidate) || !object(finalization.validation_report)) fail('generated_schema_mismatch', 'Temporal finalizer must return status, execution ref, visible package and validation report.');
  assertContract('visible_package_persistence_envelope', finalization.visible_package_candidate);
  if (finalization.visible_package_candidate.party_id !== request.party_id || finalization.visible_package_candidate.turn_id !== request.turn_id || finalization.visible_package_candidate.change_set_id !== request.idempotency_context.change_set_id || finalization.visible_package_candidate.idempotency_record_id !== request.idempotency_context.record_id || finalization.visible_package_candidate.package_digest !== computeSpatialV3CanonicalDigest(finalization.visible_package_candidate.visible_payload)) fail('visible_package_persistence_gap', 'Visible package identity or digest does not match the temporal commit.');
  const result = { temporal_status: finalization.temporal_status, clock_before: request.clock_before, clock_after: clockAfter, execution_state_ref: finalization.execution_state_ref, combined_change_set: combinedChangeSet, visible_package_candidate: finalization.visible_package_candidate, validation_report: finalization.validation_report, trace: { engine_version: config.engine_version, temporal_resolution_policy_version: config.temporal_resolution_policy_version, provider_versions: request.provider_versions, processed_boundary_ids: processedBoundaryIds, dispositions, slice_count: timeSliceResults.length, replay_clock_check: addElapsedTime(request.clock_before, { exact_minutes: subtractGameTimestamp(clockAfter, request.clock_before) }), idempotency: digests }, processed_slice_refs: timeSliceResults.map(({ slice_id }) => ({ entity_kind: 'time_slice_result', entity_id: slice_id })) };
  assertContract('temporal_advance_result', result); return cloneFrozen(result);
}
