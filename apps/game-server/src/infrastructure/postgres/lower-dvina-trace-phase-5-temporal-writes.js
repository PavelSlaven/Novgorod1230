import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';

export function appendPhase5ResourceStateWrites({ updates, appends, state,
  next, partyId, changeSetId, idemId, treatment, contracts }) {
  const templates = [contracts.ids.net, contracts.ids.poles,
    contracts.ids.water];
  for (const templateId of templates) {
    const before = state.items.filter(
      ({ template_id: id }) => id === templateId
    );
    const after = next.items.filter(
      ({ template_id: id }) => id === templateId
    );
    if (before.length !== 1 || after.length !== 1) {
      throw new Error('TRACE_PHASE_5_RESOURCE_WRITE_INSTANCE_INVALID');
    }
    if (canonicalDigest(before[0]) === canonicalDigest(after[0])) continue;
    const item = after[0];
    updates.push(row('party_item_placements', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      holder_npc_id: item.placement.holder_npc_id,
      holder_character_id: null,
      physical_position: item.placement.physical_position
    }));
    updates.push(row('party_ownership', item.ownership.ownership_id, {
      ...item.ownership,
      party_id: partyId,
      ownership_id: item.ownership.ownership_id,
      item_id: item.item_id
    }));
    updates.push(row('party_items', item.item_id, {
      party_id: partyId,
      item_id: item.item_id,
      condition_state: item.condition_state,
      state: item.state
    }));
  }
  const priorStages = new Set(
    state.phase5_treatment?.completed_stage_ids ?? []
  );
  if (treatment.completed_stage_ids.includes('prepare_cloth_and_expose_injury')
      && !priorStages.has('prepare_cloth_and_expose_injury')
      && !treatment.final) {
    appends.push(row('party_npc_runtime_transitions',
      `npc-transition:${partyId}:trace-phase5:release`, {
        transition_id: `npc-transition:${partyId}:trace-phase5:release`,
        party_id: partyId,
        npc_id: contracts.actors.onisim_boatman.instance_id,
        transition_kind: 'onisim_released_from_binding',
        event_id: null,
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        occurred_at_whole_minutes: next.clock.whole_minutes,
        occurred_at_subminute_numerator: next.clock.subminute_numerator,
        occurred_at_subminute_denominator: next.clock.subminute_denominator,
        trace: {
          transition_profile_id:
            contracts.resourceTransitions.ropeRelease.transition_profile_id,
          water_transition_profile_id:
            contracts.resourceTransitions.waterUse.transition_profile_id
        }
      }));
  }
}

export function phase5TimedExecutionRecord({ state, factual, execution, next,
  changeSetId, idemId, first }) {
  const current = Number(execution.progress.current.numerator);
  const terminal = execution.status === 'completed';
  return {
    id: execution.id,
    series_ordinal: 0,
    activity_snapshot: execution.activity_snapshot,
    original_total_minutes: 25,
    cumulative_elapsed_numerator: current,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: 25 - current,
    remaining_time_denominator: 1,
    next_attempt_ordinal: execution.next_attempt_ordinal,
    status: execution.status,
    state_version: Number(execution.state_version),
    updated_change_set_id: changeSetId,
    terminal_change_set_id: terminal ? changeSetId : null,
    execution_scope: 'standalone',
    activity_series_id: `series:${state.party_id}:trace-phase5:treatment`,
    activity_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id,
      treatment_stage_ids: factual.consequence.treatment.completed_stage_ids
    },
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: first
        ? factual.player_input.request_id
        : state.phase5_history[0].request_id
    },
    originating_command_digest: canonicalDigest({
      activity_ref: factual.consequence.treatment.activity_ref,
      party_id: state.party_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes: execution.started_at.whole_minutes,
    started_at_subminute_numerator: execution.started_at.subminute_numerator,
    started_at_subminute_denominator: execution.started_at.subminute_denominator,
    last_processed_at_whole_minutes: execution.last_processed_at.whole_minutes,
    last_processed_at_subminute_numerator:
      execution.last_processed_at.subminute_numerator,
    last_processed_at_subminute_denominator:
      execution.last_processed_at.subminute_denominator,
    next_boundary_at_whole_minutes:
      execution.next_boundary_at?.whole_minutes ?? null,
    next_boundary_at_subminute_numerator:
      execution.next_boundary_at?.subminute_numerator ?? null,
    next_boundary_at_subminute_denominator:
      execution.next_boundary_at?.subminute_denominator ?? null,
    progress: execution.progress,
    preconditions_digest: execution.preconditions_digest,
    terminal_reason_code: execution.terminal_reason_code ?? null
  };
}

export function phase5ActivityAttemptRecord({ attempt, execution, factual,
  turnNumber, changeSetId, idemId }) {
  const before = Number(attempt.progress_before.current.numerator);
  const after = Number(attempt.progress_after.current.numerator);
  return {
    activity_execution_id: execution.id,
    attempt_ordinal: attempt.attempt_ordinal,
    remaining_before_numerator: 25 - before,
    remaining_before_denominator: 1,
    planned_time_numerator: attempt.planned_elapsed.numerator,
    planned_time_denominator: attempt.planned_elapsed.denominator,
    actual_time_numerator: attempt.actual_elapsed.numerator,
    actual_time_denominator: attempt.actual_elapsed.denominator,
    remaining_after_numerator: 25 - after,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: before,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: after,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: attempt.actual_elapsed.numerator,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id,
      stage_ids: factual.consequence.treatment.completed_stage_ids
    },
    result_kind: attempt.outcome,
    result_code: attempt.reason_code,
    dynamic_dependency_pins: attempt.rule_and_policy_pins,
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: attempt.started_at.whole_minutes,
    started_at_subminute_numerator: attempt.started_at.subminute_numerator,
    started_at_subminute_denominator: attempt.started_at.subminute_denominator,
    ended_at_whole_minutes: attempt.ended_at.whole_minutes,
    ended_at_subminute_numerator: attempt.ended_at.subminute_numerator,
    ended_at_subminute_denominator: attempt.ended_at.subminute_denominator,
    reason_code: attempt.reason_code,
    progress_before: attempt.progress_before,
    progress_after: attempt.progress_after,
    resource_reservations: attempt.resource_reservations,
    resource_consumptions: attempt.resource_consumptions,
    body_effect_refs: attempt.body_effect_refs,
    participant_attendance: attempt.participant_attendance,
    rule_and_policy_pins: attempt.rule_and_policy_pins,
    trace: {
      ...attempt.trace,
      encountered_boundary_candidates: structuredClone(
        factual.consequence.treatment.encountered_boundary_candidates ?? []
      )
    }
  };
}
