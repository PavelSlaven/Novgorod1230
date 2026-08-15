import { buildApprovedActorProfileSnapshot } from '@rus/world-catalog-workflow';

export function buildStage7NpcCandidatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  startCandidateSet = null,
  candidatePlaceTemplateSet = null,
  worldRevisionId = null,
  approvedActorProfileSnapshot = null,
  npcCandidatePolicy = {}
} = {}) {
  const frame = historicalFrame ?? context.getStageOutput(3) ?? null;
  const runtimeSnapshot = buildRuntimeSnapshot(context.runtimeCatalogContext, frame);
  const actorSnapshot = approvedActorProfileSnapshot ?? runtimeSnapshot;
  const actorAppearanceRequired =
    npcCandidatePolicy.require_actor_base_appearance === true
    || actorSnapshot?.appearance_contract_version
      === 'actor_base_appearance_v1';
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: frame,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    start_candidate_set: startCandidateSet ?? context.getStageOutput(5) ?? null,
    candidate_place_template_set: candidatePlaceTemplateSet ?? context.getStageOutput(6) ?? null,
    world_revision_id: worldRevisionId ?? approvedActorProfileSnapshot?.world_revision_id ?? runtimeSnapshot?.world_revision_id ?? null,
    approved_actor_profile_snapshot: actorSnapshot,
    npc_candidate_policy: {
      ...npcCandidatePolicy,
      ...(npcCandidatePolicy.require_actor_base_appearance == null
        && actorAppearanceRequired
        ? { require_actor_base_appearance: true }
        : {})
    }
  };
}

function buildRuntimeSnapshot(runtimeContext, frame) {
  const actorRecords = runtimeContext?.actor_profile_catalog?.records_by_table;
  const itemRecords = runtimeContext?.applicable_catalog?.records_by_table ?? {};
  const worldPin = runtimeContext?.world_pin;
  const regionId = frame?.region?.region_id ?? frame?.region_id ?? null;
  if (!actorRecords || !worldPin || !regionId) return null;
  return buildApprovedActorProfileSnapshot({
    records_by_table: {
      ...itemRecords,
      ...actorRecords,
      region_equipment_profiles: itemRecords.region_equipment_profiles ?? [],
      region_equipment_profile_entries:
        itemRecords.region_equipment_profile_entries ?? []
    },
    world_revision_id: worldPin.world_revision_id,
    region_id: regionId,
    catalog_digest: worldPin.world_catalog_digest
  });
}
