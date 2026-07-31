import { addElapsedTime } from '@rus/time-events-history';
import { canonicalDigest } from '@rus/materialization';

export function createTracePhase5TemporalAdvance({ phase4Advance }) {
  return async (input) => {
    if (input.consequence?.phase5_kind == null) return phase4Advance(input);
    const treatment = input.consequence.treatment;
    const minutes = input.consequence.duration_minutes;
    if (!Number.isInteger(minutes) || minutes <= 0
      || treatment.progress_after - treatment.progress_before !== minutes) {
      fail('TRACE_PHASE_5_TEMPORAL_SLICE_INVALID');
    }
    return {
      clock_before: structuredClone(input.clock_before),
      clock_after: addElapsedTime(input.clock_before, {
        exact_minutes: { numerator: String(minutes), denominator: '1' }
      }),
      exact_elapsed: {
        exact_minutes: { numerator: String(minutes), denominator: '1' }
      },
      nearest_boundary: treatment.encountered_boundary_candidates?.length
        ? {
            scheduled_at: structuredClone(
              treatment.encountered_boundary_candidates[0].scheduled_at),
            boundary_ids: treatment.encountered_boundary_candidates
              .map(({ boundary_id: id }) => id)
          }
        : null,
      boundary_trace: {
        owner: '@rus/time-events-history/temporal-boundaries',
        policy: 'split_before_earliest_boundary',
        evaluated_candidate_count:
          input.relevant_state.temporal_boundary_candidates?.length ?? 0,
        processed_boundary_ids:
          structuredClone(treatment.processed_boundary_ids),
        deferred_to_source_owner_ids:
          treatment.encountered_boundary_candidates
            ?.map(({ boundary_id: id }) => id) ?? [],
        root_clock_write_count: 1
      }
    };
  };
}

export function createTracePhase5BodyEffect({ phase2BodyEffect, contracts }) {
  return Object.freeze({
    apply(input) {
      if (input.consequence?.phase5_kind == null) {
        return phase2BodyEffect.apply(input);
      }
      const treatment = input.consequence.treatment;
      if (!treatment.final) {
        return {
          owner: '@rus/body-state',
          applied: false,
          proposal: null,
          state_after: structuredClone(input.committed_state.body_state)
        };
      }
      const outcome = treatment.body_outcome;
      if (!outcome
        || input.consequence.body_effect_ref !== contracts.ids.bodyEffect
        || canonicalDigest(outcome.exact_deltas)
          !== canonicalDigest({ health: 0, satiety: 0, energy: 0 })
        || outcome.condition_outcomes?.length !== 1
        || outcome.condition_outcomes[0].from !== 'injured_unable_to_walk'
        || !['injured_unable_to_walk', 'stabilized_unable_to_walk']
          .includes(outcome.condition_outcomes[0].to)) {
        fail('TRACE_PHASE_5_BODY_PROPOSAL_INVALID');
      }
      return {
        owner: '@rus/body-state',
        applied: true,
        proposal: {
          schema: 'rus.body_state.fixed_condition_outcome_proposal.v1',
          profile_ref: contracts.ids.bodyEffect,
          profile_digest: canonicalDigest(contracts.bodyEffect),
          subject_ref: contracts.actors.onisim_boatman.instance_id,
          exact_deltas: structuredClone(outcome.exact_deltas),
          condition_transitions:
            structuredClone(outcome.condition_outcomes),
          selection_policy:
            contracts.bodyEffect.selection_policy,
          rng_consumption: 'forbidden'
        },
        state_after: structuredClone(input.committed_state.body_state)
      };
    }
  });
}

export function createTracePhase5VisibleProjector({ phase4Projector }) {
  return Object.freeze({
    async project(input) {
      if (input.consequence?.phase5_kind == null) {
        return phase4Projector.project(input);
      }
      const treatment = input.consequence.treatment;
      const final = treatment.final;
      const stabilized = treatment.outcome_fact
        === 'onisim_stabilized_unable_to_walk';
      return {
        version: 1,
        schema: 'visible_context_package',
        visible_scene: final
          ? stabilized
            ? 'Перевязка закончена. Состояние Онисима стабилизировано, но идти он не может.'
            : 'Перевязка закончена, но состояние Онисима не удалось стабилизировать; идти он не может.'
          : treatment.interrupted
            ? 'Лечение прервано на временной границе; достигнутый прогресс сохранён.'
            : 'Очередной этап помощи Онисиму завершён.',
        visible_changes: [
          ...(treatment.stage_completion_facts ?? []),
          ...(treatment.outcome_fact ? [treatment.outcome_fact] : [])
        ],
        sensory_details: [],
        visible_npc: [],
        visible_objects: [],
        known_context: [
          `Прогресс лечения: ${treatment.progress_after} из 25 минут.`
        ],
        uncertainties: final && !stabilized
          ? ['Неудача проверки не создаёт неутверждённого ухудшения.'] : [],
        allowed_tensions: [],
        do_not_imply: [
          'can_walk', 'instant_recovery', 'exact_diagnosis', 'hidden_truth'
        ]
      };
    }
  });
}

function fail(code) {
  const error = new Error('Phase 5 effect failed closed.');
  error.code = code;
  throw error;
}
