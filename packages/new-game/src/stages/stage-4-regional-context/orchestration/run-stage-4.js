import { createGateResult } from '@rus/pipeline-engine';
import { commitStageOutput } from '../../shared/stage-runtime.js';
export async function runStage4RegionalContextBlock(context, input = {}, services = {}) {
  if (typeof services.retrieveRegionalContextPackage !== 'function' || typeof services.validateRegionalContextPackage !== 'function') throw new TypeError('Stage 4 requires regional context retrieval and validation ports.');
  const output = await services.retrieveRegionalContextPackage({ request_id: context.requestId, ...input }, services);
  const validation = services.validateRegionalContextPackage(output, { historicalFrame: input.historical_frame, loadPolicy: input.load_policy });
  const gate = createGateResult({ stageId: 4, stageSlug: 'regional_context', gateKind: 'regional_context_validation', pass: validation.pass, concerns: validation.concerns, evidence: validation.evidence });
  return commitStageOutput(context, 4, 'regional_context', output, gate);
}
