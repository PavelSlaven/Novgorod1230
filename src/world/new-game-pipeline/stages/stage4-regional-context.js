import { assertGatePassed, createGateResult } from '../gate.js';
import { retrieveRegionalContextPackage, validateRegionalContextPackage } from '../retrievers/regional-context.js';

export async function runStage4RegionalContext(context, input = {}, deps = {}) {
  const output = await retrieveRegionalContextPackage({ request_id: context.requestId, ...input }, deps);
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  const gate = createGateResult({
    stageId: 4,
    stageSlug: 'regional_context',
    gateKind: 'regional_context_validation',
    pass: validation.pass,
    concerns: validation.concerns,
    evidence: validation.evidence
  });
  context.setGateResult(4, gate);
  assertGatePassed(gate);
  context.setStageOutput(4, output);
  context.note(4, {
    label: 'regional_context',
    message: 'regional_context ready',
    responseRaw: { gate }
  });
  return output;
}
