import { canonicalDigest } from '@rus/materialization';
import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { projectSemanticConversationSnapshot } from
  './lower-dvina-trace-conversation-state.js';
import { applyConversationTemporalNpcWrites } from
  './lower-dvina-trace-conversation-temporal.js';
import { phase9ActivityRef } from './lower-dvina-trace-phase-9-writes.js';

export function nextPhase9State({ state, factual, nextVersion, turnNumber,
  changeSetId, inputDigest, contracts }) {
  const phase9 = factual.consequence.phase9;
  const kind = factual.consequence.phase9_kind;
  let next = structuredClone(state);
  const nextBody = factual.body_update.applied === false
    ? structuredClone(state.body_state)
    : commitPhase2BodyState({ before: state.body_state,
        proposed: factual.body_update.state_after });
  const bodyChanged = canonicalDigest(nextBody) !== canonicalDigest(
    state.body_state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = { ...next.party_state, state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    body_state_version: state.party_state.body_state_version
      + (bodyChanged ? 1 : 0), turn_number: turnNumber };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light = { ...structuredClone(next.clock_weather_light),
    clock: structuredClone(next.clock) };
  next.body_state = nextBody;
  next.phase9 = { ...(next.phase9 ?? { status: 'active',
    checkpoints: [], committed_facts: [] }) };
  applyKind(next, state, kind, phase9, factual, changeSetId);
  next.phase9.checkpoints = [...(next.phase9.checkpoints ?? []), {
    kind, turn_number: turnNumber, change_set_id: changeSetId }];
  next.phase9.committed_facts = [...new Set([
    ...(next.phase9.committed_facts ?? []), ...(phase9.committed_facts ?? [])
  ])].sort();
  const known = new Set((next.knowledge ?? []).map(({ fact_id: id }) => id));
  for (const factId of (phase9.committed_facts ?? []).filter(publicFact)) {
    if (!known.has(factId)) next.knowledge = [...(next.knowledge ?? []), {
      fact_id: factId, knowledge_state: 'known_from_committed_phase9_fact',
      evidence_refs: [changeSetId] }];
    known.add(factId);
  }
  next.knowledge = [...(next.knowledge ?? [])].sort(
    (left, right) => left.fact_id.localeCompare(right.fact_id));
  if (kind === 'temporary_disposition') {
    next.phase9.status = 'temporary_disposition_committed';
  }
  if (factual.consequence.duration_minutes > 0) {
    next.activity_history = [...(next.activity_history ?? []), {
      activity_execution_id:
        `activity:${state.party_id}:trace-phase9:${turnNumber}:${kind}`,
      activity_snapshot: { activity_ref: phase9ActivityRef(kind, contracts),
        phase_kind: kind },
      option_id: factual.mode_resolution.option_id,
      request_id: factual.player_input.request_id, input_digest: inputDigest,
      change_set_id: changeSetId,
      duration_minutes: factual.consequence.duration_minutes,
      started_at: structuredClone(factual.time_update.clock_before),
      ended_at: structuredClone(next.clock), execution_result: { kind } }];
  }
  next.last_turn = { request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest, raw_text: factual.player_input.raw_text,
    option_id: factual.mode_resolution.option_id,
    action_set_digest: factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace: structuredClone(factual.mode_resolution.decision_trace),
    consequence: safeConsequence(factual.consequence),
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update), visible_package: null,
    change_set_id: changeSetId };
  return next;
}

function applyKind(next, state, kind, phase9, factual, changeSetId) {
  if (['bag_recovery', 'bag_opened'].includes(kind)) {
    const current = state.containers.find(({ container_id: id }) =>
      id === phase9.property_transition.subject_id);
    replace(next.containers, 'container_id',
      phase9.property_transition.subject_id, {
        ...structuredClone(phase9.property_transition.next),
        state_version: Number(current?.state_version ?? 0) + 1
      });
  } else if (kind === 'packet_recovered') {
    replace(next.items, 'item_id', phase9.property_transition.subject_id,
      phase9.property_transition.next);
    next.phase9.seal_observation = structuredClone(phase9.seal_observation);
  } else if (kind === 'return_to_camp') {
    const movement = phase9.movement;
    next.position = { ...next.position,
      location_ref: movement.destination.location_ref,
      g5_anchor_id: movement.destination.g5_anchor_id,
      g5_node_id: movement.destination.g5_node_id };
    const moved = new Set(movement.participants.slice(1));
    next.npcs = (next.npcs ?? []).map((npc) => !moved.has(npc.instance_id)
      ? npc : { ...npc, anchor_id: movement.destination.g5_anchor_id,
        location_profile_ref: movement.destination.location_ref });
    next.route_history = [...(next.route_history ?? []), {
      route_ref: movement.route_ref,
      from_ref: movement.source.location_ref,
      to_ref: movement.destination.location_ref, status: 'completed' }];
  } else if (kind === 'onisim_testimony') {
    const semantic = phase9.semantic_exchange;
    if (semantic.exchange.applied_contribution_count > 0
        || semantic.exchange.stop_reason === 'npc_unavailable') {
      const projected = projectSemanticConversationSnapshot({ state: next,
        semanticExchange: semantic,
        rootTurnId: factual.mode_resolution.turn_id,
        workingRevision:
          factual.mode_resolution.decision_trace?.working_revision ?? 1,
        appliedChangeSetId: changeSetId });
      Object.assign(next, projected);
      applyConversationTemporalNpcWrites(next, semantic);
    }
    next.phase9.onisim_testimony = { response_kind: semantic.response_kind,
      testimony_committed: semantic.testimony_committed,
      statement_refs: semantic.statements.map(({ statement_id: id }) => id),
      evidence_lineage_refs: structuredClone(
        semantic.evidence_lineage_refs),
      objective_truth_write: 'forbidden' };
    next.phase9.case_evidence_ref = phase9.case_evidence_ref;
  } else if (kind === 'evidence_resolved') {
    next.phase9.evidence_resolution = structuredClone(
      phase9.evidence_resolution);
    next.phase9.temporary_disposition_options = structuredClone(
      phase9.temporary_disposition_options);
  } else if (kind === 'temporary_disposition') {
    applyTemporaryDisposition(next, phase9.temporary_disposition,
      changeSetId);
  } else {
    fail('TRACE_PHASE_9_STATE_KIND_INVALID');
  }
}

