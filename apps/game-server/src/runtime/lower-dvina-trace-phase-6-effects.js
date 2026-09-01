import { applyBodyStateChange } from '@rus/body-state';
import { scenePresentationForLocation } from
  './lower-dvina-trace-scene-presentation.js';

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

export function createTracePhase6VisibleProjector({
  fallback, scenePresentation = null
}) {
  return { async project(input) {
    if (input.consequence?.phase6_kind !== 'synchronized_carry') {
      return fallback.project(input);
    }
    const intent = input.consequence.carry.intent;
    const terminal = intent.execution_after.status === 'completed';
    const current = currentScene(input);
    if (!terminal) return {
      ...current,
      visible_scene: current.visible_scene || 'Переноска остановилась в пути.',
      visible_changes: unique([...current.visible_changes,
        'Переноска с Онисимом остановилась в пути.']),
      known_context: unique([...current.known_context,
        'До рыбацкого стана ещё не дошли.']),
      do_not_imply: unique([...current.do_not_imply,
        'independent_onisim_movement', 'rerolled_carrier_replacement',
        'uncommitted_terminal_arrival'])
    };
    const profile = scenePresentation == null ? null
      : scenePresentationForLocation({ scenePresentation,
        locationRef: intent.terminal_group_position.location_ref });
    const group = new Set(intent.terminal_group_ids);
    return {
      version: 1, schema: 'visible_context_package',
      visible_scene: profile?.display_name
        ?? 'Группа доставила Онисима в рыбацкий стан.',
      visible_changes: ['Вы дошли до рыбацкого стана вместе с носильщиками и Онисимом.'],
      sensory_details: profile?.player_visible_physical_facts ?? [],
      visible_npc: current.visible_npc.filter(
        ({ entity_ref: ref }) => group.has(ref?.entity_id)),
      visible_objects: [],
      known_context: profile == null ? [] : [profile.display_name],
      uncertainties: [], allowed_tensions: [],
      do_not_imply: [
        'independent_onisim_movement', 'rerolled_carrier_replacement',
        'uncommitted_terminal_arrival'
      ]
    };
  } };
}

function currentScene(input) {
  const current = input?.retrieved_state?.current_visible_context;
  return current?.schema === 'visible_context_package'
    ? structuredClone(current)
    : { version: 1, schema: 'visible_context_package', visible_scene: '',
      visible_changes: [], sensory_details: [], visible_npc: [],
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: [] };
}

function unique(values) {
  return [...new Set(values)];
}
