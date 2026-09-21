import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, deterministicInstanceId, MaterializationError } from './core.js';
import { compileProceduralSceneProfile } from './procedural-scene-profile-compiler.js';

export function compileProceduralScenePartyPackages({ party_id: partyId, run_id: runId, world_pin: worldPin, verified_procedural_compiled_catalog: catalog, bindings, records_by_table: tables, scenes, actors = [] } = {}) {
  if (!text(partyId) || !text(runId) || !Array.isArray(bindings) || !Array.isArray(scenes) || !tables || catalog?.schema !== 'rus.verified_procedural_compiled_catalog.v1' || catalog.verified !== true || catalog.pin?.compatible_world_revision_id !== worldPin?.world_revision_id || catalog.pin?.compatible_world_catalog_digest !== worldPin?.world_catalog_digest) gap('INPUT');
  const packages = scenes.map((scene, ordinal) => {
    if (!text(scene.family) || !text(scene.g5_node_id) || !text(scene.g6_instance_id) || !text(scene.position_id)) gap('SCENE');
    const binding = bindings.filter((row) => row.status === 'approved' && row.family === scene.family);
    if (binding.length !== 1) gap('BINDING');
    const profile = compileProceduralSceneProfile({ binding: binding[0], records_by_table: tables, world_pin: worldPin });
    const sceneActors = actors.filter((actor) => actor.scene_ref === scene.scene_ref && text(actor.instance_id)).sort((a, b) => a.instance_id.localeCompare(b.instance_id));
    const policy = catalog.allocation_policy?.payload?.policy;
    const allocation = policy?.applicability?.function_ref === scene.function_ref ? { status: 'pending_p16_inventory_validation', policy_id: policy.policy_id, actor_instance_id: sceneActors[0]?.instance_id ?? null, allocations: structuredClone(policy.allocations) } : null;
    const scene_package_id = deterministicInstanceId(partyId, runId, 'procedural_scene_package', scene.family, ordinal);
    const payload = { scene_package_id, party_id: partyId, run_id: runId, family: scene.family, g5_node_id: scene.g5_node_id, g6_instance_id: scene.g6_instance_id, position_id: scene.position_id, profile: structuredClone(profile), actors: structuredClone(sceneActors), allocation_policy: allocation, pin: structuredClone(catalog.pin) };
    return { ...payload, scene_package_digest: canonicalDigest(payload) };
  });
  return deepFreeze({ schema: 'rus.procedural_scene_party_packages.v1', version: 1, pin: structuredClone(catalog.pin), packages, digest: canonicalDigest(packages) });
}
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function gap(reason) { throw new MaterializationError('PROCEDURAL_SCENE_PACKAGE_DATA_GAP', 'Exact procedural scene package inputs are incomplete.', { reason }); }