function applyTemporaryDisposition(next, proposal, changeSetId) {
  next.phase9.temporary_disposition = structuredClone(proposal);
  next.phase9.custody_state = structuredClone(proposal.custody_state);
  next.phase9.property_handover_plan = structuredClone(
    proposal.property_handover_plan);
  next.phase9.promise_memory = structuredClone(proposal.promise_memory);
  next.phase9.promise_outcome = structuredClone(proposal.promise_outcome);
  const heldSlots = new Set(proposal.custody_state.party_slots);
  const custodySlots = new Set(['ratsha_storehouse_helper',
    'zhdanko_storehouse_controller']);
  next.npcs = (next.npcs ?? []).map((npc) => {
    if (!custodySlots.has(npc.participant_slot_ref)) return npc;
    const held = heldSlots.has(npc.participant_slot_ref);
    return { ...npc, machine_state: { ...(npc.machine_state ?? {}),
      temporary_custody: held,
      temporary_custody_state: held
        ? structuredClone(proposal.custody_state) : null } };
  });
  const packet = (next.items ?? []).find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_sealed_packet');
  if (packet == null) fail('TRACE_PHASE_9_STATE_ENTITY_MISSING');
  packet.state = { ...(packet.state ?? {}), property_state: {
    ...(packet.state?.property_state ?? {}), temporary_handover_plan:
      structuredClone(proposal.property_handover_plan) } };
  const promise = next.promise_instances?.[0] ?? null;
  if (proposal.promise_outcome?.kind !== 'no_active_promise'
      && promise == null) {
    fail('TRACE_PHASE_9_PROMISE_STATE_MISSING');
  }
  if (promise != null) {
    const transition = proposal.promise_outcome?.transition ?? null;
    if (transition != null) {
      const projection = transition.current_state_projection;
      if (promise.current_state_fact !== projection.expected_previous_fact
          || promise.current_state !== 'active') {
        fail('TRACE_PHASE_9_PROMISE_STATE_CONFLICT');
      }
      promise.current_state_fact = projection.next_fact;
      promise.current_state = projection.next_fact.replace(
        'promise_current_', '');
    } else if (proposal.promise_outcome?.kind === 'terminal_state_recognized'
        && promise.current_state
          !== proposal.promise_outcome.recognized_current_state) {
      fail('TRACE_PHASE_9_PROMISE_STATE_CONFLICT');
    }
    promise.temporary_disposition_memory = structuredClone(
      proposal.promise_memory);
    promise.state_version = Number(promise.state_version)
      + (transition == null ? 1 : 2);
    promise.last_change_set_id = changeSetId;
  }
}

function replace(records, key, id, next) {
  const index = (records ?? []).findIndex((record) => record[key] === id);
  if (index < 0) fail('TRACE_PHASE_9_STATE_ENTITY_MISSING');
  records[index] = structuredClone(next);
}
function safeConsequence(consequence) {
  const copy = structuredClone(consequence);
  if (copy.phase9?.semantic_exchange) {
    copy.phase9.semantic_exchange = {
      response_kind: copy.phase9.semantic_exchange.response_kind,
      testimony_committed: copy.phase9.semantic_exchange.testimony_committed,
      statement_refs: copy.phase9.semantic_exchange.statements
        .map(({ statement_id: id }) => id), evidence_lineage_refs:
        structuredClone(copy.phase9.semantic_exchange.evidence_lineage_refs),
      objective_truth_writes: [] };
  }
  return copy;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
function publicFact(id) {
  return id.startsWith('trace_ld_v1_evidence_')
    || ['road_bag_recognized_by_physical_marks', 'sealed_packet_returned',
      'seal_intact', 'destroyed_packet_state_observed',
      'packet_lost_or_destroyed'].includes(id);
}
