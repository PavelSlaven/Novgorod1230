import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, deterministicInstanceId, MaterializationError } from './core.js';
import { compileProceduralSceneProfile } from './procedural-scene-profile-compiler.js';

export function compileProceduralScenePartyPackages({ party_id: partyId,
  run_id: runId, world_pin: worldPin,
  verified_procedural_compiled_catalog: catalog, scenes, actors = [] } = {}) {
  if (!text(partyId) || !text(runId) || !Array.isArray(scenes)
      || !Array.isArray(actors) || !verifiedCatalog(catalog)
      || catalog.pin.compatible_world_revision_id !== worldPin?.world_revision_id
      || catalog.pin.compatible_world_catalog_digest !== worldPin?.world_catalog_digest) gap('INPUT');
  const packages = scenes.map(normalizeScene).sort(byScene).map((scene) => {
    const profile = compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: catalog, scene, world_pin: worldPin
    });
    const sceneActors = actors.filter((actor) => actor?.g5_node_id === scene.g5_node_id
      && text(actor.instance_id)).map((actor) => structuredClone(actor))
      .sort((a, b) => a.instance_id.localeCompare(b.instance_id));
    const allocation = pendingAllocation(catalog.allocation_policy?.payload?.policy,
      profile, sceneActors);
    const scene_package_id = deterministicInstanceId(partyId, runId,
      'procedural_scene_package', scene.scene_template_id, scene.g5_id,
      scene.g6_instance_id, scene.position_id);
    const payload = { scene_package_id, party_id: partyId, run_id: runId,
      family: profile.family, g5_node_id: scene.g5_node_id,
      g6_instance_id: scene.g6_instance_id, position_id: scene.position_id,
      profile: structuredClone(profile), actors: sceneActors,
      allocation_policy: allocation, pin: structuredClone(catalog.pin) };
    return { ...payload, scene_package_digest: canonicalDigest(payload) };
  });
  return deepFreeze({ schema: 'rus.procedural_scene_party_packages.v1', version: 1,
    pin: structuredClone(catalog.pin), packages,
    digest: canonicalDigest(packages) });
}

function pendingAllocation(policy, profile, actors) {
  if (policy?.family_candidate_ref !== profile.family_candidate_ref) return null;
  const applicable = actors.filter((actor) => actorMatchesPolicy(actor,
    policy.applicability));
  if (applicable.length === 0) return null;
  return deepFreeze({ status: 'pending_p16_inventory_validation',
    policy_id: policy.policy_id, actor_instance_id: applicable[0].instance_id,
    allocations: structuredClone(policy.allocations) });
}
function actorMatchesPolicy(actor, applicability = {}) {
  const kind = actor.actor_kind ?? 'npc';
  return (!applicability.actor_kinds || applicability.actor_kinds.includes(kind))
    && (applicability.role_ref == null || actor.role_ref?.id === applicability.role_ref)
    && (applicability.occupation_ref == null
      || actor.occupation_ref?.id === applicability.occupation_ref);
}
function normalizeScene(scene) {
  if (!object(scene) || ![scene.scene_template_id, scene.g5_id,
    scene.g5_node_id, scene.g6_instance_id, scene.position_id].every(text)) gap('SCENE');
  return structuredClone(scene);
}
function verifiedCatalog(value) { return value?.schema === 'rus.verified_procedural_compiled_catalog.v1' && value.verified === true; }
function byScene(a, b) { return [a.scene_template_id, a.g5_id, a.g6_instance_id, a.position_id].map((value, index) => value.localeCompare([b.scene_template_id, b.g5_id, b.g6_instance_id, b.position_id][index])).find(Boolean) ?? 0; }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function object(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function gap(reason) { throw new MaterializationError('PROCEDURAL_SCENE_PACKAGE_DATA_GAP', 'Exact procedural scene package inputs are incomplete.', { reason }); }
