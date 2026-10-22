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
