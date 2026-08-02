import { applyBodyStateChange } from '@rus/body-state';

export function createTracePhase6TemporalAdvance({ fallback }) {
  return async (input) => {
    if (input.consequence?.phase6_kind !== 'synchronized_carry') return fallback(input);
    const traversal = input.consequence.carry.traversal;
    const intent = input.consequence.carry.intent;
    const processed = [...intent.attempt.processed_boundary_ids];
    return { clock_before: structuredClone(traversal.clock_before),
      clock_after: structuredClone(traversal.clock_update.world_time_after),
      exact_elapsed: { exact_minutes: {
        numerator: traversal.interval_result.actual_time_numerator,
        denominator: traversal.interval_result.actual_time_denominator
      } },
      nearest_boundary: null,
      boundary_trace: {
        owner: '@rus/time-events-history/temporal-boundaries',
        policy: 'split_before_earliest_boundary',
        evaluated_candidate_count: intent.attempt.evaluated_candidate_count,
        earliest_batch_id: null,
        processed_boundary_ids: processed,
        deferred_to_source_owner_ids: [],
        root_clock_write_count: 1 } };
  };
}

export function createTracePhase6BodyEffect({ fallback, contracts }) {
  return { apply(input) {
    if (input.consequence?.phase6_kind !== 'synchronized_carry') return fallback.apply(input);
    const intent = input.consequence.carry.intent;
    const player = intent.body_effects_by_subject
      ?.find((value) => value.subject_ref === 'player_clerk');
    if (player == null) {
      return { owner: '@rus/body-state', applied: false, proposal: null,
        state_after: structuredClone(input.committed_state.body_state) };
    }
    const effect = player?.effect;
    if (intent.internal_rebinding.body_effect_due_in_this_attempt !== true
        || !effect
        || effect.effect_profile_id
          !== 'trace_ld_v1_body_carry_carrier_10m') {
      throw Object.assign(new Error('TRACE_PHASE_6_BODY_EFFECT_GAP'),
        { code: 'TRACE_PHASE_6_BODY_EFFECT_GAP' });
    }
    const delta = effect.exact_deltas;
    const replacementBoundary = intent.internal_rebinding;
    const state_after = applyBodyStateChange(input.committed_state.body_state, { restore: { health: 0, satiety: 0, energy: 0 }, harm: { health: Math.max(-delta.health, 0) }, spend: { satiety: Math.max(-delta.satiety, 0), energy: Math.max(-delta.energy, 0) } });
    return { owner: '@rus/body-state', applied: true, proposal: { profile_ref: effect.effect_profile_id, exact_deltas: structuredClone(delta), participation_elapsed: { exact_minutes: { numerator: String(replacementBoundary.elapsed_minutes), denominator: '1' } }, root_slice_elapsed: structuredClone(input.time_update.exact_elapsed), selection_policy: effect.selection_policy, rng_consumption: effect.rng_consumption, activity_attempt_id: input.consequence.activity_attempt_id, condition_transitions: [] }, state_after: { ...state_after, active_conditions: structuredClone(input.committed_state.body_state.active_conditions) } };
  } };
}

export function createTracePhase6VisibleProjector({ fallback }) {
  return { async project(input) { if (input.consequence?.phase6_kind !== 'synchronized_carry') return fallback.project(input); const intent = input.consequence.carry.intent; const terminal = intent.execution_after.status === 'completed'; return { version: 1, schema: 'visible_context_package', visible_scene: terminal ? 'Группа доставила Онисима в рыбацкий стан.' : 'Переноска остановлена на внешней временной границе; пройденный путь сохранён.', visible_changes: terminal ? ['onisim_carried_to_camp_committed'] : [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [`Пройдено ${intent.cumulative_elapsed_after.numerator} из 20 минут.`], uncertainties: [], allowed_tensions: [], do_not_imply: ['independent_onisim_movement', 'rerolled_carrier_replacement', 'uncommitted_terminal_arrival'] }; } };
}
