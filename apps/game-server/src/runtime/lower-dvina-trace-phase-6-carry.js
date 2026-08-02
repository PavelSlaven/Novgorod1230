import { canonicalDigest } from '@rus/materialization';
import { carrierInventoryAdmission } from './lower-dvina-trace-phase-6-carry-inventory.js';
import { executeTracePhase6CarryTraversal } from './lower-dvina-trace-phase-6-carry-traversal.js';
import { INITIAL_CARRIERS, REPLACEMENT, actorMap, bodyEffectsBySubject, exactResources, integerMinutes, participantBinding, requiredActor, requiredCamp, requiredSelectedActor, requirePhase6State } from './lower-dvina-trace-phase-6-carry-support.js';
import { replacementBoundaryTimestamp, resolvePhase6TemporalAdvance } from
  './lower-dvina-trace-phase-6-temporal-boundaries.js';

/** Pure admission/orchestration boundary for the later revision-12 loader. */
export function planTracePhase6SynchronizedCarry({ state, contracts,
  inputDigest, commandIdempotencyKey = null,
  temporalAdvanceOwner }) {
  requirePhase6State(state, contracts);
  const prior = state.phase6_carry_execution ?? null;
  const duration = contracts.route.duration_minutes;
  const boundary = structuredClone(
    contracts.route.carried_actor_rules.carrier_rebinding.decision_boundary
  );
  const cumulativeBefore = integerMinutes(prior?.cumulative_elapsed_minutes ?? 0, 'TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  if (cumulativeBefore < 0 || cumulativeBefore >= duration && prior?.status !== 'completed') fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  const remaining = duration - cumulativeBefore;
  const bodyEffectAlreadyCommitted = (state.body_effect_history ?? []).some(
    ({ effect_ref: ref, activity_attempt_id: executionId }) =>
      ref === contracts.bodyEffectBindings.player_clerk
      && executionId === (prior?.id
        ?? `activity:${state.party_id}:trace-phase6:carry`)
  );
  if (prior != null && (cumulativeBefore < boundary.elapsed_minutes
      && prior.internal_rebinding_applied === true)) {
    fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  }
  if (prior != null && cumulativeBefore >= boundary.elapsed_minutes
      && prior.internal_rebinding_applied !== true
      && !bodyEffectAlreadyCommitted) {
    fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  }
  const actors = actorMap(state);
  const sourceAnchor = state.position.g5_anchor_id;
  const initial = [state.actor_id, ...INITIAL_CARRIERS.slice(1).map((slot) =>
    requiredActor(actors, slot, sourceAnchor).instance_id)];
  const replacement = requiredSelectedActor(
    state, actors, REPLACEMENT, sourceAnchor
  );
  const onisim = requiredActor(actors, 'onisim_boatman', sourceAnchor);
  const eremey = requiredActor(actors, 'eremey_fisher', sourceAnchor);
  const ratsha = requiredActor(
    actors, 'ratsha_storehouse_helper', sourceAnchor
  );
  const resources = exactResources({ state, actors, onisim, prior });
  const camp = requiredCamp(state, contracts);
  const inventoryAdmission = carrierInventoryAdmission({ state, resources,
    prior, cumulativeBefore, rebindRequired: false, initialCarrierIds: initial,
    reboundCarrierIds: [eremey.instance_id, ratsha.instance_id,
      replacement.instance_id], replacementBoundary: boundary });
  const temporal = resolvePhase6TemporalAdvance({ state, contracts, prior,
    remaining, internalBoundary: boundary, temporalAdvanceOwner,
    commandIdempotencyKey: commandIdempotencyKey
      ?? `availability:${state.party_state.state_version}`,
    rebindingDescriptor: {
      boundary,
      prior,
      cumulative_before: cumulativeBefore,
      source_anchor_id: sourceAnchor,
      initial_carrier_ids: initial,
      body_effect_already_committed: bodyEffectAlreadyCommitted
    } });
  const elapsed = temporal.elapsed;
  const cumulativeAfter = cumulativeBefore + elapsed;
  const terminal = temporal.result.temporal_status === 'completed'
    && cumulativeAfter === duration;
  const rebindRequired =
    temporal.projection.internal_rebinding_applied_in_window === true;
  const playerBodyEffectRequired =
    temporal.projection.player_body_effect_due_in_window === true;
  if (prior?.internal_rebinding_applied === true && rebindRequired) fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  const finalState = temporal.projection.phase6_state;
  const finalActors = actorMap(finalState);
  const finalOnisim = requiredActor(finalActors, 'onisim_boatman',
    sourceAnchor);
  const finalEremey = requiredActor(finalActors, 'eremey_fisher',
    sourceAnchor);
  const finalRatsha = requiredActor(finalActors, 'ratsha_storehouse_helper',
    sourceAnchor);
  const finalReplacement = rebindRequired
    ? requiredSelectedActor(finalState, finalActors, REPLACEMENT, sourceAnchor)
    : replacement;
  const finalResources = exactResources({ state: finalState,
    actors: finalActors, onisim: finalOnisim, prior });
  const finalParticipants = participantBinding({ state: finalState, prior,
    initial, replacement: finalReplacement, onisim: finalOnisim });
  const finalAssemblyValue = {
    source: 'phase_5_terminal_resource_snapshot',
    net_item_id: finalResources.net.item_id,
    poles_item_id: finalResources.poles.item_id,
    resources: finalResources.proof
  };
  const finalAssembly = { ...finalAssemblyValue,
    canonical_digest: canonicalDigest(finalAssemblyValue) };
  const finalInventoryAdmission = rebindRequired
    ? carrierInventoryAdmission({ state: finalState,
      resources: finalResources, prior, cumulativeBefore,
      rebindRequired: true, initialCarrierIds: initial,
      reboundCarrierIds: [finalEremey.instance_id, finalRatsha.instance_id,
        finalReplacement.instance_id], replacementBoundary: boundary })
    : inventoryAdmission;
  const progress = (minutes) => Math.round(
    minutes * 1000000 / duration
  );
  const internalRebinding = {
    ...boundary,
    temporal_candidate: structuredClone(temporal.internal_candidate),
    effect_occurred_at: replacementBoundaryTimestamp({ state, prior,
      boundary }),
    outgoing_actor_id: state.actor_id,
    incoming_actor_id: finalReplacement.instance_id,
    player_decision_required: false,
    initial_carrier_ids: initial,
    replacement_carrier_id: finalReplacement.instance_id,
    replaced_carrier_id: state.actor_id,
    preserve_elapsed: true,
    preserve_progress: true,
    applied_in_this_attempt: rebindRequired,
    body_effect_due_in_this_attempt: playerBodyEffectRequired,
    deferred_by_same_time_external: false,
    blocked_by_source_owner:
      temporal.projection.internal_rebinding_blocked_by ?? null
  };
  const resolvedBodyEffects = terminal || playerBodyEffectRequired
    ? bodyEffectsBySubject({ state: finalState, contracts,
      eremey: finalEremey, ratsha: finalRatsha,
      replacement: finalReplacement, onisim: finalOnisim })
    : [];
  const bodyEffects = terminal
    ? resolvedBodyEffects.filter(({ subject_ref: subject }) =>
      subject !== 'player_clerk' || playerBodyEffectRequired)
    : resolvedBodyEffects.filter(({ subject_ref: subject }) =>
      subject === 'player_clerk');
  const value = {
    schema: 'rus.lower_dvina_trace_phase_6_carry_intent.v1', party_id: state.party_id, idempotency_key: `phase6-carry:${inputDigest}`, route_ref: contracts.route.route_id, execution_id: prior?.id ?? `activity:${state.party_id}:trace-phase6:carry`, resume: prior != null,
    exact_elapsed: { numerator: String(elapsed), denominator: '1' }, cumulative_elapsed_before: { numerator: String(cumulativeBefore), denominator: '1' }, cumulative_elapsed_after: { numerator: String(cumulativeAfter), denominator: '1' }, progress_before_ppm: progress(cumulativeBefore), progress_after_ppm: progress(cumulativeAfter), root_clock_write_count: 1, player_decision_boundaries: [],
    internal_rebinding: internalRebinding,
    temporal_advance_result: {
      ...structuredClone(temporal.result),
      canonical_digest: canonicalDigest(temporal.result)
    },
    participant_bindings: finalParticipants,
    carried_actor_id: finalOnisim.instance_id, assembly_snapshot: finalAssembly, carrier_inventory_snapshots: finalInventoryAdmission.snapshots, inventory_admission_checkpoints: finalInventoryAdmission.checkpoints, body_effect_profile_refs: structuredClone(contracts.route.body_effect_profile_refs), body_effects_by_subject: bodyEffects, terminal_location_ref: terminal ? contracts.route.terminal_position_outcome : null,
    terminal_group_ids: terminal ? [state.actor_id, ...initial.slice(1), finalReplacement.instance_id, finalOnisim.instance_id] : [],
    terminal_group_position: terminal ? { g4_id: state.position.g4_id, location_ref: contracts.terminalPlacement.group.location_ref, g5_node_id: camp.node.instance_id, g5_anchor_id: camp.anchor.instance_id, zone_ref: contracts.terminalPlacement.group.zone_ref } : null,
    onisim_camp_fire_position: terminal ? { location_ref: contracts.terminalPlacement.carried_actor.location_ref, g5_node_id: camp.node.instance_id, g5_anchor_id: camp.anchor.instance_id, zone_ref: contracts.terminalPlacement.carried_actor.zone_ref, independent_movement_history: 'forbidden' } : null,
    ratsha_observation: terminal ? { npc_id: finalRatsha.instance_id, state: contracts.terminalPlacement.ratsha_observation.state, committed_fact_output: contracts.terminalPlacement.ratsha_observation.committed_fact_output } : null
  };
  value.attempt = { ordinal: prior?.next_attempt_ordinal ?? 0,
    result_kind: terminal ? 'completed'
      : 'paused_external_temporal_boundary',
    temporal_boundary_refs: temporal.processed_boundary_ids,
    temporal_boundary_batch: null,
    processed_boundary_ids: temporal.processed_boundary_ids,
    external_boundary_refs: temporal.processed_external_boundary_ids,
    external_boundary_batch: null,
    temporal_resolution_trace: {
      owner: '@rus/turn/temporal-advance',
      engine_version: temporal.result.trace.engine_version,
      provider_versions: temporal.result.trace.provider_versions,
      dispositions: temporal.dispositions,
      slice_count: temporal.result.trace.slice_count,
      combined_change_set_digest: canonicalDigest(
        temporal.result.combined_change_set)
    },
    evaluated_candidate_count: temporal.evaluated_candidate_count,
    player_decision_required: false };
  value.execution_after = { id: value.execution_id, started_at_turn: prior?.started_at_turn ?? Number(state.party_state.turn_number) + 1, started_at: structuredClone(prior?.started_at ?? state.clock), status: terminal ? 'completed' : 'paused', cumulative_elapsed_minutes: cumulativeAfter, progress_ppm: progress(cumulativeAfter), next_attempt_ordinal: value.attempt.ordinal + 1, internal_rebinding_applied: prior?.internal_rebinding_applied === true || rebindRequired, assembly_snapshot: finalAssembly, participant_bindings: finalParticipants };
  value.traversal = executeTracePhase6CarryTraversal({ state, contracts, inputDigest, commandIdempotencyKey, intent: value, prior, requiredCamp });
  value.execution_after.traversal = structuredClone(value.traversal);
  return Object.freeze({ ...value, canonical_digest: canonicalDigest(value) });
}

export function createTracePhase6CarryCommand({ contracts, inputDigest,
  temporalAdvanceOwner }) {
  return Object.freeze({
    command_id: 'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp', option_id: 'make_stretcher_and_carry_onisim_to_camp', label: 'Сделать носилки и отнести Онисима в стан', target_id: null,
    preconditions: [{ kind: 'phase6_exact_carry_state' }, { kind: 'phase6_committed_assembly_resources' }, { kind: 'phase6_carrier_inventory_admission' }], expected_cost: { kind: 'synchronized_exact_time', value: 20 }, known_risks: ['Внешняя временная граница может прервать переноску без потери прогресса.'], reason_visible_to_actor: 'Онисим не может идти; группа и материалы носилок готовы к пути.',
    mode: { selected_primary_mode: 'movement_route', secondary_modes: ['body_recovery', 'item_property', 'time_progression'], resolution_plan: { subsystems: ['movement', 'route', 'item_access', 'inventory', 'ownership_access', 'npc_interaction', 'body_state', 'time_progression', 'visible_context_projection'], checks_to_run: ['physical_access', 'route_access', 'body_state', 'time_cost'], expected_writes: ['party_state', 'party_npcs', 'party_character_knowledge_map', 'party_visible_context_package'], state_blocks_to_load: ['party_state', 'current_position', 'clock_weather_light', 'relevant_items', 'relevant_npcs', 'relevant_routes', 'relevant_anchors', 'relevant_events', 'recent_changes_log'] } },
    matches: ({ raw_text }) => /носил|отнести онисима/u.test(String(raw_text ?? '').toLowerCase()),
    availability({ committed_state: state, retrievedState }) { try { assertPhase6CarryAdmission({ state: state ?? retrievedState, contracts }); return phase6Availability(true, []); } catch (error) { return phase6Availability(false, [error.code ?? 'TRACE_PHASE_6_ADMISSION_FAILED']); } },
    consequence({ retrievedState, playerInput }) { const intent = planTracePhase6SynchronizedCarry({ state: retrievedState, contracts, inputDigest, commandIdempotencyKey: playerInput.idempotency_key, temporalAdvanceOwner }); const playerBodyEffect = intent.body_effects_by_subject.find(({ subject_ref: subject }) => subject === 'player_clerk'); if ((playerBodyEffect != null) !== (intent.internal_rebinding.body_effect_due_in_this_attempt === true)) throw Object.assign(new Error('TRACE_PHASE_6_BODY_EFFECT_GAP'), { code: 'TRACE_PHASE_6_BODY_EFFECT_GAP' }); return { version: 1, schema: 'turn_consequence_package', status: 'resolved', phase6_kind: 'synchronized_carry', activity_attempt_id: intent.execution_id, body_effect_ref: playerBodyEffect == null ? null : playerBodyEffect.profile_ref, duration_minutes: Number(intent.exact_elapsed.numerator), carry: { intent, traversal: structuredClone(intent.traversal) }, visible_seed: {}, hidden_update: {}, state_changes: [], suggested_actions: [] }; },
    writeTargets(input) { return [{ target: 'party_state', value: { player_input: input.playerInput, mode_resolution: input.modeResolution, availability: input.availability, consequence: input.consequence, time_update: input.timeUpdate, body_update: input.bodyUpdate, hidden_update: input.hiddenUpdate } }, { target: 'party_visible_context_package', value: input.visibleContext }]; }
  });
}
const PHASE6_PRECONDITIONS = new Set(['phase6_exact_carry_state', 'phase6_committed_assembly_resources', 'phase6_carrier_inventory_admission']);
function assertPhase6CarryAdmission({ state, contracts }) {
  requirePhase6State(state, contracts);
  const prior = state.phase6_carry_execution ?? null;
  const duration = contracts.route.duration_minutes;
  const boundary = contracts.route.carried_actor_rules.carrier_rebinding
    .decision_boundary;
  const cumulativeBefore = integerMinutes(
    prior?.cumulative_elapsed_minutes ?? 0,
    'TRACE_PHASE_6_EXECUTION_STATE_INVALID'
  );
  if (cumulativeBefore < 0
      || cumulativeBefore >= duration && prior?.status !== 'completed') {
    fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  }
  const bodyEffectAlreadyCommitted = (state.body_effect_history ?? []).some(
    ({ effect_ref: ref, activity_attempt_id: executionId }) =>
      ref === contracts.bodyEffectBindings.player_clerk
      && executionId === (prior?.id
        ?? `activity:${state.party_id}:trace-phase6:carry`)
  );
  if (prior != null && (cumulativeBefore < boundary.elapsed_minutes
      && prior.internal_rebinding_applied === true
      || cumulativeBefore >= boundary.elapsed_minutes
      && prior.internal_rebinding_applied !== true
      && !bodyEffectAlreadyCommitted)) {
    fail('TRACE_PHASE_6_EXECUTION_STATE_INVALID');
  }
  const actors = actorMap(state);
  const sourceAnchor = state.position.g5_anchor_id;
  const initial = [state.actor_id, ...INITIAL_CARRIERS.slice(1).map((slot) =>
    requiredActor(actors, slot, sourceAnchor).instance_id)];
  const replacement = requiredSelectedActor(
    state, actors, REPLACEMENT, sourceAnchor
  );
  const onisim = requiredActor(actors, 'onisim_boatman', sourceAnchor);
  const resources = exactResources({ state, actors, onisim, prior });
  requiredCamp(state, contracts);
  carrierInventoryAdmission({ state, resources, prior, cumulativeBefore,
    rebindRequired: prior?.internal_rebinding_applied === true,
    initialCarrierIds: initial,
    reboundCarrierIds: [
      requiredActor(actors, 'eremey_fisher', sourceAnchor).instance_id,
      requiredActor(actors, 'ratsha_storehouse_helper', sourceAnchor)
        .instance_id,
      replacement.instance_id
    ], replacementBoundary: boundary });
}
export function tracePhase6PreconditionSatisfied(precondition, state, contracts) { if (!PHASE6_PRECONDITIONS.has(precondition?.kind)) return false; try { assertPhase6CarryAdmission({ state, contracts }); return true; } catch { return false; } }
function phase6Availability(canAttempt, reasons, extra = {}) { return { version: 1, schema: 'turn_availability_decision', status: canAttempt ? 'available' : 'blocked', can_attempt: canAttempt, reasons: [...reasons], check_requests: [], ...extra }; }
function fail(code, details = null) { throw Object.assign(new Error(code), { code, details }); }
