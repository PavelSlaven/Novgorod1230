import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from '@rus/materialization';
import { validateActorBaseAttributes } from '@rus/materialization';

export function attachApprovedProceduralNpc({ party_materialization: source,
  procedural_npc: materialized, equipment_catalog: catalog = null } = {}) {
  if (!Array.isArray(source?.immediate?.npcs) || !source?.immediate?.player
      || !source?.trace
      || materialized?.schema !== 'rus.approved_procedural_npc_result.v1') {
    throw new MaterializationError('PROCEDURAL_NPC_STAGE15_INPUT_INVALID',
      'Stage 15 procedural NPC handoff requires a party materialization.');
  }
  const result = structuredClone(source);
  if (result.immediate.npcs.some(({ instance_id: id }) =>
    id === materialized.npc.instance_id)) {
    throw new MaterializationError('PROCEDURAL_NPC_STAGE15_DUPLICATE',
      'Procedural NPC stable identity is already present.');
  }
  if (!validateActorBaseAttributes(materialized.npc.base_attributes)) {
    throw new MaterializationError('PROCEDURAL_NPC_ATTRIBUTES_DATA_GAP',
      'Stage 15 requires actor_base_attributes_v1 before equipment.');
  }
  result.immediate.npcs.push(structuredClone(materialized.npc));
  const offset = result.trace.choices.length;
  result.trace.choices.push(...materialized.choices.map((choice, index) => ({
    ...structuredClone(choice), choice_ordinal: offset + index
  })));
  result.trace.actor_base_attributes = [
    ...(result.trace.actor_base_attributes ?? []),
    structuredClone(materialized.attribute_trace)
  ];
  if (result.immediate.environment_snapshot != null
      && JSON.stringify(result.immediate.environment_snapshot)
        !== JSON.stringify(materialized.environment)) {
    throw new MaterializationError('PROCEDURAL_NPC_ENVIRONMENT_CONFLICT',
      'Procedural NPC and party must share one initial environment snapshot.');
  }
  result.immediate.environment_snapshot =
    structuredClone(materialized.environment);
  if (materialized.initial_equipment_candidates.length > 0) {
    if (catalog?.activation?.status !== 'active') {
      throw new MaterializationError('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP',
        'Procedural NPC equipment requires exact active catalog rows.');
    }
    const prior = result.initial_actor_equipment_handoff ?? {};
    result.initial_actor_equipment_handoff = {
      party_id: result.party_id,
      world_revision_id: result.request_identity.world_revision_id,
      request_id: result.request_identity.idempotency_key,
      run_id: result.run_id,
      g4_id: result.immediate.spatial.position.g4_id,
      actor_candidate_instance_map: mergeActorMap([
        ...(prior.actor_candidate_instance_map ?? []),
        { actor_candidate_id: 'player_character',
          actor_instance_id: result.immediate.player.instance_id,
          actor_kind: 'player_character' },
        ...result.immediate.npcs.map((npc) => ({
          actor_candidate_id: npc.participant_slot_ref,
          actor_instance_id: npc.instance_id, actor_kind: 'npc' }))]),
      initial_equipment_candidates: [
        ...(prior.initial_equipment_candidates ?? []),
        ...structuredClone(materialized.initial_equipment_candidates)],
      item_templates: structuredClone(catalog.item_templates),
      item_inventory_profiles: structuredClone(catalog.item_inventory_profiles),
      item_visual_profiles: structuredClone(catalog.item_visual_profiles),
      catalog_digest: catalog.catalog_digest
    };
  }
  delete result.trace.result_digest;
  result.trace.result_digest = computeMaterializationEnvelopeDigest(result);
  return deepFreeze(result);
}

function mergeActorMap(values) {
  return [...new Map(values.map((value) =>
    [value.actor_candidate_id, value])).values()].sort((a, b) =>
    a.actor_candidate_id.localeCompare(b.actor_candidate_id));
}
