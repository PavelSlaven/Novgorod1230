import { STAGE8_INPUT_SCHEMA } from './policy.js';
import { buildApprovedItemCatalogSnapshot } from '@rus/world-catalog-workflow';

export function buildStage8ItemProfileInputFromPipeline(context, options = {}, services = {}) {
  const normalize = services.normalizeStage8ItemProfilePolicy ?? ((value) => value ?? {});
  const regional = options.regional_context_package ?? context.getStageOutput(4) ?? null;
  const snapshot = options.approved_catalog_snapshot
    ?? buildRuntimeSnapshot(context.runtimeCatalogContext)
    ?? regional?.approved_item_catalog_snapshot
    ?? null;
  return {
    version: 1,
    schema: STAGE8_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.getStageOutput(2) ?? null,
    historical_frame: options.historical_frame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regional,
    candidate_place_template_set: options.candidate_place_template_set ?? context.getStageOutput(6) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? context.getStageOutput(7) ?? null,
    world_revision_id: options.world_revision_id ?? snapshot?.world_revision_id ?? null,
    approved_catalog_snapshot: snapshot,
    item_profile_policy: normalize(options.item_profile_policy ?? {})
  };
}

function buildRuntimeSnapshot(runtimeContext) {
  const records = runtimeContext?.applicable_catalog?.records_by_table;
  const pin = runtimeContext?.pin;
  if (!records || !pin) return null;
  return buildApprovedItemCatalogSnapshot({
    records_by_table: records,
    world_revision_id: pin.compatible_world_revision_id,
    catalog_digest: pin.catalog_digest
  });
}
