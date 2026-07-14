export function createGateResult({ stageId, stageSlug, gateKind = 'structural_validation', pass, concerns = [], evidence = [] } = {}) {
  return { stage_id: stageId ?? null, stage_slug: stageSlug ?? null, gate_kind: gateKind, pass: pass === true, concerns, evidence };
}
export function assertGatePassed(result) {
  if (!result?.pass) {
    const details = (result?.concerns ?? []).map((item) => item.message ?? item.code).join('; ');
    throw new Error(`New-game stage gate failed: ${details || 'unknown gate failure'}`);
  }
}
