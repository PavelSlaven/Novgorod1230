import { isCodeOwnedPerceptionCycle } from '@rus/perception';
import { sha256 } from '@rus/kernel';
import { validateBoundedDecisionResult } from '@rus/materialization';

export function buildPerceptionPersistencePlan({ cycle, pins, reactionDecisions = [], decisionSecret = null, decisionPreconditionEvaluator = null, now = new Date().toISOString() }) {
  if (!isCodeOwnedPerceptionCycle(cycle)) throw perceptionError('PERCEPTION_CYCLE_NOT_CODE_OWNED', 'Only an in-process perception cycle may be persisted.');
  if (!cycle.events.length) throw perceptionError('PERCEPTION_CYCLE_EMPTY', 'A persisted perception cycle requires at least one event.');
  if (!Number.isInteger(cycle.wave_count) || cycle.wave_count < 1 || !Array.isArray(cycle.waves) || cycle.waves.length !== cycle.wave_count) throw perceptionError('PERCEPTION_WAVE_TRACE_INVALID', 'Perception cycle requires a complete aggregate wave trace.');
  validatePins(pins);
  const first = cycle.events[0];
  if (cycle.events.some((event) => event.party_id !== cycle.party_id || event.turn_id !== first.turn_id || event.state_version !== cycle.state_version)) {
    throw perceptionError('PERCEPTION_CYCLE_IDENTITY_INVALID', 'All events must have the cycle party, turn and state version.');
  }
  const eventIds = new Set(cycle.events.map((event) => event.event_id));
  if (eventIds.size !== cycle.events.length) throw perceptionError('PERCEPTION_EVENT_ID_DUPLICATE', 'Perception cycle event IDs must be unique.');
  for (const result of cycle.results) if (!eventIds.has(result.event_id) || result.state_version !== cycle.state_version) throw perceptionError('PERCEPTION_RESULT_UNBOUND', 'Perception result is not bound to this cycle.');
  for (const awareness of cycle.awareness_states) if (!eventIds.has(awareness.event_id)) throw perceptionError('PERCEPTION_AWARENESS_UNBOUND', 'Awareness state is not bound to this cycle event.');
  validateReactionDecisions({ cycle, reactionDecisions, eventIds, decisionSecret, decisionPreconditionEvaluator, now });
  validateSecondaryEventCausality(cycle.events, reactionDecisions);

  const batches = [
    batch('perception-cycle', 'party_perception_cycles', [{
      party_id: cycle.party_id, cycle_id: cycle.cycle_id, turn_id: first.turn_id, wave_index: first.wave_index, wave_count: cycle.wave_count,
      state_version: cycle.state_version, snapshot_digest: cycle.snapshot_digest, perception_algorithm_id: pins.perception_algorithm_id,
      sensory_catalog_digest: pins.sensory_catalog_digest, reaction_policy_digest: pins.reaction_policy_digest,
      idempotency_key: `perception:${cycle.party_id}:${cycle.cycle_id}:${cycle.trace_digest}`, trace: { trace_digest: cycle.trace_digest, waves: cycle.waves }
    }]),
    batch('perception-events', 'party_sensory_events', cycle.events.map((event) => ({
      party_id: event.party_id, event_id: event.event_id, cycle_id: cycle.cycle_id, turn_id: event.turn_id, wave_index: event.wave_index, parent_event_id: event.parent_event_id ?? null, causal_reaction_id: event.causal_reaction_id ?? null,
      modality: event.modality, source_kind: event.source_kind, source_id: event.source_id, source_anchor_id: event.source_anchor_id,
      signal_profile_id: event.signal_profile_id, causal_action_id: event.causal_action_id, emitted_at: event.emitted_at,
      duration_ms: event.duration_ms, base_strength_units: event.base_strength_units, directionality_profile_id: event.directionality_profile_id,
      semantic_class_id: event.semantic_class_id, routine_context_tags: event.routine_context_tags, state_version: event.state_version, profile_digest: event.profile_digest
    }))),
    batch('perception-results', 'party_perception_results', cycle.results.map((result) => ({
      party_id: cycle.party_id, result_id: result.result_id, event_id: result.event_id, observer_kind: result.observer_kind,
      observer_id: result.observer_id, observer_anchor_id: result.observer_anchor_id, modality: result.modality,
      physical_reach: result.physical_reach, perceived: result.perceived, perception_level: result.perception_level,
      direction_resolution: result.direction_resolution, identified_source_id: result.identified_source_id,
      identified_semantic_class_id: result.identified_semantic_class_id, speech_content_id: result.speech_content_id,
      confidence_band: result.confidence_band, path_id: result.path_id, arrival_strength_units: result.arrival_strength_units,
      threshold_units: result.threshold_units, margin_units: result.margin_units, applied_profile_ids: result.applied_profile_ids,
      check_result_id: result.check_result_id, trace_digest: result.trace_digest, state_version: result.state_version
    }))),
    batch('perception-awareness', 'party_npc_awareness_states', cycle.awareness_states.map((awareness) => ({
      id: `awareness:${cycle.party_id}:${awareness.npc_id}`, party_id: cycle.party_id, npc_id: awareness.npc_id, awareness_state: awareness.next_state,
      updated_by_event_id: awareness.event_id, state_version: cycle.state_version,
      trace: { previous_state: awareness.previous_state, reason: awareness.reason, reaction_policy_id: awareness.reaction_policy_id }
    })), 'upsert_with_idempotency'),
    batch('perception-stimuli', 'party_stimulus_memory', cycle.awareness_states.filter((entry) => entry.reaction_required).map((awareness) => ({
      party_id: cycle.party_id, npc_id: awareness.npc_id, event_id: awareness.event_id, reaction_policy_id: awareness.reaction_policy_id,
      significance_band: awareness.significance_band, expires_at: null, trace: { next_state: awareness.next_state, reason: awareness.reason }
    }))),
    batch('npc-reaction-decision-requests', 'party_decision_requests', reactionDecisions.filter((decision) => decision.resolution_kind === 'bounded_decision').map((decision) => ({
      party_id: cycle.party_id, request_id: decision.decision_request.request_id, policy_id: decision.decision_request.policy_id, policy_version: decision.decision_request.policy_version, actor_id: decision.decision_request.actor_id, state_version: decision.decision_request.state_version, issued_at: decision.decision_request.issued_at, expires_at: decision.decision_request.expires_at, options_digest: decision.decision_request.options_digest, idempotency_key: `npc-reaction:${cycle.party_id}:${decision.routing_id}`, status: 'resolved', input_digest: sha256({ routing_id: decision.routing_id, options_digest: decision.decision_request.options_digest }), validation_report: { pass: true }
    }))),
    batch('npc-reaction-decision-options', 'party_decision_options', reactionDecisions.filter((decision) => decision.resolution_kind === 'bounded_decision').flatMap((decision) => decision.decision_request.options.map((option) => ({
      party_id: cycle.party_id, request_id: decision.decision_request.request_id, option_id: option.option_id, command_id: option.command_id, command_token_digest: sha256(option.command_token), ordinal: option.ordinal, metadata: option.metadata
    })))),
    batch('npc-reaction-decision-results', 'party_decision_results', reactionDecisions.filter((decision) => decision.resolution_kind === 'bounded_decision').map((decision) => ({
      party_id: cycle.party_id, request_id: decision.decision_request.request_id, option_id: decision.decision_result.option_id, state_version: decision.decision_result.state_version, response_digest: decision.decision_result.response_digest
    }))),
    batch('npc-reaction-decisions', 'party_npc_reaction_decisions', reactionDecisions.map((decision) => ({
      party_id: cycle.party_id, reaction_decision_id: decision.reaction_decision_id, routing_id: decision.routing_id, event_id: decision.event_id, npc_id: decision.npc_id, reaction_policy_id: decision.reaction_policy_id, resolution_kind: decision.resolution_kind, request_id: decision.decision_request?.request_id ?? null, selected_option_id: decision.selected_option_id, command_id: decision.command_id, state_version: decision.state_version, trace: { effect: decision.effect, ...(decision.decision_result ? { response_digest: decision.decision_result.response_digest } : {}) }
    }))),
    batch('npc-reaction-event-causes', 'party_sensory_event_reaction_causes', cycle.events.filter((event) => event.wave_index > 0).map((event) => ({
      party_id: cycle.party_id, event_id: event.event_id, reaction_decision_id: event.causal_reaction_id
    })))
  ].filter((entry) => entry.records.length > 0);
  return Object.freeze({ transaction: { write_order: batches.map((entry) => entry.batch_id) }, write_batches: batches });
}

