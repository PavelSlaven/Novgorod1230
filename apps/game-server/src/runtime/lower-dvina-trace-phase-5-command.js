import { canonicalDigest } from '@rus/materialization';
import { planTracePhase5TreatmentSlice } from
  './lower-dvina-trace-phase-5-activity.js';
import { resolveTracePhase5Consent } from
  './lower-dvina-trace-phase-5-consent.js';
import {
  phase5PreconditionsSatisfied
} from './lower-dvina-trace-phase-5-admission.js';

export { phase5PreconditionsSatisfied,
  tracePhase5PreconditionSatisfied } from
  './lower-dvina-trace-phase-5-admission.js';

const EXACT = new Set([
  'оказать онисиму первую помощь.',
  'перевязать ногу онисиму.',
  'продолжить лечение онисима.'
]);

export function createTracePhase5Command({ contracts, inputDigest }) {
  const preconditions = [
    { kind: 'phase5_exact_safe_state' },
    { kind: 'phase5_bandage_available' },
    { kind: 'phase5_required_participants_available' }
  ];
  return {
    command_id: 'lower_dvina_trace.attempt_risky_first_aid_onisim',
    option_id: contracts.ids.option,
    label: 'Оказать Онисиму первую помощь',
    target_id: contracts.actors.onisim_boatman.instance_id,
    preconditions,
    expected_cost: {
      kind: 'single_interruptible_exact_time',
      value: 25,
      technical_progress_minutes: [5, 10, 10]
    },
    known_risks: ['Лечение может не стабилизировать рану.'],
    reason_visible_to_actor:
      'Ратша сдался, нож изъят, Онисим и чистая ткань доступны.',
    mode: {
      selected_primary_mode: 'body_recovery',
      secondary_modes: ['item_property', 'time_progression'],
      resolution_plan: {
        subsystems: [
          'time_progression', 'body_state', 'recovery', 'item_access',
          'inventory', 'ownership_access', 'npc_interaction',
          'visible_context_projection'
        ],
        checks_to_run: ['risk_resolution', 'body_state', 'time_cost'],
        expected_writes: [
          'party_state', 'party_npcs', 'party_items',
          'party_character_knowledge_map', 'party_visible_context_package'
        ],
        state_blocks_to_load: [
          'party_state', 'current_position', 'clock_weather_light',
          'relevant_items', 'relevant_npcs', 'relevant_events',
          'recent_changes_log'
        ]
      }
    },
    matches({ raw_text: rawText }) {
      return EXACT.has(String(rawText ?? '').trim().toLowerCase()
        .replace(/\s+/gu, ' '));
    },
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = phase5PreconditionsSatisfied(state, contracts);
      if (!allowed) return availability(false, []);
      const slice = planTracePhase5TreatmentSlice({
        state, contracts, inputDigest
      });
      const consent = slice.execution_before == null
        ? resolveTracePhase5Consent({ state, contracts, inputDigest })
        : structuredClone(state.phase5_treatment?.consent_decision);
      if (!consent || consent.option_id !== 'accept_first_aid') {
        fail('TRACE_PHASE_5_CONSENT_MISSING');
      }
      return availability(true, slice.final ? [checkRequest(contracts)] : [], {
        treatment_slice: slice,
        treatment_consent: consent
      });
    },
    consequence({ retrievedState, availability: admitted, checks }) {
      const slice = admitted.treatment_slice;
      if (!slice || canonicalDigest(slice)
          !== canonicalDigest(planTracePhase5TreatmentSlice({
            state: retrievedState, contracts, inputDigest
          }))) {
        fail('TRACE_PHASE_5_SLICE_REVALIDATION_FAILED');
      }
      const checkResult = slice.final
        ? checks.results.find(({ check_id: id }) => id === contracts.ids.check)
        : null;
      if (slice.final && !checkResult) {
        fail('TRACE_PHASE_5_CHECK_RESULT_MISSING');
      }
      const success = checkResult?.outcome?.success === true;
      const consequence = slice.final
        ? (success ? contracts.success : contracts.failure)
        : null;
      const bodyOutcome = slice.final
        ? contracts.bodyEffect.outcome_effects[success ? 'success' : 'failure']
        : null;
      return {
        version: 1,
        schema: 'turn_consequence_package',
        status: 'resolved',
        phase5_kind: 'onisim_treatment',
        activity_attempt_id: slice.activity_execution.id,
        duration_minutes: slice.slice_minutes,
        body_effect_ref: slice.final ? contracts.ids.bodyEffect : null,
        treatment: {
          consent: structuredClone(admitted.treatment_consent),
          consent_option_id: admitted.treatment_consent.option_id,
          consent_elapsed_minutes: admitted.treatment_consent.elapsed_minutes,
          activity_ref: contracts.ids.activity,
          stage_id: slice.stage.stage_id,
          completed_stage_ids:
            slice.completed_stages.map(({ stage_id: id }) => id),
          stage_completion_facts:
            slice.completed_stages.flatMap(
              ({ committed_fact_outputs: facts }) => facts
            ),
          progress_before: slice.progress_before,
          progress_after: slice.progress_after,
          activity_execution: slice.activity_execution,
          attempt: slice.attempt,
          resume_result: slice.resume_result,
          interrupted: slice.interrupted,
          encountered_boundary_candidates:
            slice.encountered_boundary_candidates,
          processed_boundary_ids: slice.processed_boundary_ids,
          final: slice.final,
          check_result: checkResult,
          consequence_ref: consequence?.consequence_id ?? null,
          common_completion_fact: slice.final
            ? 'onisim_first_aid_completed' : null,
          outcome_fact: bodyOutcome?.committed_fact ?? null,
          body_outcome: bodyOutcome,
          bandage_transition_ref: slice.final
            ? contracts.ids.transition : null
        },
        visible_seed: {},
        hidden_update: {},
        state_changes: [],
        suggested_actions: []
      };
    },
    writeTargets(input) {
      return [{ target: 'party_state', value: {
        player_input: input.playerInput,
        mode_resolution: input.modeResolution,
        availability: input.availability,
        consequence: input.consequence,
        time_update: input.timeUpdate,
        body_update: input.bodyUpdate,
        hidden_update: input.hiddenUpdate
      } }, {
        target: 'party_visible_context_package',
        value: input.visibleContext
      }];
    }
  };
}

function availability(canAttempt, checkRequests, extra = {}) {
  return {
    version: 1,
    schema: 'turn_availability_decision',
    status: checkRequests.length ? 'check_required'
      : canAttempt ? 'available' : 'blocked',
    can_attempt: canAttempt,
    reasons: canAttempt ? [] : ['phase5_precondition_failed'],
    check_requests: checkRequests,
    ...extra
  };
}

function checkRequest(contracts) {
  return {
    check_id: contracts.ids.check,
    difficulty: contracts.check.dc,
    attribute: contracts.check.attribute,
    skill: contracts.check.skill,
    state_modifier: contracts.check.modifiers.state,
    equipment_modifier: contracts.check.modifiers.item_or_evidence,
    circumstance_modifier: contracts.check.modifiers.circumstance,
    audit_ordinal: 0,
    causal_predecessor_fact_id:
      'onisim_first_aid_final_stage_committed'
  };
}

function fail(code) {
  const error = new Error('Phase 5 treatment command failed closed.');
  error.code = code;
  throw error;
}
