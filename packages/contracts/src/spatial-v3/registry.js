import { sha256 } from '@rus/kernel';
import specificationsDocument from './specifications.json' with { type: 'json' };
import typedErrorDocument from './typed-error-specifications.json' with { type: 'json' };
import { controlledVocabularyRegistrySnapshot, validateControlledVocabularyRegistry } from './controlled-vocabularies.js';
import { validateVisiblePackageEnvelope } from './player-safe-visible-payload.js';
import { validatePr8HandoffContract } from './pr8-handoff-validation.js';
import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  validateReactionHandoffContract
} from './reaction-handoff-validation.js';
import {
  deriveNpcReactionCommandToken,
  deriveNpcReactionOptionSetDigest,
  deriveNpcReactionPreconditionsDigest,
  deriveNpcReactionRequestId,
  validateReactionOptionContract
} from './reaction-option-validation.js';
export { PLAYER_SAFE_VISIBLE_PAYLOAD_KEYS, validatePlayerSafeVisiblePayload } from './player-safe-visible-payload.js';
export { stateMachineDefinitions } from './state-machines.js';
export { SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS };
export {
  deriveNpcReactionCommandToken,
  deriveNpcReactionOptionSetDigest,
  deriveNpcReactionPreconditionsDigest,
  deriveNpcReactionRequestId
};

export const SPATIAL_V3_BASELINE_CONTRACT_VERSION = '4.2.0-target.1';
export const SPATIAL_V3_TEMPORAL_BASELINE_CONTRACT_VERSION = '4.3.0-target.1';
export const SPATIAL_V3_CONTRACT_VERSION = '4.4.0-target.1';
export const SPATIAL_V3_SUPPORTED_CONTRACT_VERSIONS = Object.freeze([
  SPATIAL_V3_BASELINE_CONTRACT_VERSION,
  SPATIAL_V3_TEMPORAL_BASELINE_CONTRACT_VERSION,
  SPATIAL_V3_CONTRACT_VERSION
]);

export const contractSpecifications = Object.freeze(specificationsDocument.specifications.map((specification) => Object.freeze({
  ...specification,
  fields: Object.freeze(specification.fields.map(Object.freeze)),
  relations: Object.freeze(specification.relations.map(Object.freeze)),
  identity: Object.freeze(specification.identity),
  invariants: Object.freeze(specification.invariants)
})));
if (specificationsDocument.source_version !== SPATIAL_V3_CONTRACT_VERSION || contractSpecifications.length !== 213) {
  throw new Error(`Spatial target contract artifact must be ${SPATIAL_V3_CONTRACT_VERSION} with 213 declarations.`);
}
const specificationByName = Object.freeze(Object.fromEntries(contractSpecifications.map((specification) => [specification.contract_name, specification])));
const CONTRACT_NAMES = contractSpecifications.map(({ contract_name }) => contract_name);

const controlledVocabularySnapshot = controlledVocabularyRegistrySnapshot();
const controlledVocabularyRegistryResult = validateControlledVocabularyRegistry(controlledVocabularySnapshot);
if (!controlledVocabularyRegistryResult.ok) throw new Error(`Invalid spatial controlled vocabulary registry: ${controlledVocabularyRegistryResult.errors.join(', ')}`);
export const controlledVocabularyDefinitions = Object.freeze(controlledVocabularySnapshot.vocabularies.map((vocabulary) => Object.freeze({
  vocabulary_name: vocabulary.pseudo_type,
  registry_id: vocabulary.registry_id,
  registry_path: vocabulary.path,
  version: vocabulary.version,
  values: Object.freeze(vocabulary.values.map(({ id }) => id)),
  status: vocabulary.status,
  digest: vocabulary.digest,
  aggregate_digest: controlledVocabularySnapshot.aggregate_digest,
  consumer_constraint: Object.freeze(structuredClone(vocabulary.consumers))
})));

export const controlledVocabularyByName = Object.freeze(Object.fromEntries(
  controlledVocabularyDefinitions.map((definition) => [definition.vocabulary_name, definition])
));

export function canonicalizeSpatialV3(value) {
  if (Array.isArray(value)) return value.map(canonicalizeSpatialV3);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeSpatialV3(value[key])]));
  return value;
}

export function computeSpatialV3CanonicalDigest(value) {
  return `sha256:${sha256(canonicalizeSpatialV3(value))}`;
}

