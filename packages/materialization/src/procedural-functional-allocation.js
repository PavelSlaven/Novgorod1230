import { createHash } from 'node:crypto';
import { deepFreeze } from '@rus/kernel';

export function resolveProceduralFunctionalAllocations({ policy, actors,
  persistedPositions, existing_items, scenePackage, ...forbiddenSummary }) {
  if (!Array.isArray(existing_items)) fail('FUNCTIONAL_EXISTING_ITEMS_REQUIRED');
  if (Object.keys(forbiddenSummary).length > 0)
    fail('FUNCTIONAL_CALLER_MECHANICS_SUMMARY_FORBIDDEN');
  if (!scenePackage?.scene_package_id || !scenePackage.scene_package_digest
      || scenePackage.family_candidate_ref !==
        policy.scene_binding.family_candidate_ref
      || scenePackage.function_ref !== policy.scene_binding.function_ref
      || scenePackage.work_zone_mapping_id !==
        policy.scene_binding.work_zone_mapping_id
      || scenePackage.work_zone_mapping_digest !==
        policy.scene_binding.work_zone_mapping_digest)
    fail('FUNCTIONAL_SCENE_PACKAGE_MISMATCH');
  const ids = actors.map(({ actor_instance_id: id }) => id);
  if (ids.some((id) => typeof id !== 'string' || !id)
      || new Set(ids).size !== ids.length) fail('FUNCTIONAL_ACTOR_ID_AMBIGUOUS');
  const matches = actors.filter((actor) =>
    policy.applicability.actor_kinds.includes(actor.actor_kind)
    && actor.presence_state === 'present_committed_scene'
    && actor.occupation_ref === policy.applicability.occupation_ref
    && actor.role_ref === policy.applicability.role_ref
    && actor.activity_profile_refs?.includes(
      policy.applicability.activity_profile_ref)
    && actor.scene_package_id === scenePackage.scene_package_id
    && actor.scene_package_digest === scenePackage.scene_package_digest)
    .sort((left, right) => left.actor_instance_id.localeCompare(
      right.actor_instance_id));
  if (matches.length === 0) fail('FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING');
  const actor = matches[0];
  const positions = persistedPositions.filter(({ function_layer: layer,
    state, actor_instance_id: actorId, scene_package_id: packageId,
    scene_package_digest: packageDigest,
    work_zone_mapping_id: mappingId }) => layer ===
      policy.placement.required_function_layer
      && state === policy.placement.required_position_state
      && actorId === actor.actor_instance_id
      && packageId === scenePackage.scene_package_id
      && packageDigest === scenePackage.scene_package_digest
      && mappingId ===
        policy.scene_binding.work_zone_mapping_id);
  if (positions.length !== 1) fail('FUNCTIONAL_PLACEMENT_INVALID');
  const position = positions[0];
  const existingIds = existing_items.map(({ item_instance_id: id }) => id);
  if (existingIds.some((id) => !id)
      || new Set(existingIds).size !== existingIds.length)
    fail('FUNCTIONAL_CROSS_LAYER_REUSE_INVALID');
  const used = new Set();
  const allocations = policy.allocations.map((entry) => {
    const existing = existing_items.filter((item) =>
      item.actor_instance_id === actor.actor_instance_id
      && item.item_template_ref === entry.item_template_ref
      && !used.has(item.item_instance_id))
      .sort((left, right) => left.item_instance_id.localeCompare(
        right.item_instance_id))[0];
    if (existing && (existing.state !== 'committed'
        || existing.owner_id !== actor.actor_instance_id
        || existing.holder_id !== actor.actor_instance_id
        || existing.controller_id !== actor.actor_instance_id
        || !policy.placement.allowed_physical_positions.includes(
          existing.physical_position)
        || existing.quantity !== 1
        || existing.inventory_profile_ref !== entry.inventory_profile_ref
        || existing.quantity_profile_ref !== entry.quantity_profile_ref
        || existing.profile_entry_ref !== entry.profile_entry_ref
        || existing.source_binding_refs_digest !==
          digest(entry.source_binding_refs)))
      fail('FUNCTIONAL_REUSE_PROJECTION_INVALID');
    if (existing) used.add(existing.item_instance_id);
    const physicalPosition = existing?.physical_position
      ?? (entry.external_hand_cost > 0 ? 'hands' : 'external');
    const identity = `${policy.policy_id}:${actor.actor_instance_id}:`
      + `${entry.layer}:${entry.item_template_ref}`;
    const holderFields = actor.actor_kind === 'npc'
      ? { owner_npc_id: actor.actor_instance_id,
        holder_npc_id: actor.actor_instance_id,
        controller_npc_id: actor.actor_instance_id }
      : { owner_character_id: actor.actor_instance_id,
        holder_character_id: actor.actor_instance_id,
        controller_character_id: actor.actor_instance_id };
    return { allocation_id: identity,
      idempotency_key: identity, disposition: existing ? 'reuse' : 'create',
      item_instance_id: existing?.item_instance_id ?? `item:${identity}`,
      layer: entry.layer, actor_instance_id: actor.actor_instance_id,
      actor_kind: actor.actor_kind, ...holderFields,
      owner_id: actor.actor_instance_id, holder_id: actor.actor_instance_id,
      controller_id: actor.actor_instance_id,
      access_policy: 'actor_controlled', physical_position: physicalPosition,
      work_zone_position_id: position.position_id, quantity: 1,
      ...structuredClone(entry) };
  });
  if (new Set(allocations.map(({ item_instance_id: id }) => id)).size
      !== allocations.length) fail('FUNCTIONAL_CROSS_LAYER_REUSE_INVALID');
  return deepFreeze({ schema: 'rus.p16.actor_item_allocation_plan.v1',
    actor_instance_id: actor.actor_instance_id,
    validation_owner: {
      module: '@rus/items-property',
      functions: ['validateInventoryTopology', 'calculateInventoryMass',
        'calculateHandsState', 'resolveInventoryLoad'],
      input: 'persisted_full_actor_inventory_snapshot'
    },
    topology_requirements: {
      allowed_physical_positions: [...policy.placement.allowed_physical_positions],
      exact_owner_holder_controller: true,
      quantity: 1, reject_overloaded: true
    },
    causal_scene_binding: { scene_package_id: scenePackage.scene_package_id,
      scene_package_digest: scenePackage.scene_package_digest,
      ...structuredClone(policy.scene_binding) },
    allocations,
    readiness: 'pending_runtime_inventory_owner_validation',
    pending_gap: 'FUNCTIONAL_RUNTIME_INVENTORY_OWNER_VALIDATION_PENDING' });
}


function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
