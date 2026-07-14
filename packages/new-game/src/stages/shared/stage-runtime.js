export function assertGatePassed(result) {
  if (!result?.pass) {
    const details = (result?.concerns ?? []).map((item) => item.message ?? item.code).join('; ');
    throw new Error(`New-game stage gate failed: ${details || 'unknown gate failure'}`);
  }
  return result;
}
export function commitStageOutput(context, stageId, slug, output, gate, message = `${slug} ready`) {
  context.setGateResult(stageId, gate);
  assertGatePassed(gate);
  context.setStageOutput(stageId, output);
  context.note?.(stageId, { label: slug, message, responseRaw: { gate } });
  return output;
}
