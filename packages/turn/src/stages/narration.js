import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { assertValid, validateNarrationResult } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildNarrationStage({ playerInput, modeResolution, visibleContext,
  narrator, consequence = null, checks = null, retrievedState = null }) {
  if (detectHiddenLeaks(visibleContext).length) throw new Error('Narrator input contains hidden data.');
  const output = await narrator.run({
    version: 1,
    schema: 'narration_request',
    request_id: modeResolution.turn_id,
    surface: 'turn',
    visible_context: structuredClone(visibleContext),
    context: {
      attempt: attemptOnly(playerInput),
      outcome: spatialResult({ consequence, checks, modeResolution,
        retrievedState })
    },
    style_policy: { preserve_uncertainty: true, no_new_world_facts: true },
    max_repairs: 1
  });
  if (output?.schema === 'narration_flow_result'
      && (output.status !== 'approved' || output.pass !== true)) {
    const error = new Error('Narration did not produce an approved presentation.');
    error.code = 'TURN_NARRATION_REJECTED';
    throw error;
  }
  assertValid('narration_flow_result', validateNarrationResult(output));
  return freezeOutput(output);
}

export function spatialResult({ consequence, checks, modeResolution,
  retrievedState }) {
  const before = retrievedState?.position?.location_ref
    ?? movementSource(consequence);
  const after = movementDestination(consequence);
  const movement = typeof before === 'string' && typeof after === 'string'
    && before !== after ? { movement_committed: true } : {};
  const assessment = modeResolution?.decision_trace?.step_traces?.some(
    ({ applied, approved_plan: plan }) => applied === true
      && plan?.resolution === 'direct'
      && plan.direct_result_kind === 'player_safe_observation'
      && typeof plan.assessment?.text === 'string'
      && plan.assessment.text.trim().length > 0)
    ? { qualitative_assessment: true } : {};
  const outcomes = (checks?.results ?? []).map((result, index) => {
    const trace = modeResolution?.decision_trace?.step_traces?.find(
      (candidate) => candidate?.check_binding?.check_id === result.check_id);
    return {
      ordinal: index + 1,
      action: trace?.approved_plan?.interpretation?.grounded_attempt
        ?? attemptOnly(modeResolution)?.text ?? 'действие персонажа',
      band: result.outcome.band,
      margin: result.outcome.margin,
      success: result.outcome.success,
      cost_required: result.outcome.cost_required,
      severe_failure: result.outcome.severe_failure,
      roll_note: result.outcome.roll_note
    };
  });
  return outcomes.length === 0 ? { ...movement, ...assessment }
    : { ...movement, ...assessment, check_outcomes: outcomes };
}

function movementSource(consequence) {
  const candidates = [
    consequence?.movement?.source?.location_ref,
    consequence?.movement?.source_location_ref,
    consequence?.phase9?.movement?.source?.location_ref,
    consequence?.phase9?.movement?.source_location_ref
  ];
  return candidates.find((value) => typeof value === 'string') ?? null;
}

function attemptOnly(playerInput) {
  const text = playerInput?.raw_text ?? playerInput?.text ?? null;
  return typeof text === 'string' && text.length > 0 ? { text } : null;
}

function movementDestination(consequence) {
  const candidates = [
    consequence?.movement?.destination?.location_ref,
    consequence?.movement?.destination_location_ref,
    consequence?.phase9?.movement?.destination?.location_ref,
    consequence?.phase9?.movement?.destination_location_ref
  ];
  return candidates.find((value) => typeof value === 'string') ?? null;
}
