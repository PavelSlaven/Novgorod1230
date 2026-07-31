import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { event } from './first-playable/plan-traversal-evidence.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function appendActivity({ inserts, updates, appends, state, factual, intent,
  traversal, first, terminal, turnNumber, changeSetId, idemId }) {
  const execution = activityRecord({ state, factual, intent, traversal,
    first, terminal, changeSetId, idemId });
  (first ? inserts : updates).push(row(
    'party_timed_activity_executions', intent.execution_id, execution));
  appends.push(row('party_timed_activity_attempts',
    `${intent.execution_id}:${intent.attempt.ordinal}`,
    activityAttempt({ state, intent, traversal, terminal, turnNumber,
      changeSetId, idemId })));
  if (!first) return;
  const actors = [
    ['player_character', state.actor_id, 'player_clerk'],
    ['npc', intent.internal_rebinding.initial_carrier_ids[1],
      'eremey_fisher'],
    ['npc', intent.internal_rebinding.initial_carrier_ids[2],
      'ratsha_storehouse_helper'],
    ['npc', intent.internal_rebinding.replacement_carrier_id,
      'resolved_participating_fisher'],
    ['npc', intent.carried_actor_id, 'onisim_boatman']
  ];
  for (const [kind, id, role] of actors) {
    inserts.push(row('party_activity_participant_bindings',
      `${intent.execution_id}:${kind}:${id}`, {
        activity_execution_id: intent.execution_id,
        participant_kind: kind,
        participant_id: id,
        role_id: role,
        required: true,
        status: 'active',
        bound_change_set_id: changeSetId,
        terminal_change_set_id: null,
        state_version: 1
      }));
  }
  for (const resourceId of [intent.assembly_snapshot.net_item_id,
    intent.assembly_snapshot.poles_item_id]) {
    appends.push(row('party_activity_resource_bindings',
      `${intent.execution_id}:item:${resourceId}:required_tool`, {
        activity_execution_id: intent.execution_id,
        resource_kind: 'item',
        resource_id: resourceId,
        binding_kind: 'required_tool',
        quantity_numerator: 1,
        quantity_denominator: 1,
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        consumption_policy_ref: {
          policy: 'preserve_phase_5_terminal_resource_state',
          assembly_snapshot_digest:
            intent.assembly_snapshot.canonical_digest
        },
        state_version: 1
      }));
  }
}

