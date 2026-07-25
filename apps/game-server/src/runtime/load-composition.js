import { serverError } from '../errors.js';

export async function loadConfiguredComposition(moduleReference, context = {}) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) throw serverError('COMPOSITION_MODULE_REQUIRED', 'Composition module reference is required.');
  if (reference === 'builtin:production') {
    const { createProductionCompositionRoot } = await import('../composition/production.js');
    return validateRoot(await createProductionCompositionRoot(context));
  }
  throw serverError(
    'COMPOSITION_MODULE_INACTIVE',
    `Composition is not available before versioned production activation cutover: ${reference}.`
  );
}

function validateRoot(root) {
  for (const method of ['health', 'startNewGame', 'acknowledgeOpening', 'submitTurn', 'getPartyScreen']) {
    if (typeof root?.[method] !== 'function') throw serverError('COMPOSITION_ROOT_INVALID', `Composition root is missing ${method}().`);
  }
  return root;
}
