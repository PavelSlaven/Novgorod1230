import { createHash } from 'node:crypto';
import registry from '../../../../data/contracts/spatial-v3/controlled-vocabularies.v2.json' with { type: 'json' };

export class ControlledVocabularyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ControlledVocabularyError';
    this.code = 'controlled_vocabulary_gap';
    this.details = Object.freeze(structuredClone(details));
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function validateControlledVocabularyRegistry(input = registry) {
  const errors = [];
  if (input?.registry_id !== 'spatial.controlled_vocabularies') errors.push('registry_id');
  if (!['1.0.0', '2.0.0'].includes(input?.version)) errors.push('version');
  if (input?.status !== 'approved') errors.push('status');
  if (!Array.isArray(input?.vocabularies) || input.vocabularies.length !== input?.vocabulary_count) errors.push('vocabulary_count');
  if ((input?.vocabularies ?? []).reduce((sum, vocabulary) => sum + (vocabulary.values?.length ?? 0), 0) !== input?.value_count) errors.push('value_count');
  const seenTypes = new Set();
  for (const vocabulary of input?.vocabularies ?? []) {
    if (seenTypes.has(vocabulary.pseudo_type)) errors.push(`duplicate:${vocabulary.pseudo_type}`);
    seenTypes.add(vocabulary.pseudo_type);
    if (vocabulary.open_ended !== false || vocabulary.status !== 'approved' || vocabulary.version !== input.version) errors.push(`not_closed:${vocabulary.pseudo_type}`);
    if (!Array.isArray(vocabulary.values) || vocabulary.values.length === 0) errors.push(`empty:${vocabulary.pseudo_type}`);
    const ids = vocabulary.values.map((value) => value.id);
    if (new Set(ids).size !== ids.length) errors.push(`duplicate_value:${vocabulary.pseudo_type}`);
    if (ids.some((id) => !/^[a-z0-9_.]+$/.test(id))) errors.push(`invalid_value_id:${vocabulary.pseudo_type}`);
    const digestInput = { ...vocabulary };
    delete digestInput.digest;
    if (canonicalDigest(digestInput) !== vocabulary.digest) errors.push(`digest:${vocabulary.pseudo_type}`);
  }
  const aggregateInput = { ...input };
  delete aggregateInput.aggregate_digest;
  if (canonicalDigest(aggregateInput) !== input.aggregate_digest) errors.push('aggregate_digest');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export const controlledVocabularyDefinitions = Object.freeze(Object.fromEntries(
  registry.vocabularies.map((vocabulary) => [vocabulary.pseudo_type, Object.freeze({
    registryId: vocabulary.registry_id,
    registryPath: vocabulary.path,
    version: vocabulary.version,
    digest: vocabulary.digest,
    valueIds: Object.freeze(vocabulary.values.map((value) => value.id)),
    values: Object.freeze(structuredClone(vocabulary.values)),
    consumers: Object.freeze(structuredClone(vocabulary.consumers)),
  })])
));

export function resolveControlledVocabulary(pseudoType) {
  const definition = controlledVocabularyDefinitions[pseudoType];
  if (!definition) throw new ControlledVocabularyError(`Unmapped controlled vocabulary: ${pseudoType}`, { pseudo_type: pseudoType });
  return definition;
}

export function validateControlledValue(pseudoType, valueId, allowedValueIds = null) {
  const definition = resolveControlledVocabulary(pseudoType);
  if (!definition.valueIds.includes(valueId)) {
    throw new ControlledVocabularyError(`Unknown value ${valueId} for ${pseudoType}`, { pseudo_type: pseudoType, value_id: valueId, registry_digest: definition.digest });
  }
  if (allowedValueIds != null) {
    if (!Array.isArray(allowedValueIds) || !allowedValueIds.includes(valueId)) {
      throw new ControlledVocabularyError(`Value ${valueId} is not allowed by the consumer constraint`, { pseudo_type: pseudoType, value_id: valueId });
    }
  }
  return valueId;
}

export function controlledVocabularyRegistrySnapshot() {
  return Object.freeze(structuredClone(registry));
}
