import { canonicalDigest } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { requiredObject, requiredValue } from './utils.js';

export function readCatalog(bundle, input) {
  requiredObject(bundle, 'catalog_bundle');
  for (const key of ['schema_version', 'world_revision_id', 'region_id', 'historical_period_id', 'catalog_digest', 'regional_permissions']) requiredValue(bundle[key], `catalog_bundle.${key}`);
  if (bundle.schema_version !== 'environment-catalog.v2') throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', 'Unsupported environment catalog schema version.', { schema_version: bundle.schema_version });
  for (const key of ['landmark_rules', 'landmark_profiles', 'landmark_profile_entries', 'landmark_templates', 'landmark_rule_g1_classes', 'landmark_rule_node_types', 'landmark_rule_landscapes', 'landmark_rule_hydrology', 'landmark_rule_land_use', 'landmark_rule_routes', 'cue_templates', 'emission_rules', 'trace_templates', 'trace_creation_rules', 'decay_profiles', 'trace_rule_landscapes', 'trace_rule_hydrology', 'regional_permissions']) {
    if (!Array.isArray(bundle[key])) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', `catalog_bundle.${key} must be an array.`);
  }
  const { catalog_digest, ...digestPayload } = bundle;
  if (canonicalDigest(digestPayload) !== catalog_digest || input.catalog_digest !== catalog_digest) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_DIGEST_MISMATCH', 'Catalog digest does not bind this environment request.', { expected: catalog_digest, actual: input.catalog_digest });
  if (bundle.world_revision_id !== input.world_revision_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_WORLD_REVISION_MISMATCH', 'Catalog world revision does not match the request.', { expected: bundle.world_revision_id, actual: input.world_revision_id });
  if (bundle.region_id !== input.region_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_REGION_MISMATCH', 'Catalog region does not match the request.', { expected: bundle.region_id, actual: input.region_id });
  if (bundle.historical_period_id !== input.historical_period_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_PERIOD_MISMATCH', 'Catalog period does not match the request.', { expected: bundle.historical_period_id, actual: input.historical_period_id });
  if (!bundle.regional_permissions.includes(input.region_id)) throw new EnvironmentFeatureError('ENVIRONMENT_REGIONAL_PERMISSION_MISSING', 'Catalog has no regional permission for this request.', { region_id: input.region_id });
  return bundle;
}
