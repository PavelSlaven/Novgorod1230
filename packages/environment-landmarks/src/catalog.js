import { canonicalDigest } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { requiredObject, requiredValue } from './utils.js';

const APPROVED_RECORD_TABLES = Object.freeze([
  'landmark_rules', 'landmark_profiles', 'landmark_templates', 'cue_templates',
  'emission_rules', 'trace_templates', 'trace_creation_rules', 'decay_profiles'
]);

export function readCatalog(bundle, input) {
  requiredObject(bundle, 'catalog_bundle');
  for (const key of ['schema_version', 'world_revision_id', 'region_id', 'historical_period_id', 'catalog_digest', 'regional_permissions', 'source_refs', 'readiness_report']) requiredValue(bundle[key], `catalog_bundle.${key}`);
  if (bundle.schema_version !== 'environment-catalog.v2') throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', 'Unsupported environment catalog schema version.', { schema_version: bundle.schema_version });
  for (const key of ['landmark_rules', 'landmark_profiles', 'landmark_profile_entries', 'landmark_templates', 'landmark_rule_g1_classes', 'landmark_rule_node_types', 'landmark_rule_landscapes', 'landmark_rule_hydrology', 'landmark_rule_land_use', 'landmark_rule_routes', 'cue_templates', 'emission_rules', 'trace_templates', 'trace_creation_rules', 'decay_profiles', 'trace_rule_landscapes', 'trace_rule_hydrology', 'regional_permissions']) {
    if (!Array.isArray(bundle[key])) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', `catalog_bundle.${key} must be an array.`);
  }
  if (!Array.isArray(bundle.source_refs) || bundle.source_refs.length === 0 || bundle.source_refs.some((sourceRef) => typeof sourceRef !== 'string' || !sourceRef.trim())) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_PROVENANCE_MISSING', 'Catalog bundle requires non-empty normalized source_refs.', {});
  if (!bundle.readiness_report || typeof bundle.readiness_report !== 'object' || Array.isArray(bundle.readiness_report) || bundle.readiness_report.pass !== true) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_UNREADY', 'Catalog bundle readiness report must pass before runtime use.', {});
  for (const table of APPROVED_RECORD_TABLES) for (const record of bundle[table]) {
    if (record?.status !== 'approved') throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_RECORD_UNAPPROVED', 'Catalog bundle may contain only approved runtime records.', { table, record_id: record?.id ?? null });
    if (record.world_revision_id !== bundle.world_revision_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_RECORD_REVISION_MISMATCH', 'Catalog runtime record does not match the bundle world revision.', { table, record_id: record.id, expected: bundle.world_revision_id, actual: record.world_revision_id });
  }
  validateInternalReferences(bundle);
  const { catalog_digest, ...digestPayload } = bundle;
  if (canonicalDigest(digestPayload) !== catalog_digest || input.catalog_digest !== catalog_digest) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_DIGEST_MISMATCH', 'Catalog digest does not bind this environment request.', { expected: catalog_digest, actual: input.catalog_digest });
  if (bundle.world_revision_id !== input.world_revision_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_WORLD_REVISION_MISMATCH', 'Catalog world revision does not match the request.', { expected: bundle.world_revision_id, actual: input.world_revision_id });
  if (bundle.region_id !== input.region_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_REGION_MISMATCH', 'Catalog region does not match the request.', { expected: bundle.region_id, actual: input.region_id });
  if (bundle.historical_period_id !== input.historical_period_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_PERIOD_MISMATCH', 'Catalog period does not match the request.', { expected: bundle.historical_period_id, actual: input.historical_period_id });
  if (!bundle.regional_permissions.includes(input.region_id)) throw new EnvironmentFeatureError('ENVIRONMENT_REGIONAL_PERMISSION_MISSING', 'Catalog has no regional permission for this request.', { region_id: input.region_id });
  return bundle;
}

function validateInternalReferences(bundle) {
  const ids = Object.fromEntries(APPROVED_RECORD_TABLES.map((table) => [table, identifiers(bundle[table], table)]));
  assertReferences(bundle.landmark_profile_entries, 'profile_id', ids.landmark_profiles, 'environment_landmark_profile_entries');
  assertReferences(bundle.landmark_profile_entries, 'template_id', ids.landmark_templates, 'environment_landmark_profile_entries');
  assertReferences(bundle.landmark_rules, 'profile_id', ids.landmark_profiles, 'environment_landmark_rules');
  assertReferences(bundle.emission_rules, 'cue_template_id', ids.cue_templates, 'environment_emission_rules');
  assertReferences(bundle.trace_creation_rules, 'trace_template_id', ids.trace_templates, 'environment_trace_creation_rules');
  assertReferences(bundle.trace_creation_rules, 'decay_profile_id', ids.decay_profiles, 'environment_trace_creation_rules');
  for (const table of ['landmark_rule_g1_classes', 'landmark_rule_node_types', 'landmark_rule_landscapes', 'landmark_rule_hydrology', 'landmark_rule_land_use', 'landmark_rule_routes']) assertReferences(bundle[table], 'rule_id', ids.landmark_rules, table);
  for (const table of ['trace_rule_landscapes', 'trace_rule_hydrology']) assertReferences(bundle[table], 'rule_id', ids.trace_creation_rules, table);
}

function identifiers(records, table) {
  const ids = new Set();
  for (const record of records) {
    const id = record?.id;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_ID_INVALID', 'Catalog runtime records require unique stable IDs.', { table, record_id: id ?? null });
    ids.add(id);
  }
  return ids;
}

function assertReferences(records, field, knownIds, table) {
  for (const record of records) if (typeof record?.[field] !== 'string' || !knownIds.has(record[field])) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_REFERENCE_MISSING', 'Catalog bundle has a dangling internal reference.', { table, field, reference_id: record?.[field] ?? null });
}