const issue = (code, field, message) => ({ code, field, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const stableId = (value) => typeof value === 'string' && value.trim().length > 0;
const nonNegativeDecimalString = (value) => typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
const positiveDecimalString = (value) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function validateCanonicalRationalParts(numerator, denominator, path, { proper = false } = {}) {
  if (!nonNegativeDecimalString(numerator) || !positiveDecimalString(denominator)) {
    return [issue('generated_schema_mismatch', path, `${path} must use canonical non-negative numerator and positive denominator decimal strings.`)];
  }
  const numeratorValue = BigInt(numerator);
  const denominatorValue = BigInt(denominator);
  if (numeratorValue === 0n && denominatorValue !== 1n) {
    return [issue('time_elapsed_invalid', path, `${path} zero must be represented exactly as 0/1.`)];
  }
  if (greatestCommonDivisor(numeratorValue, denominatorValue) !== 1n) {
    return [issue('time_elapsed_invalid', path, `${path} fraction must be reduced.`)];
  }
  if (proper && numeratorValue >= denominatorValue) {
    return [issue('time_timestamp_invalid', path, `${path} subminute fraction must be proper.`)];
  }
  return [];
}

function compareGameTimestamps(left, right) {
  const wholeComparison = BigInt(left.whole_minutes) - BigInt(right.whole_minutes);
  if (wholeComparison !== 0n) return wholeComparison < 0n ? -1 : 1;
  const crossDifference = BigInt(left.subminute_numerator) * BigInt(right.subminute_denominator)
    - BigInt(right.subminute_numerator) * BigInt(left.subminute_denominator);
  return crossDifference < 0n ? -1 : crossDifference > 0n ? 1 : 0;
}

function validateEntityRef(value) {
  if (!isObject(value) || !hasOnly(value, ['entity_kind', 'entity_id']) || !stableId(value.entity_kind) || !stableId(value.entity_id)) {
    return [issue('generated_schema_mismatch', 'entity_ref', 'entity_ref requires typed entity_kind and entity_id; bare IDs are forbidden.')];
  }
  return [];
}
function validateVersionPin(value) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', 'version_pin', 'version_pin must be an object.')];
  const authoring = value.pin_kind === 'authoring_version' && stableId(value.authoring_version) && value.state_version == null;
  const party = value.pin_kind === 'party_state_version' && Number.isInteger(value.state_version) && value.state_version > 0 && value.authoring_version == null;
  return authoring || party ? [] : [issue('authoring_dependency_pin_missing', 'version_pin', 'version_pin must contain exactly its declared authoring or party-state branch.')];
}
function validateJourneyLocation(value) {
  if (!isObject(value)) return [issue('generated_schema_mismatch', 'journey_location', 'journey_location must be an object.')];
  const keys = { scene: 'scene_position_id', transit_anchor: 'transit_anchor_id', in_transit: 'travel_state_id' };
  const selected = keys[value.location_kind];
  return selected && stableId(value[selected]) && Object.entries(keys).every(([kind, key]) => kind === value.location_kind || value[key] == null)
    ? [] : [issue('journey_location_ownership_mismatch', 'journey_location', 'journey_location must populate exactly one declared location branch.')];
}

function validateRationalValue(value, contractName) {
  if (!isObject(value)) return [];
  return validateCanonicalRationalParts(value.numerator, value.denominator, contractName);
}

function validateGameTimestamp(value) {
  if (!isObject(value)
    || !nonNegativeDecimalString(value.whole_minutes)
    || !nonNegativeDecimalString(value.subminute_numerator)
    || !positiveDecimalString(value.subminute_denominator)) return [];
  return validateCanonicalRationalParts(
    value.subminute_numerator,
    value.subminute_denominator,
    'game_timestamp.subminute',
    { proper: true }
  );
}

function validateActivityCompletionModel(value) {
  if (!isObject(value)) return [];
  const populated = [
    value.fixed_duration != null,
    value.progress_target_ref != null,
    value.completion_condition_ref != null,
    value.hard_deadline_at != null,
    value.hard_deadline_policy_ref != null,
    value.next_recheck_at != null
  ];
  const valid = value.kind === 'fixed_exact'
    ? populated[0] && populated.slice(1).every((entry) => !entry)
    : value.kind === 'progress_target'
      ? !populated[0] && populated[1] && !populated[2] && !populated[3] && !populated[4] && populated[5]
      : value.kind === 'condition_or_deadline'
        ? !populated[0] && !populated[1] && populated[2] && (populated[3] || populated[5]) && (populated[3] === populated[4])
        : true;
  return valid ? [] : [issue('activity_policy_gap', 'activity_completion_model_snapshot', 'Exactly one complete, finite activity completion branch must be sealed.')];
}

function validateTimedActivityExecution(value) {
  if (!isObject(value)) return [];
  const errors = [];
  const active = value.status === 'active';
  const terminalOrPaused = ['paused', 'completed', 'failed', 'aborted'].includes(value.status);
  if (value.status === 'invalidated') {
    errors.push(issue('activity_transition_invalid', 'status', 'invalidated is a failure class, not a persisted activity status.'));
  }
  if (active && value.next_boundary_at == null) {
    errors.push(issue('temporal_execution_unbounded', 'next_boundary_at', 'An active activity requires a finite next boundary.'));
  }
  if (terminalOrPaused && value.next_boundary_at != null) {
    errors.push(issue('activity_transition_invalid', 'next_boundary_at', 'Paused and terminal activity states forbid a next boundary.'));
  }
  const timestamps = [value.started_at, value.last_processed_at, value.next_boundary_at].filter((entry) => entry != null);
  if (timestamps.every((entry) => validateGameTimestamp(entry).length === 0)
    && value.started_at && value.last_processed_at
    && compareGameTimestamps(value.last_processed_at, value.started_at) < 0) {
    errors.push(issue('activity_transition_invalid', 'last_processed_at', 'Activity processing time cannot precede its start.'));
  }
  if (active && value.next_boundary_at
    && validateGameTimestamp(value.next_boundary_at).length === 0
    && validateGameTimestamp(value.last_processed_at).length === 0
    && compareGameTimestamps(value.next_boundary_at, value.last_processed_at) < 0) {
    errors.push(issue('time_window_invalid', 'next_boundary_at', 'The next activity boundary cannot precede the latest committed processing time.'));
  }
  return errors;
}

function validateCombinedWritePlan(value) {
  if (!isObject(value)) return [];
  if (value.write_plan_kind === 'semantic_commit' && value.visible_package_envelope == null) {
    return [issue('visible_package_persistence_gap', 'visible_package_envelope', 'A semantic commit requires one hidden-safe visible package in the same write set.')];
  }
  if (value.write_plan_kind === 'blocked_audit' && value.visible_package_envelope != null) {
    return [issue('visible_package_persistence_gap', 'visible_package_envelope', 'A blocked audit must not persist a visible package.')];
  }
  return [];
}

function canonicalEqual(left, right) {
  return JSON.stringify(canonicalizeSpatialV3(left)) === JSON.stringify(canonicalizeSpatialV3(right));
}

function validateControlledValue(type, value) {
  const definition = controlledVocabularyByName[type];
  if (!definition) return [issue('controlled_vocabulary_gap', type, `Unknown controlled vocabulary ${type}.`)];
  if (!definition.values.includes(value)) return [issue('controlled_vocabulary_gap', type, `${type} has no approved value for this input.`)];
  return [];
}

function validateType(type, value, path) {
  if (type.startsWith('enum[')) return type.slice(5, -1).split(', ').includes(String(value)) ? [] : [issue('generated_schema_mismatch', path, `${path} must be one of ${type}.`)];
  if (type.startsWith('controlled_')) return validateControlledValue(type, value);
  const list = type.match(/^(nonempty_relation_set|relation_set|snapshot_list)\[(.+)]$/);
  if (list) {
    if (!Array.isArray(value)) return [issue('generated_schema_mismatch', path, `${path} must be an array.`)];
    if (list[1] === 'nonempty_relation_set' && value.length === 0) {
      return [issue('generated_schema_mismatch', path, `${path} must be a non-empty array.`)];
    }
    return value.flatMap((entry, index) => validateType(list[2], entry, `${path}[${index}]`));
  }
  if (specificationByName[type]) return validateSpatialV3Contract(type, value).map((entry) => ({ ...entry, field: `${path}.${entry.field}` }));
  if (['stable_id', 'authoring_version', 'string', 'system_timestamp'].includes(type)) return stableId(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a non-empty string.`)];
  if (type === 'non_negative_decimal_string') return nonNegativeDecimalString(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a canonical non-negative decimal string.`)];
  if (type === 'positive_decimal_string') return positiveDecimalString(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a canonical positive decimal string.`)];
  if (['state_version', 'positive_integer'].includes(type)) return Number.isInteger(value) && value > 0 ? [] : [issue('generated_schema_mismatch', path, `${path} must be a positive integer.`)];
  if (['non_negative_integer', 'integer', 'ppm', 'azimuth_mdeg', 'half_width_mdeg'].includes(type)) return Number.isInteger(value) && (type !== 'non_negative_integer' || value >= 0) ? [] : [issue('generated_schema_mismatch', path, `${path} must be an integer.`)];
  if (type === 'boolean') return typeof value === 'boolean' ? [] : [issue('generated_schema_mismatch', path, `${path} must be boolean.`)];
  if (type === 'sha256_hex') return typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a SHA-256 digest.`)];
  if (type === 'rational') return isObject(value) && Number.isInteger(value.numerator) && Number.isInteger(value.denominator) && value.denominator > 0 ? [] : [issue('generated_schema_mismatch', path, `${path} must be an exact rational.`)];
  if (type === 'json_object') return isObject(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a JSON object.`)];
  return isObject(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be an object of type ${type}.`)];
}

