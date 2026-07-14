import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { serverError } from '../errors.js';

export async function loadConfiguredComposition(moduleReference, context = {}) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) throw serverError('COMPOSITION_MODULE_REQUIRED', 'Composition module reference is required.');
  if (reference === 'builtin:production') {
    const { createProductionCompositionRoot } = await import('../composition/production.js');
    return validateRoot(await createProductionCompositionRoot(context));
  }
  const specifier = reference.startsWith('.') || isAbsolute(reference) ? pathToFileURL(resolve(reference)).href : reference;
  const loaded = await import(specifier);
  const factory = loaded.createCompositionRoot ?? loaded.default;
  if (typeof factory !== 'function') throw serverError('COMPOSITION_FACTORY_INVALID', 'Composition module must export createCompositionRoot or a default factory.');
  return validateRoot(await factory(context));
}

function validateRoot(root) {
  for (const method of ['health', 'startNewGame', 'acknowledgeOpening', 'submitTurn', 'getPartyScreen']) {
    if (typeof root?.[method] !== 'function') throw serverError('COMPOSITION_ROOT_INVALID', `Composition root is missing ${method}().`);
  }
  return root;
}
