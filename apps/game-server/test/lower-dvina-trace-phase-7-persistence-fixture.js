import { phase7PlayerInput as playerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

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
  return { visible_scene: 'У костра прошло полчаса.',
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
