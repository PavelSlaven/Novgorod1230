import { applyBodyStateChange } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { TRACE_PHASE_2_IDS } from './lower-dvina-trace-phase-2-contracts.js';

export function createTracePhase2BodyEffect({ contracts }) {
  return Object.freeze({
    apply({ committed_state: state, consequence, time_update: timeUpdate }) {
      if (consequence.body_effect_ref !== TRACE_PHASE_2_IDS.bodyEffect
          || contracts.bodyEffect.elapsed_minutes
            !== consequence.duration_minutes
          || timeUpdate.exact_elapsed.exact_minutes.numerator
            !== String(contracts.bodyEffect.elapsed_minutes)) {
        throw serverError(
          'TRACE_PHASE_2_BODY_PROFILE_MISMATCH',
          'Pinned body effect does not match the committed elapsed interval.',
          { status: 409 }
        );
      }
      const variant = selectBodyVariant({
        state,
        variants: contracts.bodyApplicationVariants
      });
      const delta = structuredClone(variant.exact_deltas);
      const metricState = applyBodyStateChange(state.body_state, {
        restore: {
          health: Math.max(delta.health, 0),
          satiety: Math.max(delta.satiety, 0),
          energy: Math.max(delta.energy, 0)
        },
        harm: { health: Math.max(-delta.health, 0) },
        spend: {
          satiety: Math.max(-delta.satiety, 0),
          energy: Math.max(-delta.energy, 0)
        }
      });
      const stateAfter = {
        ...structuredClone(metricState),
        active_conditions: applyExactConditionOutcomes(
          state.body_state.active_conditions,
          variant.condition_outcomes
        )
      };
      return {
        owner: '@rus/body-state',
        applied: true,
        proposal: {
          profile_ref: TRACE_PHASE_2_IDS.bodyEffect,
          profile_digest: canonicalDigest(contracts.bodyEffect),
          execution_binding_ref:
            structuredClone(contracts.phase2BindingPin),
          execution_variant_id: variant.variant_id,
          activity_attempt_id: consequence.activity_attempt_id,
          exact_elapsed: timeUpdate.exact_elapsed,
          exact_deltas: delta,
          selection_policy: variant.selection_policy,
          rng_consumption: variant.rng_consumption,
          condition_transitions:
            structuredClone(variant.condition_outcomes)
        },
        state_after: stateAfter
      };
    }
  });
}

function selectBodyVariant({ state, variants }) {
  const priorEffectCommitted = (state.body_effect_history ?? []).some(
    (entry) => entry.effect_ref === TRACE_PHASE_2_IDS.bodyEffect
  );
  const currentStates = new Set(
    (state.body_state.active_conditions ?? []).map(({ id }) => id)
  );
  const matching = variants.filter((variant) => {
    const priorMatches =
      variant.required_prior_effect_state === 'committed_for_actor'
        ? priorEffectCommitted
        : variant.required_prior_effect_state === 'not_committed_for_actor'
          ? !priorEffectCommitted
          : false;
    return priorMatches && variant.condition_outcomes.every(
      (outcome) => currentStates.has(outcome.from)
    );
  });
  if (matching.length !== 1) {
    throw serverError(
      'TRACE_PHASE_2_BODY_VARIANT_NOT_RESOLVABLE',
      'Committed body state does not select one approved execution variant.',
      { status: 409 }
    );
  }
  return matching[0];
}

function applyExactConditionOutcomes(activeConditions, outcomes) {
  const next = structuredClone(activeConditions ?? []);
  for (const outcome of outcomes) {
    const matching = next.filter((condition) => condition.id === outcome.from);
    if (matching.length !== 1) {
      throw serverError(
        'TRACE_PHASE_2_BODY_CONDITION_STATE_MISMATCH',
        'The committed body condition does not match the approved transition.',
        { status: 409 }
      );
    }
    matching[0].id = outcome.to;
    matching[0].condition_profile_ref = {
      ...structuredClone(matching[0].condition_profile_ref),
      state: outcome.to,
      last_effect_ref: TRACE_PHASE_2_IDS.bodyEffect
    };
    matching[0].condition_outcome = outcome.outcome;
  }
  return next;
}

export function createTracePhase2VisibleProjector({ contracts }) {
  return Object.freeze({
    async project({ consequence, time_update: timeUpdate, body_update: body }) {
      const visibleObjects = consequence.clue_materialization
        ? [{
            entity_ref: {
              entity_kind: 'item',
              entity_id:
                consequence.clue_materialization.instance_id
            },
            display_label: 'клочок синей шерсти',
            recognition: 'recognized',
            visible_status: 'замечен на ветке у места крушения'
          }]
        : [];
      return {
        version: 1,
        schema: 'visible_context_package',
        visible_scene: 'Осмотр места крушения завершён.',
        visible_changes: [
          ...consequence.observations.map(({ fact_id: factId }) =>
            visibleObservation(factId)),
          'От берега к рыбацкому стану ведёт заметная тропа.'
        ],
        sensory_details: [],
        visible_npc: [],
        visible_objects: visibleObjects,
        known_context: [
          `GameTimestamp: ${timeUpdate.clock_after.whole_minutes}`,
          `health:${body.state_after.health}`,
          `satiety:${body.state_after.satiety}`,
          `energy:${body.state_after.energy}`
        ],
        uncertainties: [
          'Наблюдения сами по себе не устанавливают виновника или мотив.'
        ],
        allowed_tensions: [],
        do_not_imply:
          structuredClone(contracts.check.forbidden_inferred_facts)
      };
    }
  });
}

function visibleObservation(factId) {
  return {
    'visible:wreck_present': 'На берегу лежат обломки разбитой лодки.',
    'trace_ld_v1_evidence_onisim_barefoot_tracks':
      'В мокром песке видны босые следы.',
    'trace_ld_v1_evidence_boot_track':
      'Рядом заметен отдельный след сапога.',
    'visible:road_bag_missing':
      'Дорожной сумки, о которой было известно, здесь нет.',
    'visible:debris_layering_indicates_sequence':
      'Слои обломков и следов различимы.',
    'trace_ld_v1_evidence_cut_fastening':
      'Кожаная застёжка разрезана.',
    'trace_ld_v1_evidence_side_dent':
      'На борту лодки заметна вмятина сбоку.',
    'trace_ld_v1_evidence_second_boat_trace':
      'Среди обломков есть следы ещё одной небольшой лодки.',
    'trace_ld_v1_evidence_blue_wool':
      'На ветке у места крушения найден клочок синей шерсти.'
  }[factId];
}