function validateSpecification(specification, value) {
  const allowed = new Set([...specification.fields.map(({ name }) => name), ...specification.relations.map(({ name }) => name)]);
  const errors = Object.keys(value).filter((key) => !allowed.has(key)).map((key) => issue('generated_schema_mismatch', key, `${specification.contract_name} forbids additional property ${key}.`));
  for (const field of specification.fields) {
    if (field.required && (value[field.name] === null || value[field.name] === undefined)) errors.push(issue('generated_schema_mismatch', field.name, `${field.name} is required.`));
    else if (value[field.name] != null) errors.push(...validateType(field.type, value[field.name], field.name));
  }
  for (const relation of specification.relations) if (value[relation.name] != null && relation.type) errors.push(...validateType(relation.type, value[relation.name], relation.name));
  return errors;
}

function validatePreparationSnapshotMember(value) {
  const errors = [];
  const hasEndpoint = value?.resolved_endpoint_snapshot != null;
  const resolvedSceneFields = [
    value?.resolved_scene_baseline_id,
    value?.resolved_g6_instance_id,
    value?.resolved_position_id
  ];
  const resolvedSceneCount = resolvedSceneFields.filter((field) => field != null).length;
  const hasResolvedScene = resolvedSceneCount === resolvedSceneFields.length;
  const hasPreparedScene = value?.prepared_scene_materialization != null;

  if (value?.member_kind === 'endpoint') {
    if (!hasEndpoint) errors.push(issue('generated_schema_mismatch', 'resolved_endpoint_snapshot', 'endpoint member requires resolved_endpoint_snapshot.'));
    if (resolvedSceneCount > 0 || hasPreparedScene) errors.push(issue('generated_schema_mismatch', 'member_kind', 'endpoint member forbids resolved and prepared scene fields.'));
  } else if (value?.member_kind === 'transfer_scene') {
    if (hasEndpoint) errors.push(issue('generated_schema_mismatch', 'resolved_endpoint_snapshot', 'transfer_scene member forbids resolved_endpoint_snapshot.'));
    if (resolvedSceneCount > 0 && !hasResolvedScene) errors.push(issue('generated_schema_mismatch', 'resolved_scene_baseline_id', 'resolved transfer_scene branch requires the complete baseline/G6/position triple.'));
    if (Number(hasResolvedScene) + Number(hasPreparedScene) !== 1) errors.push(issue('generated_schema_mismatch', 'member_kind', 'transfer_scene member requires exactly one resolved or prepared scene branch.'));
  }
  return errors;
}

