export function createGateResult({
  stageId,
  stageSlug,
  gateKind = 'structural_validation',
  pass,
  concerns = [],
  evidence = []
} = {}) {
  return {
    stage_id: stageId ?? null,
    stage_slug: stageSlug ?? null,
    gate_kind: gateKind,
    pass: pass === true,
    concerns,
    evidence
  };
}
