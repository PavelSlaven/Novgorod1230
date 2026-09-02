import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { assertPhase7BodyHistory } from
  './lower-dvina-trace-phase-7-read-body.js';
import { assertPhase7PersistedActivity } from
  './lower-dvina-trace-phase-7-activity-read.js';

export async function assertPhase7NormalizedRows(pool, payload) {
  const phase7 = payload.phase7_fire_rest;
  if (phase7 == null) return;
  const completed = phase7.status === 'completed';
  const paused = phase7.status === 'paused';
  if ((!completed && !paused)
      || (completed && phase7.exact_elapsed_minutes !== 30)
      || (paused && (phase7.exact_elapsed_minutes < 25
        || phase7.exact_elapsed_minutes >= 30
        || phase7.resume_state == null
        || phase7.body_effect_ref !== null))
      || !phase7.activity_execution_id
      || !phase7.decision_request_id) fail();

  const zhdanko = payload.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  const bag = payload.containers.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag');
  if (!zhdanko || !bag) fail();

  const [activity, attempts, decision, npc, container, conditions, bodyHistory] =
    await Promise.all([
      pool.query(
        `SELECT id,status,state_version::text,activity_snapshot,
                execution_context_snapshot,
                cumulative_elapsed_numerator::text,
                cumulative_elapsed_denominator::text,
                remaining_time_numerator::text,
                remaining_time_denominator::text,next_attempt_ordinal,
                started_at_whole_minutes::text,
                last_processed_at_whole_minutes::text,
                terminal_change_set_id
           FROM party_runtime.party_timed_activity_executions WHERE id=$1`,
        [phase7.activity_execution_id]),
      pool.query(
        `SELECT attempt_ordinal,actual_time_numerator::text,
                actual_time_denominator::text,result_kind,result_code,
                clock_commit_mode,trace,body_effect_refs,
                started_at_whole_minutes::text,
                ended_at_whole_minutes::text,result_change_set_id
           FROM party_runtime.party_timed_activity_attempts
          WHERE activity_execution_id=$1 ORDER BY attempt_ordinal`,
        [phase7.activity_execution_id]),
      pool.query(
        `SELECT request_id,boundary_id,boundary_snapshot,signal_records
           FROM party_runtime.party_npc_decision_traces
          WHERE party_id=$1 AND request_id=$2`,
        [payload.party_id, phase7.decision_request_id]),
      pool.query(
        `SELECT npc_id,anchor_id,machine_state
           FROM party_runtime.party_npcs
          WHERE party_id=$1 AND npc_id=$2`,
        [payload.party_id, zhdanko.instance_id]),
      pool.query(
        `SELECT container_id,template_id,holder_npc_id,closure_state,
                state,state_version::text,updated_change_set_id
           FROM party_runtime.party_containers
          WHERE party_id=$1 AND container_id=$2`,
        [payload.party_id, bag.container_id]),
      pool.query(
        `SELECT condition_id,condition_profile_ref,status,state_version
           FROM party_runtime.party_actor_active_conditions
          WHERE party_id=$1 AND actor_kind='player_character'
            AND actor_id=$2 ORDER BY condition_id`,
        [payload.party_id, payload.actor_id]),
      pool.query(
        `SELECT subject_kind,subject_id,effect_ref,
                occurred_at_whole_minutes::text,
                occurred_at_subminute_numerator::text,
                occurred_at_subminute_denominator::text,change_set_id
           FROM party_runtime.party_body_temporal_history
          WHERE party_id=$1 AND history_id=$2`,
        [payload.party_id,
          `body-history:${payload.party_id}:trace-phase7:fire-rest`])
    ]);

  assertPhase7PersistedActivity(payload, activity, attempts, decision);
  assertNpcAndContainer(payload, phase7, zhdanko, bag, npc, container);
  assertConditions(payload, conditions);
  if (completed) {
    assertPhase7BodyHistory(payload, bodyHistory);
  } else if (bodyHistory.rowCount !== 0
      || (payload.body_effect_history ?? []).some(
        ({ activity_attempt_id: id }) =>
          id === phase7.activity_execution_id)) fail();
}

function assertNpcAndContainer(payload, phase7, zhdanko, bag, npc, container) {
  const npcRow = npc.rows[0];
  const bagRow = container.rows[0];
  const bagChangedAfterPhase7 = (payload.phase9?.checkpoints ?? []).some(
    ({ kind }) => ['bag_recovery', 'bag_opened'].includes(kind));
  const firstEntryAnchor = payload.first_entry_preparation?.scene?.anchor
    ?.instance_id;
  const expectedNpcAnchor = payload.first_entry_preparation?.spatial_v3
    ?.target?.status === 'prepared' && zhdanko.anchor_id === firstEntryAnchor
    ? null : zhdanko.anchor_id;
  if (npc.rowCount !== 1 || container.rowCount !== 1
      || npcRow.npc_id !== zhdanko.instance_id
      || npcRow.anchor_id !== expectedNpcAnchor
      || canonicalDigest(npcRow.machine_state)
        !== canonicalDigest(zhdanko.machine_state)
      || canonicalDigest(npcRow.machine_state?.last_schedule_execution)
        !== canonicalDigest(phase7.schedule_result)
      || bagRow.container_id !== bag.container_id
      || bagRow.template_id !== bag.template_id
      || (bagChangedAfterPhase7
        ? !hasPhase7BagTransition(bagRow.state, phase7)
        : bagRow.holder_npc_id !== bag.holder_npc_id
          || bagRow.closure_state !== bag.closure_state
          || canonicalDigest(bagRow.state) !== canonicalDigest(bag.state)
          || Number(bagRow.state_version) !== bag.state_version
          || (phase7.schedule_option_id === 'move_bag'
            && bagRow.updated_change_set_id !== phase7.change_set_id))) fail();
}

function hasPhase7BagTransition(state, phase7) {
  if (phase7.schedule_option_id !== 'move_bag') return true;
  return (state?.approved_transition_history ?? []).some((transition) =>
    transition.change_set_id === phase7.change_set_id
      && transition.transition_profile_id
        === 'trace_ld_v1_property_bag_to_river_access');
}

function assertConditions(payload, result) {
  const expected = [...(payload.body_state.active_conditions ?? [])]
    .sort((left, right) => left.storage_condition_id.localeCompare(
      right.storage_condition_id));
  if (result.rowCount !== expected.length) fail();
  for (const [index, condition] of expected.entries()) {
    const row = result.rows[index];
    if (row.condition_id !== condition.storage_condition_id
        || row.status !== 'active'
        || Number(row.state_version) !== condition.state_version
        || canonicalDigest(row.condition_profile_ref)
          !== canonicalDigest(condition.condition_profile_ref)) fail();
  }
}

function fail() { throw phase2IntegrityError(); }
