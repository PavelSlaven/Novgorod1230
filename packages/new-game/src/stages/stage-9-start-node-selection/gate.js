import { createGateResult } from '@rus/pipeline-engine';

export function createStage9Gate(output, input, validation) {
  return createGateResult({
    stageId: 9,
    stageSlug: 'start_node_selection',
    gateKind: 'selected_start_node_gate',
    pass: validation.pass,
    concerns: validation.concerns ?? [],
    evidence: validation.evidence ?? []
  });
}
