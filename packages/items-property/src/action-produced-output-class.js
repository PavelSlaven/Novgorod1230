export const ACTION_PRODUCED_OUTPUT_CLASSES = Object.freeze([
  'ordinary_mundane', 'weapon_capable', 'money_like_token',
  'written_carrier'
]);

const OUTPUT_CLASSES = new Set(ACTION_PRODUCED_OUTPUT_CLASSES);
const TOOL_REQUIRED_OUTPUT_CLASSES = new Set([
  'weapon_capable', 'money_like_token', 'written_carrier'
]);

export function actionProducedOutputRequiresTool(outputClass) {
  return TOOL_REQUIRED_OUTPUT_CLASSES.has(outputClass);
}

export function validateActionProducedOutputClass(outputClass, resultClass,
  identityMode) {
  if (identityMode === 'no_useful_result'
      || resultClass === 'no_useful_result') {
    return identityMode === 'no_useful_result'
      && resultClass === 'no_useful_result' && outputClass === null;
  }
  if (resultClass === 'written_carrier') {
    return identityMode === 'preserve_source'
      && outputClass === 'written_carrier';
  }
  if (!OUTPUT_CLASSES.has(outputClass)
      || outputClass === 'written_carrier') return false;
  return outputClass !== 'money_like_token'
    || identityMode === 'independent_outputs';
}
