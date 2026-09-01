import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { assertValid, validateNarrationResult } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildNarrationStage({ playerInput, modeResolution, visibleContext,
  narrator, consequence = null, retrievedState = null }) {
  if (detectHiddenLeaks(visibleContext).length) throw new Error('Narrator input contains hidden data.');
  const output = await narrator.run({
    version: 1,
    schema: 'narration_request',
    request_id: modeResolution.turn_id,
    surface: 'turn',
    visible_context: structuredClone(visibleContext),
    context: {
      attempt: attemptOnly(playerInput),
      outcome: spatialResult({ consequence, retrievedState })
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

export function spatialResult({ consequence, retrievedState }) {
  const before = retrievedState?.position?.location_ref;
  const after = movementDestination(consequence);
  return {
    position_changed: typeof before === 'string' && typeof after === 'string'
      ? before !== after : false,
    movement_committed: typeof before === 'string' && typeof after === 'string'
      ? before !== after : false
  };
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
