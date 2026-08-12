import { addElapsedTime, compareRationalMinutes, subtractGameTimestamp } from
  '@rus/time-events-history';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { combatTechnicalStepTemporalCandidates } from '@rus/turn';
import { COMBAT_COMPLETION_EFFECT_REF, COMBAT_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-combat-temporal-effect-owner.js';

const SOURCE = versioned('dynamic_recheck_policy',
  'lower-dvina-trace-pending-boundaries', '1');
const COMPLETIONS = versioned('dynamic_recheck_policy',
  'combat-technical-step-completions', '1');

export function createTraceCombatTemporalSliceOwner({ temporalAdvanceOwner,
  partyId, rootTurnId, idempotencyKey }) {
  return ({ working_state: working, requested_at: clockBefore,
    exact_duration: planned, session, steps,
    step_timings: stepTimings, resolve_combat_step: resolveCombatStep }) => {
    const candidates = structuredClone(
      working.temporal_boundary_candidates ?? []);
    if (typeof temporalAdvanceOwner?.advance !== 'function') {
      fail('TRACE_COMBAT_TEMPORAL_OWNER_MISSING');
    }
    const limit = addElapsedTime(clockBefore, planned);
    const completionCandidates = combatTechnicalStepTemporalCandidates({
      session, steps, requested_at: clockBefore,
      technical_step_timings: stepTimings,
      scope_ref: ref('party', partyId) });
    const request = temporalRequest({ working, clockBefore, limit,
      candidates, partyId, rootTurnId, idempotencyKey });
    const advanced = temporalAdvanceOwner.advance({ request,
      engine_version: 'lower-dvina-trace-combat-temporal-adapter-v1',
      temporal_resolution_policy_version: 'temporal-resolution-v1',
      safety_limits: { max_slices: 20, max_candidates: 100,
        max_iterations: 100 }, source_provider_ref: SOURCE,
      source_candidates: candidates, registered_provider_ref: COMPLETIONS,
      registered_effects: completionCandidates.map((candidate) => ({
        candidate, effect_ref: COMBAT_COMPLETION_EFFECT_REF,
        input: { technical_step_id: candidate.boundary_id } })),
      resolve_registered_effect({ candidate, context, effect_ref: effectRef,
        descriptor }) {
        if (effectRef?.entity_ref?.entity_id
            !== COMBAT_COMPLETION_EFFECT_REF.entity_ref.entity_id
            || typeof resolveCombatStep !== 'function') {
          fail('TRACE_COMBAT_TEMPORAL_COMPLETION_INVALID');
        }
        const resolved = resolveCombatStep({
          technical_step_id: descriptor.technical_step_id,
          working_state: context.projection,
          exact_duration: context.slice_plan.planned_elapsed,
          synchronized_time_slice_result_id: context.slice_plan.slice_id,
          occurred_at: candidate.scheduled_at });
        if (resolved?.working_state == null) {
          fail('TRACE_COMBAT_TEMPORAL_COMPLETION_INVALID');
        }
        return { disposition: 'execute', proposals: [],
          state_projection: resolved.working_state,
          follow_up_candidates: [] };
      },
      continuous_effect: {
        effect_ref: COMBAT_PROGRESS_EFFECT_REF, input: {
          steps: structuredClone(steps),
          step_timings: structuredClone(stepTimings) } },
      finalization: { visible_package_candidate: visibleEnvelope(request),
        validation_report: { ok: true } }, stop_after_source_batch: true });
    const elapsed = subtractGameTimestamp(advanced.result.clock_after,
      clockBefore);
    if (!isPositive(elapsed)
        || compareRationalMinutes(elapsed, planned.exact_minutes) > 0) {
      fail('TRACE_COMBAT_TEMPORAL_RESULT_INVALID');
    }
    const temporalResult = { ...structuredClone(advanced.result),
      canonical_digest: computeSpatialV3CanonicalDigest(advanced.result) };
    return { working_state: { ...structuredClone(advanced.state_projection),
      temporal_advance_results: [
        ...(working.temporal_advance_results ?? []), temporalResult] },
    exact_duration: { exact_minutes: elapsed },
    temporal_advance_results: [temporalResult] };
  };
}

function temporalRequest({ working, clockBefore, limit, candidates, partyId,
  rootTurnId, idempotencyKey }) {
  const pins = sealed({ pins: [{ dependency_role: 'dynamic_recheck_policy',
    entity_ref: SOURCE.entity_ref, version_pin: { pin_kind:
      'authoring_version', authoring_version: '1' } }] });
  const identity = `${rootTurnId}:combat-slice`;
  return { party_id: partyId, turn_id: rootTurnId,
    base_state_version: String(working.party_state.state_version),
    clock_before: structuredClone(clockBefore),
    clock_commit_mode: 'direct_party_clock',
    clock_owner_ref: ref('party', partyId), requested_execution_ref:
      ref('party_timed_activity_execution', identity),
    inclusive_limit_timestamp: limit,
    active_scope: 'exact_active_g6', relevant_state_projection: {
      ...structuredClone(working), calendar_profile_ref: sealed({ profile_ref:
        versioned('calendar_profile', 'lower-dvina-trace-calendar', '1') }),
      active_execution_refs: [ref('party_timed_activity_execution', identity)],
      active_execution_requires_boundary: false,
      available_event_ids: candidates.map(({ boundary_id: id }) => id) },
    catalog_pins: pins, temporal_resolution_policy_ref: sealed({ policy_ref:
      versioned('dynamic_recheck_policy', 'temporal-resolution', '1') }),
    idempotency_context: { record_id: `idem:${identity}`,
      idempotency_key: `${idempotencyKey}:combat-slice`,
      change_set_id: `change:${identity}` },
    provider_versions: [SOURCE, COMPLETIONS] };
}
function visibleEnvelope(request) {
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Боевое действие продолжается.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: [] };
  return { package_id: `${request.turn_id}:combat-temporal-visible`,
    party_id: request.party_id, turn_id: request.turn_id,
    committed_state_version: String(BigInt(request.base_state_version) + 1n),
    change_set_id: request.idempotency_context.change_set_id,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: versioned('visibility_modifier',
      'combat-temporal-projection', '1'),
    dependency_pins: request.catalog_pins,
    idempotency_record_id: request.idempotency_context.record_id };
}
const isPositive = (value) => BigInt(value.numerator) > 0n;
function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }
function versioned(entityKind, entityId, authoringVersion) {
  return { entity_ref: ref(entityKind, entityId), authoring_version:
    authoringVersion };
}
const sealed = (value) => ({ ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value) });
function fail(code) { throw Object.assign(new Error(code), { code }); }