function activityRecord({ state, factual, intent, traversal, first,
  terminal, changeSetId, idemId }) {
  const current = Number(intent.cumulative_elapsed_after.numerator);
  const startedAt = first ? traversal.clock_before
    : state.phase6_carry_execution.started_at;
  return {
    id: intent.execution_id,
    route_plan_execution_id: null,
    plan_step_ordinal: null,
    series_ordinal: 0,
    activity_snapshot: {
      activity_profile_ref: 'trace_ld_v1_activity_make_stretcher_and_carry',
      route_ref: intent.route_ref,
      assembly_snapshot: intent.assembly_snapshot,
      replacement_boundary: replacementBoundary(intent)
    },
    original_total_minutes: 20,
    cumulative_elapsed_numerator: current,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: 20 - current,
    remaining_time_denominator: 1,
    next_attempt_ordinal: intent.execution_after.next_attempt_ordinal,
    status: terminal ? 'completed' : 'paused',
    state_version: !first && terminal
      ? intent.attempt.ordinal + 3
      : intent.attempt.ordinal + 2,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: terminal ? changeSetId : null,
    execution_scope: 'standalone',
    activity_series_id:
      `series:${state.party_id}:trace-phase6:carry`,
    activity_owner_ref: { entity_kind: 'party', entity_id: state.party_id },
    origin_location_snapshot: traversal.source_endpoint,
    execution_context_snapshot: traversal.context_snapshot,
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: first ? factual.player_input.request_id
        : state.phase6_history[0].request_id
    },
    originating_command_digest: canonicalDigest({
      activity_ref: 'trace_ld_v1_activity_make_stretcher_and_carry',
      party_id: state.party_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes: startedAt.whole_minutes,
    started_at_subminute_numerator: startedAt.subminute_numerator,
    started_at_subminute_denominator: startedAt.subminute_denominator,
    last_processed_at_whole_minutes:
      traversal.clock_update.world_time_after.whole_minutes,
    last_processed_at_subminute_numerator:
      traversal.clock_update.world_time_after.subminute_numerator,
    last_processed_at_subminute_denominator:
      traversal.clock_update.world_time_after.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {
      unit_id: 'route_progress_ppm',
      current: intent.progress_after_ppm,
      required: 1000000
    },
    preconditions_digest: intent.canonical_digest,
    terminal_reason_code: terminal
      ? 'synchronized_carry_completed' : null
  };
}

function activityAttempt({ state, intent, traversal, terminal, turnNumber,
  changeSetId, idemId }) {
  const before = Number(intent.cumulative_elapsed_before.numerator);
  const after = Number(intent.cumulative_elapsed_after.numerator);
  return {
    activity_execution_id: intent.execution_id,
    attempt_ordinal: intent.attempt.ordinal,
    remaining_before_numerator: 20 - before,
    remaining_before_denominator: 1,
    planned_time_numerator: Number(intent.exact_elapsed.numerator),
    planned_time_denominator: 1,
    actual_time_numerator: Number(intent.exact_elapsed.numerator),
    actual_time_denominator: 1,
    remaining_after_numerator: 20 - after,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: before,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: after,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries:
      Number(traversal.interval_result.crossed_whole_minute_boundaries),
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: traversal.context_snapshot,
    result_kind: terminal ? 'completed' : 'paused',
    result_code: terminal
      ? 'synchronized_carry_completed'
      : 'external_temporal_boundary',
    dynamic_dependency_pins: traversal.dependency_pins,
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: traversal.clock_before.whole_minutes,
    started_at_subminute_numerator:
      traversal.clock_before.subminute_numerator,
    started_at_subminute_denominator:
      traversal.clock_before.subminute_denominator,
    ended_at_whole_minutes:
      traversal.clock_update.world_time_after.whole_minutes,
    ended_at_subminute_numerator:
      traversal.clock_update.world_time_after.subminute_numerator,
    ended_at_subminute_denominator:
      traversal.clock_update.world_time_after.subminute_denominator,
    reason_code: terminal
      ? 'synchronized_carry_completed'
      : 'external_temporal_boundary',
    progress_before: {
      unit_id: 'route_progress_ppm',
      current: intent.progress_before_ppm,
      required: 1000000
    },
    progress_after: {
      unit_id: 'route_progress_ppm',
      current: intent.progress_after_ppm,
      required: 1000000
    },
    resource_reservations: [
      intent.assembly_snapshot.net_item_id,
      intent.assembly_snapshot.poles_item_id
    ],
    resource_consumptions: [],
    body_effect_refs:
      intent.body_effects_by_subject.map(({ profile_ref: ref }) => ref),
    participant_attendance: attendance(intent),
    rule_and_policy_pins: traversal.dependency_pins,
    trace: {
      external_boundary_refs: intent.attempt.external_boundary_refs,
      external_boundary_batch: intent.attempt.external_boundary_batch,
      internal_rebinding: intent.internal_rebinding,
      carrier_inventory_snapshots: intent.carrier_inventory_snapshots,
      traversal_interval_id: traversal.ids.interval_id
    }
  };
}

function attendance(intent) {
  const before = Number(intent.cumulative_elapsed_before.numerator);
  const after = Number(intent.cumulative_elapsed_after.numerator);
  const boundaryMinute = intent.internal_rebinding.elapsed_minutes;
  const totalMinutes = boundaryMinute * 1000000
    / intent.internal_rebinding.route_progress_ppm;
  const rows = [
    [intent.internal_rebinding.initial_carrier_ids[0], 'player_clerk', 0,
      boundaryMinute],
    [intent.internal_rebinding.initial_carrier_ids[1], 'eremey_fisher', 0,
      totalMinutes],
    [intent.internal_rebinding.initial_carrier_ids[2],
      'ratsha_storehouse_helper', 0, totalMinutes],
    [intent.internal_rebinding.replacement_carrier_id,
      'resolved_participating_fisher', boundaryMinute, totalMinutes],
    [intent.carried_actor_id, 'onisim_boatman', 0, totalMinutes]
  ];
  return rows.flatMap(([participantId, roleId, start, end]) => {
    const attendedFrom = Math.max(before, start);
    const attendedTo = Math.min(after, end);
    return attendedTo <= attendedFrom ? [] : [{
      participant_id: participantId,
      participant_kind: roleId === 'player_clerk'
        ? 'player_character' : 'npc',
      role_id: roleId,
      cumulative_start_minute: attendedFrom,
      cumulative_end_minute: attendedTo,
      elapsed_minutes: attendedTo - attendedFrom
    }];
  });
}

function replacementBoundary(intent) {
  const value = structuredClone(intent.internal_rebinding);
  delete value.initial_carrier_ids;
  delete value.replacement_carrier_id;
  delete value.replaced_carrier_id;
  delete value.player_decision_required;
  delete value.preserve_elapsed;
  delete value.preserve_progress;
  delete value.applied_in_this_attempt;
  delete value.body_effect_due_in_this_attempt;
  delete value.deferred_by_same_time_external;
  delete value.effect_occurred_at;
  delete value.temporal_candidate;
  return value;
}