export function validateSpatialV3Contract(contractName, value) {
  const specification = specificationByName[contractName];
  if (!specification) return [issue('generated_schema_mismatch', 'contract_name', `Unknown spatial v3 contract ${contractName}.`)];
  if (!isObject(value)) return [issue('generated_schema_mismatch', contractName, `${contractName} must be an object.`)];
  const errors = validateSpecification(specification, value);
  if (contractName === 'entity_ref') errors.push(...validateEntityRef(value));
  if (contractName === 'version_pin') errors.push(...validateVersionPin(value));
  if (contractName === 'versioned_ref') errors.push(...validateEntityRef(value.entity_ref), ...(!stableId(value.authoring_version) ? [issue('authoring_dependency_pin_missing', 'authoring_version', 'versioned_ref requires an explicit authoring version.')] : []));
  if (contractName === 'dependency_pin') errors.push(...validateEntityRef(value.entity_ref), ...validateVersionPin(value.version_pin));
  if (contractName === 'journey_location') errors.push(...validateJourneyLocation(value));
  if (contractName === 'rational_minutes' || contractName === 'rational_quantity') errors.push(...validateRationalValue(value, contractName));
  if (contractName === 'game_timestamp') errors.push(...validateGameTimestamp(value));
  if (contractName === 'activity_completion_model_snapshot') errors.push(...validateActivityCompletionModel(value));
  if (contractName === 'party_timed_activity_execution') errors.push(...validateTimedActivityExecution(value));
  if (contractName === 'visible_package_persistence_envelope') errors.push(...validateVisiblePackageEnvelope(value));
  if (contractName === 'combined_write_plan') errors.push(...validateCombinedWritePlan(value));
  if (contractName === 'preparation_snapshot_member') errors.push(...validatePreparationSnapshotMember(value));
  errors.push(...validatePr8HandoffContract(contractName, value));
  errors.push(...validateReactionHandoffContract(contractName, value));
  errors.push(...validateReactionOptionContract(contractName, value));
  return errors;
}

