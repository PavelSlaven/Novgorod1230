import { MaterializationError } from './core.js';

export function assertLowerDvinaTraceTimestamp(timestamp) {
  if (!timestamp || !/^(?:0|[1-9][0-9]*)$/.test(timestamp.whole_minutes ?? '')
    || timestamp.subminute_numerator !== '0' || timestamp.subminute_denominator !== '1') {
    throw new MaterializationError('TIMESTAMP_AMBIGUOUS', 'Exact GameTimestamp could not be resolved.');
  }
}

export function lowerDvinaTraceRequestIdentity(input) {
  return {
    party_id: input.party_id,
    scenario_id: input.scenario_id,
    scenario_definition_revision: input.scenario_definition_revision,
    scenario_manifest_digest: input.scenario_manifest_digest,
    world_revision_id: input.world_revision_id,
    world_catalog_digest: input.world_catalog_digest,
    domain_catalog_pin: structuredClone(input.domain_catalog_pin),
    materializer_version: input.materializer_version,
    rng_algorithm_id: input.rng_algorithm_id,
    seed_context: input.seed_context,
    idempotency_key: input.idempotency_key,
    trigger: input.trigger,
    occurrence: input.occurrence,
    existing_party_state: structuredClone(input.existing_party_state),
    ...(input.world_compatibility
      ? { world_compatibility: structuredClone(input.world_compatibility) }
      : {})
  };
}
