import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { serverError } from '../errors.js';

export async function loadSpatialV3RuntimeBindings(
  moduleReference,
  context = {}
) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) {
    throw serverError(
      'RUNTIME_BINDINGS_MODULE_REQUIRED',
      'Spatial-v3 production requires RUS_SPATIAL_V3_BINDINGS_MODULE.'
    );
  }
  const specifier = reference.startsWith('.') || isAbsolute(reference)
    ? pathToFileURL(resolve(reference)).href
    : reference;
  const loaded = await import(specifier);
  const factory = loaded.createSpatialV3RuntimeBindings ?? loaded.default;
  if (typeof factory !== 'function') {
    throw serverError(
      'RUNTIME_BINDINGS_FACTORY_INVALID',
      'Spatial-v3 bindings must export createSpatialV3RuntimeBindings or default.'
    );
  }
  return validateSpatialV3RuntimeBindings(await factory(context));
}

export function validateSpatialV3RuntimeBindings(bindings) {
  if (!bindings
    || typeof bindings !== 'object'
    || !bindings.targetCompositionPorts
    || typeof bindings.targetCompositionPorts !== 'object') {
    throw serverError(
      'RUNTIME_BINDINGS_INVALID',
      'Spatial-v3 bindings require targetCompositionPorts.'
    );
  }
  for (const name of [
    'commitRecheck',
    'acknowledgeOpening',
    'getPartyScreen'
  ]) {
    if (typeof bindings[name] !== 'function') {
      throw serverError(
        'RUNTIME_BINDINGS_INVALID',
        `Spatial-v3 binding ${name} must be a function.`
      );
    }
  }
  return Object.freeze({
    targetCompositionPorts: Object.freeze({
      ...bindings.targetCompositionPorts
    }),
    commitRecheck: bindings.commitRecheck,
    acknowledgeOpening: bindings.acknowledgeOpening,
    getPartyScreen: bindings.getPartyScreen
  });
}
