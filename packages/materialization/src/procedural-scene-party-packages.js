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
      profile: allocationReadiness(profile, allocation), actors: sceneActors,
      allocation_policy: allocation,
      inventory_profiles: allocationProfiles(catalog.item_inventory_profiles,
        allocation?.policy), pin: structuredClone(catalog.pin) };
    return { ...payload, scene_package_digest: stage24Digest(payload) };
  });
  return deepFreeze({ schema: 'rus.procedural_scene_party_packages.v1', version: 1,
    pin: structuredClone(catalog.pin), packages,
    digest: stage24Digest(packages) });
}
function stage24Digest(value) { return `sha256:${canonicalDigest(value)}`; }
function allocationReadiness(profile, allocation) {
  if (allocation == null) return structuredClone(profile);
  const status = allocation.status === 'pending_p16_actor_activity_data_gap'
    ? 'pending_actor_activity' : 'pending_p16_owner';
  const functional_layers = profile.readiness.functional_layers.map((layer) =>
    layer.allocation_contract ? { ...layer, status } : layer);
  return { ...structuredClone(profile), readiness: {
    ...structuredClone(profile.readiness), functional_layers,
    required_layers_satisfied: profile.readiness.required_layers_satisfied,
    unresolved_current_gaps: functional_layers.filter(({ status: value }) => ![
      'mapped', 'not_applicable_active_process_only'
    ].includes(value)).map(({ source_gap_code, layer }) =>
      source_gap_code ?? `MAPPING:${layer}`)
  } };
}

function pendingAllocation(policy, profile, actors) {
  if (policy?.family_candidate_ref !== profile.family_candidate_ref) return null;
  const applicable = actors.filter((actor) => actorMatchesPolicy(actor,
    policy.applicability));
  if (applicable.length === 0) return deepFreeze({
    status: 'pending_p16_actor_activity_data_gap', policy_id: policy.policy_id,
    actor_instance_id: null, policy: structuredClone(policy) });
  return deepFreeze({ status: 'pending_p16_inventory_validation',
    policy_id: policy.policy_id, actor_instance_id: applicable[0].instance_id,
    policy: structuredClone(policy) });
}

function allocationProfiles(profiles, policy) {
  if (policy == null) return [];
  const selected = (policy.allocations ?? []).map((line) =>
    (profiles ?? []).filter((profile) => profile?.id === line.inventory_profile_ref
      && profile.item_template_id === line.item_template_ref
      && profile.status === 'approved'));
  if (selected.some((matches) => matches.length !== 1)) {
    gap('ALLOCATION_INVENTORY_PROFILE');
  }
  return selected.map(([profile]) => structuredClone(profile));
}
function actorMatchesPolicy(actor, applicability = {}) {
  const kind = actor.actor_kind ?? 'npc';
  const activity = actor.machine_state?.current_activity;
  return (!applicability.actor_kinds || applicability.actor_kinds.includes(kind))
    && (applicability.actor_presence == null
      || applicability.actor_presence === 'present_committed_scene')
    && (applicability.role_ref == null || actor.role_ref?.id === applicability.role_ref)
    && (applicability.occupation_ref == null
      || actor.occupation_ref?.id === applicability.occupation_ref)
    && (applicability.activity_profile_ref == null
      || activityMatchesPolicy(actor.machine_state, activity,
        applicability.activity_profile_ref))
    && (applicability.activity_category_ref == null
      || activity?.activity_category_id === applicability.activity_category_ref);
}

// An approved routine may expose only its generic current-work carrier.  The
// allocation policy supplies the exact activity profile; role, occupation and
// scene function above remain the admission basis.  This is deliberately not
// keyed by scenario, NPC, or authored prose.
function activityMatchesPolicy(machine, activity, profileRef) {
  if (activity?.activity_profile_ref === profileRef) return true;
  return machine?.schedule_state === 'working'
    && activity?.status === 'active'
    && ['ordinary_local_work_cycle_v1', 'current_ordinary_work']
      .includes(activity?.activity_ref)
    && activity.can_continue_automatically === true;
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
