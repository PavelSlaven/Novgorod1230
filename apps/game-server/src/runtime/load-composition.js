import { serverError } from '../errors.js';

export async function loadConfiguredComposition(moduleReference, context = {}) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) throw serverError('COMPOSITION_MODULE_REQUIRED', 'Composition module reference is required.');
  if (reference === 'builtin:production-spatial-v3') {
    const { createSpatialV3ProductionCompositionRoot } =
      await import('../composition/production-spatial-v3.js');
    return validateRoot(await createSpatialV3ProductionCompositionRoot(context));
  }
  throw serverError(
    'COMPOSITION_MODULE_INACTIVE',
    `Composition is not available in active release spatial-v3-production-v1: ${reference}.`
  );
}

function validateRoot(root) {
  for (const method of ['health', 'startNewGame', 'acknowledgeOpening', 'submitTurn', 'getPartyScreen']) {
    if (typeof root?.[method] !== 'function') throw serverError('COMPOSITION_ROOT_INVALID', `Composition root is missing ${method}().`);
  }
  return root;
}
