import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { serverError } from '../errors.js';

export async function loadRuntimeBindings(moduleReference, context = {}) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) throw serverError('RUNTIME_BINDINGS_MODULE_REQUIRED', 'RUS_RUNTIME_BINDINGS_MODULE is required for production composition.');
  const specifier = reference.startsWith('.') || isAbsolute(reference) ? pathToFileURL(resolve(reference)).href : reference;
  const loaded = await import(specifier);
  const factory = loaded.createRuntimeBindings ?? loaded.default;
  if (typeof factory !== 'function') throw serverError('RUNTIME_BINDINGS_FACTORY_INVALID', 'Runtime bindings module must export createRuntimeBindings or default factory.');
  const bindings = await factory(context);
  for (const name of ['newGameOptionsFactory', 'turnServicesFactory', 'stage25PostcommitProjector']) {
    if (typeof bindings?.[name] !== 'function') throw serverError('RUNTIME_BINDINGS_INVALID', `${name} must be a function.`);
  }
  for (const name of ['newGameRunner', 'turnRunner']) {
    if (bindings?.[name] != null && typeof bindings[name] !== 'function') throw serverError('RUNTIME_BINDINGS_INVALID', `${name} must be a function when provided.`);
  }
  if (bindings.turnOptionsFactory != null && typeof bindings.turnOptionsFactory !== 'function') {
    throw serverError('RUNTIME_BINDINGS_INVALID', 'turnOptionsFactory must be a function when provided.');
  }
  return bindings;
}
