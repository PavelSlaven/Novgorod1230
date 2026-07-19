import { sha256 } from '@rus/kernel';
import specificationsDocument from './specifications.json' with { type: 'json' };
import typedErrorDocument from './typed-error-specifications.json' with { type: 'json' };
import { controlledVocabularyRegistrySnapshot, validateControlledVocabularyRegistry } from './controlled-vocabularies.js';
export { stateMachineDefinitions } from './state-machines.js';

export const SPATIAL_V3_CONTRACT_VERSION = '4.2.0-target.1';

export const contractSpecifications = Object.freeze(specificationsDocument.specifications.map((specification) => Object.freeze({
  ...specification,
  fields: Object.freeze(specification.fields.map(Object.freeze)),
  relations: Object.freeze(specification.relations.map(Object.freeze)),
  identity: Object.freeze(specification.identity),
  invariants: Object.freeze(specification.invariants)
})));
const specificationByName = Object.freeze(Object.fromEntries(contractSpecifications.map((specification) => [specification.contract_name, specification])));
const CONTRACT_NAMES = contractSpecifications.map(({ contract_name }) => contract_name);

const ERROR_CODES = `activity_retry_lineage_invalid attachment_graph_invalid authoring_dependency_pin_missing boundary_crossing_contract_gap classification_gap cohort_membership_conflict continuation_capacity_violation continuation_terminal_ordinal_invalid controlled_vocabulary_gap dual_execution_owner dual_location_owner duplicate_departure_source expansion_capacity_temporarily_reserved expansion_reservation_conflict generated_schema_mismatch hidden_information_leak idempotency_conflict journey_handoff_snapshot_invalid journey_location_ownership_mismatch knowledge_fact_reference_invalid knowledge_target_resolution_gap lock_order_violation migration_mapping_gap migration_version_gap mode_transition_contract_missing movement_anchor_unresolved movement_capability_missing movement_endpoint_kind_invalid movement_method_cost_missing normative_contract_conflict orientation_frame_cycle orientation_profile_invalid portal_state_contract_gap preparation_claim_conflict relation_capacity_undefined route_chain_discontinuous route_contract_missing route_cycle_or_branch route_endpoint_invalid route_plan_digest_mismatch route_plan_execution_conflict route_plan_snapshot_missing route_plan_version_pin_missing route_segment_context_gap scene_endpoint_slot_ambiguous scene_endpoint_slot_missing spatial_candidate_gap state_version_conflict stranded_rescue_contract_missing target_preparation_failed terminal_endpoint_preparation_gap terminal_target_gap time_accumulator_invalid time_delay_occurrence_invalid time_factor_invalid travel_interruption_unresolved travel_interval_conflict visual_layout_gap`.split(' ');

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
function validateControlledValue(type, value) {
  const definition = controlledVocabularyByName[type];
  if (!definition) return [issue('controlled_vocabulary_gap', type, `Unknown controlled vocabulary ${type}.`)];
  if (!definition.values.includes(value)) return [issue('controlled_vocabulary_gap', type, `${type} has no approved value for this input.`)];
  return [];
}

function validateType(type, value, path) {
  if (type.startsWith('enum[')) return type.slice(5, -1).split(', ').includes(String(value)) ? [] : [issue('generated_schema_mismatch', path, `${path} must be one of ${type}.`)];
  if (type.startsWith('controlled_')) return validateControlledValue(type, value);
  const list = type.match(/^(?:relation_set|snapshot_list)\[(.+)]$/);
  if (list) return Array.isArray(value) ? value.flatMap((entry, index) => validateType(list[1], entry, `${path}[${index}]`)) : [issue('generated_schema_mismatch', path, `${path} must be an array.`)];
  if (specificationByName[type]) return validateSpatialV3Contract(type, value).map((entry) => ({ ...entry, field: `${path}.${entry.field}` }));
  if (['stable_id', 'authoring_version', 'string', 'game_timestamp', 'system_timestamp'].includes(type)) return stableId(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a non-empty string.`)];
  if (['state_version', 'positive_integer'].includes(type)) return Number.isInteger(value) && value > 0 ? [] : [issue('generated_schema_mismatch', path, `${path} must be a positive integer.`)];
  if (['non_negative_integer', 'integer', 'ppm', 'azimuth_mdeg', 'half_width_mdeg'].includes(type)) return Number.isInteger(value) && (type !== 'non_negative_integer' || value >= 0) ? [] : [issue('generated_schema_mismatch', path, `${path} must be an integer.`)];
  if (type === 'boolean') return typeof value === 'boolean' ? [] : [issue('generated_schema_mismatch', path, `${path} must be boolean.`)];
  if (type === 'sha256_hex') return typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value) ? [] : [issue('generated_schema_mismatch', path, `${path} must be a SHA-256 digest.`)];
  if (type === 'rational') return isObject(value) && Number.isInteger(value.numerator) && Number.isInteger(value.denominator) && value.denominator > 0 ? [] : [issue('generated_schema_mismatch', path, `${path} must be an exact rational.`)];
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

const typedErrorByCode = Object.freeze(Object.fromEntries(typedErrorDocument.errors.map((error) => [error.error_code, error])));
export const typedErrorDefinitions = Object.freeze(ERROR_CODES.map((error_code) => Object.freeze({
  ...typedErrorByCode[error_code],
  error_code,
  owner_package: '@rus/contracts',
  severity: error_code.endsWith('_gap') || error_code.includes('missing') || error_code.includes('unresolved') ? 'hard_block' : error_code === 'hidden_information_leak' ? 'security' : 'error',
  subject_ref: 'required entity_ref',
  diagnostic_dependency_pins: 'required dependency_pin_set',
  player_safe_message_key: `spatial_v3.error.${error_code}`,
  remediation_class: `appendix_c.${error_code}`,
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
  return Object.freeze({ code: definition.error_code, severity: definition.severity, message_key: definition.player_safe_message_key, message: definition.public_message, subject_ref: canonicalizeSpatialV3(details.subject_ref), dependency_pins: canonicalizeSpatialV3(details.dependency_pins), diagnostics: canonicalizeSpatialV3(details.diagnostics ?? {}) });
}

export function validateControlledVocabulary(type, value) { return validateControlledValue(type, value); }
