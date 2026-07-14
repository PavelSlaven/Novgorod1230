import { validateStage14G5AuditInput } from '../input/input-boundary.js';
import { buildStage14FailedAuditFromPrecheck, buildStage14G5SceneCodePrecheck } from '../precheck/build-precheck.js';
import { validateStage14G5SceneAuditOutput } from '../validation/audit-validation.js';

export async function runStage14G5AuditBlock({ input, audit }) {
  const inputConcerns = validateStage14G5AuditInput(input);
  if (inputConcerns.length > 0) {
    const precheck = buildStage14G5SceneCodePrecheck(input);
    return {
      pass: false,
      output: buildStage14FailedAuditFromPrecheck(input, { ...precheck, concerns: [...inputConcerns, ...(precheck.concerns ?? [])] }),
      code_precheck: precheck,
      concerns: inputConcerns
    };
  }
  const precheck = buildStage14G5SceneCodePrecheck(input);
  if (precheck.pass !== true) {
    return {
      pass: false,
      output: buildStage14FailedAuditFromPrecheck(input, precheck),
      code_precheck: precheck,
      concerns: precheck.concerns ?? []
    };
  }
  if (typeof audit !== 'function') {
    throw new Error('Stage 14 requires audit callback.');
  }
  const output = await audit({ ...input, g5_scene_code_precheck: precheck });
  const outputConcerns = validateStage14G5SceneAuditOutput(output, input);
  return {
    pass: outputConcerns.length === 0 && output.pass === true,
    output,
    code_precheck: precheck,
    concerns: outputConcerns
  };
}
