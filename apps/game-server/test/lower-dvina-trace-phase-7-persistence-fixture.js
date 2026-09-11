import { createNpcRoutineState, npcRoutineActivity } from '@rus/npc-runtime';
import { npcRoutineCandidate } from '../src/runtime/npc-routine-temporal.js';
import { phase7PlayerInput as playerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

export function addPhase7RoutineBoundary(state, boundaryMinute) {
  const npc = state.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
  const runtime = createNpcRoutineState({ started_at: state.clock, profile: {
    schema: 'npc_routine_profile_v1', profile_id: 'work-routine', revision: 1, status: 'approved',
    phases: ['work', 'rest'].map((state_id, index) => ({ state_id,
      duration_minutes: index === 0 ? boundaryMinute - Number(state.clock.whole_minutes) : 60,
      activity_ref: state_id, summary: state_id, activity_status: 'active',
      runtime_status: 'available', can_continue_automatically: true, decision_required: false }))
  } });
  npc.machine_state.current_activity = npcRoutineActivity(runtime);
  npc.machine_state.current_activity_ref = npc.machine_state.current_activity.activity_ref;
  const schedule = { id: 'routine-zhdanko', party_id: state.party_id,
    npc_id: npc.instance_id, state_version: 1, current_activity_execution_id: null,
    causal_state_ref: { routine_state: runtime }, npc_snapshot: structuredClone(npc),
    attention_state_ref: { entity_kind: 'condition_set', entity_id: 'attention' },
    body_state_ref: { entity_kind: 'body_state', entity_id: 'body' },
    knowledge_state_ref: { entity_kind: 'knowledge_fact', entity_id: 'knowledge' },
    relationship_state_ref: { entity_kind: 'condition_set', entity_id: 'relations' } };
  state.npc_schedule_runtime = [schedule];
  state.temporal_boundary_candidates.push(npcRoutineCandidate(schedule));
  return npc;
}

export function factualTurn(state, consequence, timeUpdate, bodyUpdate) {
  return { player_input: playerInput(state, 'persist'), mode_resolution: {
    option_id: 'rest_by_fire_and_dry_clothing',
    turn_id: `turn:${state.party_id}:${state.party_state.turn_number + 1}`,
    decision_trace: { state_version: state.party_state.state_version,
      action_set_digest: 'action-set' } }, consequence,
  time_update: timeUpdate, body_update: bodyUpdate };
}

export function timeUpdate(state, consequence, minutes) {
  return { clock_before: structuredClone(state.clock),
    clock_after: structuredClone(
      consequence.phase7.schedule_temporal.result.clock_after),
    exact_elapsed: { exact_minutes: {
      numerator: String(minutes), denominator: '1' } } };
}

export function versioned(entityKind, entityId) {
  return { entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: '1' };
}

export function externalBoundary(partyId, ruleRef, policyRef, wholeMinutes) {
  return { boundary_id: 'phase7-external-pause',
    boundary_kind: 'exact_timer', scheduled_at: { whole_minutes: wholeMinutes,
      subminute_numerator: '0', subminute_denominator: '1' },
    source_ref: { entity_kind: 'party_route_plan_execution_event',
      entity_id: 'phase7-external-event' },
    primary_subject_ref: { entity_kind: 'party', entity_id: partyId },
    subject_refs: [], scope_ref: { entity_kind: 'party', entity_id: partyId },
    rule_ref: ruleRef, policy_ref: policyRef,
    preconditions_digest: 'b'.repeat(64),
    resolution_class: 'execution_outcome', interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', 'hidden'),
    idempotency_key: 'phase7-external-pause', causal_parent_refs: [] };
}

export function visibleContext() {
  return { visible_scene: 'У костра одежда немного подсохла.',
    visible_changes: ['elapsed_30_minutes'],
    sensory_details: ['Одежда немного подсохла.'], visible_npc: [],
    visible_objects: [], known_context: ['Одежда всё ещё сыровата.'],
    uncertainties: [] };
}

export function rows(plan, table) {
  return [...plan.inserts, ...plan.updates, ...plan.appends]
    .filter(({ target_table: id }) => id === table);
}

export function phase7ReadPool(plan, snapshot) {
  const plans = Array.isArray(plan) ? plan : [plan];
  const records = (table) => plans.flatMap((candidate) =>
    rows(candidate, table).map(({ record }) => record));
  const one = (table) => records(table).at(-1);
  return { async query(sql) {
    let resultRows;
    if (sql.includes('party_timed_activity_executions')) {
      resultRows = [one('party_timed_activity_executions')].filter(Boolean);
    } else if (sql.includes('party_timed_activity_attempts')) {
      resultRows = records('party_timed_activity_attempts');
    } else if (sql.includes('party_npc_decision_traces')) {
      resultRows = [records('party_npc_decision_traces')[0]].filter(Boolean);
    } else if (sql.includes('party_npcs')) {
      const persisted = one('party_npcs');
      const npc = persisted == null
        ? snapshot.npcs.find(({ participant_slot_ref: slot }) =>
          slot === 'zhdanko_storehouse_controller')
        : snapshot.npcs.find(({ instance_id: id }) => id === persisted.npc_id);
      resultRows = [{ ...npc, ...persisted }];
    } else if (sql.includes('party_containers')) {
      const persisted = one('party_containers');
      const container = persisted == null
        ? snapshot.containers.find(({ template_id: id }) =>
          id === 'trace_ld_v1_container_road_bag')
        : snapshot.containers.find(
          ({ container_id: id }) => id === persisted.container_id);
      resultRows = [{ ...container, ...persisted }];
    } else if (sql.includes('party_actor_active_conditions')) {
      resultRows = snapshot.body_state.active_conditions.map((condition) => ({
        condition_id: condition.storage_condition_id,
        condition_profile_ref: condition.condition_profile_ref,
        status: condition.status, state_version: condition.state_version
      })).sort((left, right) => left.condition_id.localeCompare(
        right.condition_id));
    } else if (sql.includes('party_body_temporal_history')) {
      resultRows = records('party_body_temporal_history');
    } else throw new Error(`Unexpected Phase 7 read query: ${sql}`);
    return { rowCount: resultRows.length, rows: resultRows };
  } };
}
