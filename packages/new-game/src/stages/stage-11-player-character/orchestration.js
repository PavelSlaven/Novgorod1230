import { STAGE11_OUTPUT_SCHEMA } from './constants.js';
import { validateStage11PlayerCharacterInput } from './validation.js';

export async function runStage11PlayerCharacterBlock({ input, executor }) {
  const inputConcerns = validateStage11PlayerCharacterInput(input);
  if (inputConcerns.length > 0) {
    return {
      version: 1,
      schema: STAGE11_OUTPUT_SCHEMA,
      request_id: input?.request_id ?? null,
      generation_status: 'blocked',
      audit_self_check: { pass: false, concerns: inputConcerns, evidence: [] }
    };
  }
  if (typeof executor !== 'function') {
    throw new Error('runStage11PlayerCharacterBlock requires executor.');
  }
  return executor({ input, stage: { id: 11, slug: 'player_character', output_schema: STAGE11_OUTPUT_SCHEMA } });
}
