export const ACT_PATHS = Object.freeze([
  Object.freeze(['contribution_kind']),
  Object.freeze(['speech', 'dominant_act']),
  Object.freeze(['primary_addressee_ref']),
  Object.freeze(['intended_addressee_refs']),
  Object.freeze(['interpretation', 'intent'])
]);

export function coversActPath(errorPath, actPath) {
  if (typeof errorPath !== 'string' || errorPath === '$') return false;
  return errorPath === actPath
    || errorPath.startsWith(actPath + '.')
    || errorPath.startsWith(actPath + '[')
    || actPath.startsWith(errorPath + '.')
    || actPath.startsWith(errorPath + '[');
}

export function semanticRepairOpensIntent(repair) {
  return repair?.kind === 'semantic'
    && Array.isArray(repair.validation_errors)
    && repair.validation_errors.some((error) =>
      error?.code === 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED'
      && coversActPath(error.path, '$.interpretation.intent'));
}