export async function writePerceptionCycle(transaction, { cycle, pins, reactionDecisions = [], decisionSecret = null, decisionPreconditionEvaluator = null, errorFactory }) {
  const plan = buildPerceptionPersistencePlan({ cycle, pins, reactionDecisions, decisionSecret, decisionPreconditionEvaluator });
  const cycleRecord = plan.write_batches.find((batch) => batch.target_table === 'party_perception_cycles')?.records?.[0];
  const existing = await transaction.query(`SELECT trace FROM party_runtime.party_perception_cycles
    WHERE party_id=$1 AND idempotency_key=$2 FOR UPDATE`, [cycle.party_id, cycleRecord.idempotency_key]);
  if (existing.rows.length === 1) {
    if (existing.rows[0].trace?.trace_digest !== cycle.trace_digest) throw errorFactory('PERCEPTION_IDEMPOTENCY_CONFLICT', 'Perception idempotency key is already bound to another cycle trace.');
    return { replayed: true, cycle_id: cycle.cycle_id };
  }
  const party = await transaction.query('SELECT state_version FROM party_runtime.parties WHERE party_id=$1 FOR UPDATE', [cycle.party_id]);
  if (party.rows.length !== 1) throw errorFactory('PERCEPTION_PARTY_NOT_FOUND', 'Perception cycle party does not exist.');
  if (Number(party.rows[0].state_version) !== cycle.state_version) throw errorFactory('PERCEPTION_STATE_VERSION_STALE', 'Perception cycle state version is stale.');
  await ensurePerceptionPins(transaction, cycle.party_id, pins, errorFactory);
  const { executePhysicalWritePlan } = await import('./sql-plan.js');
  await executePhysicalWritePlan(transaction, plan);
  return { replayed: false, cycle_id: cycle.cycle_id };
}

