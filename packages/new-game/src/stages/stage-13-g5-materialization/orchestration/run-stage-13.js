import { validateStage13G5MaterializationInput } from '../input/input-boundary.js';
import { buildBlockedG5SceneDraft, buildFailedInputPrecheck, buildStage13G5CodePrecheck } from '../precheck/build-precheck.js';

export async function runStage13G5MaterializationBlock({ input, materialize }) {
  const inputConcerns = validateStage13G5MaterializationInput(input);
  if (inputConcerns.length > 0) {
    return {
      pass: false,
      output: buildBlockedG5SceneDraft(input, inputConcerns),
      code_precheck: buildFailedInputPrecheck(inputConcerns),
      concerns: inputConcerns
    };
  }
  if (typeof materialize !== 'function') {
    throw new Error('Stage 13 requires materialize callback.');
  }
  const output = await materialize(input);
  const codePrecheck = buildStage13G5CodePrecheck(output, input);
  return {
    pass: codePrecheck.pass === true,
    output,
    code_precheck: codePrecheck,
    concerns: codePrecheck.concerns ?? []
  };
}