export const contractDefinitions = Object.freeze(contractSpecifications.map((specification) => Object.freeze({
  ...specification,
  contract_name: specification.contract_name,
  schema_version: SPATIAL_V3_CONTRACT_VERSION,
  schema_kind: 'target_dto',
  dto_type: `${specification.contract_name}_dto`,
  schema: Object.freeze({ type: 'object', additionalProperties: false, required: Object.freeze(specification.fields.filter(({ required }) => required).map(({ name }) => name)), properties: specification.fields }),
  validate: (value) => validateSpatialV3Contract(specification.contract_name, value)
}))); 

export const contractImplementationBatches = Object.freeze(
  Array.from({ length: Math.ceil(contractDefinitions.length / 20) }, (_, index) => Object.freeze({
    batch: index + 1,
    contract_names: Object.freeze(contractDefinitions.slice(index * 20, (index + 1) * 20).map(({ contract_name }) => contract_name))
  }))
);

function defaultRetryability(errorCode) {
  if (errorCode.endsWith('_gap') || errorCode.includes('missing') || errorCode.includes('undefined')) return 'after_data_repair';
  if (errorCode.includes('conflict') || errorCode.includes('stale') || errorCode.includes('reserved')) return 'fresh_state';
  return 'no';
}

const typedErrorCodes = typedErrorDocument.errors.map(({ error_code }) => error_code);
if (new Set(typedErrorCodes).size !== typedErrorCodes.length) throw new Error('Duplicate spatial typed-error declaration.');
if (typedErrorDocument.source_version !== SPATIAL_V3_CONTRACT_VERSION || typedErrorCodes.length !== 82) {
  throw new Error(`Spatial typed-error artifact must be ${SPATIAL_V3_CONTRACT_VERSION} with 82 declarations.`);
}
export const typedErrorDefinitions = Object.freeze(typedErrorDocument.errors.map((error) => Object.freeze({
  ...error,
  owner_package: '@rus/contracts',
  severity: error.severity ?? (error.error_code.endsWith('_gap') || error.error_code.includes('missing') || error.error_code.includes('unresolved') ? 'hard_block' : error.error_code === 'hidden_information_leak' ? 'security' : 'error'),
  retryability: error.retryability ?? defaultRetryability(error.error_code),
  subject_ref: 'required entity_ref',
  diagnostic_dependency_pins: 'required dependency_pin_set',
  player_safe_message_key: error.player_safe_message_key ?? `spatial_v3.error.${error.error_code}`,
  remediation_class: error.remediation_class ?? `typed_error_registry.${error.error_code}`,
  public_message: 'The requested spatial operation cannot be completed safely.'
})));

export function createSpatialV3TypedError(error_code, details = {}) {
  const definition = typedErrorDefinitions.find((entry) => entry.error_code === error_code);
  if (!definition) throw new TypeError(`Unknown spatial v3 typed error code: ${error_code}`);
  // A typed data-gap error must itself remain serializable while its controlled
  // registry is unresolved; shape validation still uses entity_ref exactly.
  const subjectErrors = validateSpatialV3Contract('entity_ref', details.subject_ref).filter(({ code }) => code !== 'controlled_vocabulary_gap');
  const pinErrors = validateSpatialV3Contract('dependency_pin_set', details.dependency_pins);
  if (subjectErrors.length || pinErrors.length) throw new TypeError(`Spatial v3 typed error ${error_code} requires valid subject_ref and dependency_pins.`);
  return Object.freeze({
    code: definition.error_code,
    severity: definition.severity,
    retryability: definition.retryability,
    remediation_class: definition.remediation_class,
    message_key: definition.player_safe_message_key,
    message: definition.public_message,
    subject_ref: canonicalizeSpatialV3(details.subject_ref),
    dependency_pins: canonicalizeSpatialV3(details.dependency_pins),
    diagnostics: canonicalizeSpatialV3(details.diagnostics ?? {})
  });
}

export function validateControlledVocabulary(type, value) { return validateControlledValue(type, value); }