function batch(batch_id, target_table, records, operation_mode = 'insert_only') {
  return { batch_id, target_schema: 'party_runtime', target_table, operation_mode, records };
}
function validatePins(pins) {
  for (const field of ['perception_algorithm_id', 'sensory_catalog_digest', 'reaction_policy_digest']) {
    if (typeof pins?.[field] !== 'string' || !pins[field].trim()) throw perceptionError('PERCEPTION_PINS_INVALID', `${field} is required.`);
  }
  for (const field of ['sensory_catalog_digest', 'reaction_policy_digest']) if (!/^[a-f0-9]{64}$/u.test(pins[field])) throw perceptionError('PERCEPTION_PINS_INVALID', `${field} must be a SHA-256 digest.`);
}
function validateReactionDecisions({ cycle, reactionDecisions, eventIds, decisionSecret, decisionPreconditionEvaluator, now }) {
  if (!Array.isArray(reactionDecisions)) throw perceptionError('NPC_REACTION_DECISIONS_INVALID', 'reactionDecisions must be an array.');
  const routings = new Map(cycle.reaction_routings.filter((routing) => routing.status !== 'no_reaction').map((routing) => [routing.routing_id, routing]));
  const seen = new Set();
  for (const decision of reactionDecisions) {
    if (!decision || decision.version !== 1 || decision.schema !== 'npc_reaction_decision_v1' || typeof decision.reaction_decision_id !== 'string' || !decision.reaction_decision_id || typeof decision.routing_id !== 'string' || seen.has(decision.routing_id)) throw perceptionError('NPC_REACTION_DECISIONS_INVALID', 'Reaction decisions must have unique, well-formed routing IDs.');
    seen.add(decision.routing_id);
    const routing = routings.get(decision.routing_id);
    if (!routing || decision.party_id !== cycle.party_id || decision.event_id !== routing.event_id || !eventIds.has(decision.event_id) || decision.npc_id !== routing.observer_id || decision.reaction_policy_id !== routing.reaction_policy_id || decision.state_version !== cycle.state_version) throw perceptionError('NPC_REACTION_DECISION_UNBOUND', 'Reaction decision is not bound to the cycle routing.');
    const option = routing.options.find((entry) => entry.option_id === decision.selected_option_id && entry.command_id === decision.command_id);
    if (!option) throw perceptionError('NPC_REACTION_DECISION_OPTION_INVALID', 'Reaction decision is outside the routed option set.');
    if (decision.resolution_kind === 'code_singleton') {
      if (routing.status !== 'code_reaction' || decision.decision_request || decision.decision_result) throw perceptionError('NPC_REACTION_DECISION_KIND_INVALID', 'Code reaction must be a singleton without bounded-decision artifacts.');
    } else if (decision.resolution_kind === 'bounded_decision') {
      if (routing.status !== 'bounded_decision_required' || !decision.decision_request || !decision.decision_response || !decision.decision_result || decision.decision_request.party_id !== cycle.party_id || decision.decision_request.actor_id !== routing.observer_id || decision.decision_result.request_id !== decision.decision_request.request_id || decision.decision_result.option_id !== decision.selected_option_id || decision.decision_result.command_id !== decision.command_id || !decisionSecret) throw perceptionError('NPC_REACTION_DECISION_KIND_INVALID', 'Bounded reaction must preserve a revalidatable signed request and result.');
      const checked = validateBoundedDecisionResult({ request: decision.decision_request, result: decision.decision_response, secret: decisionSecret, now, currentPolicyVersion: 'perception_v1', evaluatePrecondition: decisionPreconditionEvaluator });
      if (checked.request_id !== decision.decision_result.request_id || checked.option_id !== decision.selected_option_id || checked.command_id !== decision.command_id || checked.response_digest !== decision.decision_result.response_digest) throw perceptionError('NPC_REACTION_DECISION_TAMPERED', 'Bounded reaction result changed after turn-stage validation.');
    } else throw perceptionError('NPC_REACTION_DECISION_KIND_INVALID', 'Unknown reaction resolution kind.');
  }
  if (seen.size !== routings.size) throw perceptionError('NPC_REACTION_DECISIONS_INCOMPLETE', 'Every reaction routing must be executed before persistence.');
}
function validateSecondaryEventCausality(events, reactionDecisions) {
  const reactions = new Map(reactionDecisions.map((decision) => [decision.reaction_decision_id, decision]));
  for (const event of events.filter((entry) => entry.wave_index > 0)) {
    const reaction = reactions.get(event.causal_reaction_id);
    if (!reaction || reaction.event_id !== event.parent_event_id) throw perceptionError('PERCEPTION_SECONDARY_CAUSALITY_INVALID', 'Secondary event must be caused by a reaction to its parent event.');
  }
}
async function ensurePerceptionPins(transaction, partyId, pins, errorFactory) {
  const existing = await transaction.query(`SELECT perception_algorithm_id,sensory_catalog_digest,reaction_policy_digest
    FROM party_runtime.party_perception_pins WHERE party_id=$1 FOR UPDATE`, [partyId]);
  if (existing.rows.length === 0) {
    await transaction.query(`INSERT INTO party_runtime.party_perception_pins
      (party_id,perception_algorithm_id,sensory_catalog_digest,reaction_policy_digest) VALUES ($1,$2,$3,$4)`,
    [partyId, pins.perception_algorithm_id, pins.sensory_catalog_digest, pins.reaction_policy_digest]);
    return;
  }
  const row = existing.rows[0];
  if (row.perception_algorithm_id !== pins.perception_algorithm_id || row.sensory_catalog_digest !== pins.sensory_catalog_digest || row.reaction_policy_digest !== pins.reaction_policy_digest) throw errorFactory('PERCEPTION_VERSION_PINS_MISMATCH', 'Perception catalog pins may not change within a party.');
}
function perceptionError(code, message) { return Object.assign(new Error(message), { code }); }
