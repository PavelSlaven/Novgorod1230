import { calculateHandsState, calculateInventoryMass, resolveInventoryLoad,
  validateInventoryTopology } from '@rus/items-property';

const CARRIERS = new Set(['ordinary_local_work_cycle_v1',
  'current_ordinary_work']);

/** Turns approved package policy into Stage 24 item rows. */
export function resolveProceduralActorAllocations({ packages, result, partyId,
  runId } = {}) {
  if (packages == null) return [];
  if (packages.schema !== 'rus.procedural_scene_party_packages.v1'
      || !Array.isArray(packages.packages)) fail('P16_ALLOCATION_PACKAGE_INVALID');
  const scenes = new Map((result.immediate.prepared_scenes ?? [])
    .concat(result.immediate.spatial).map(({ node, anchor }) =>
      [node.instance_id, { node, anchor }]));
  const actors = new Map((result.immediate.npcs ?? []).map((npc) =>
    [npc.instance_id, npc]));
  const baseItems = result.immediate.items ?? [];
  const containers = result.immediate.containers ?? [];
  const allocations = [];
  const resolvedPolicies = new Set();
  for (const entry of packages.packages) {
    const policy = entry?.allocation_policy;
    if (policy == null) continue;
    if (policy.status === 'pending_p16_actor_activity_data_gap') continue;
    if (policy.status !== 'pending_p16_inventory_validation' || !policy.policy
        || entry.party_id !== partyId || entry.run_id !== runId
        || !scenes.has(entry.g5_node_id)) fail('P16_ALLOCATION_PACKAGE_INVALID');
    const allocationKey = `${policy.policy_id}\u0000${policy.actor_instance_id}`;
    if (resolvedPolicies.has(allocationKey)) continue;
    resolvedPolicies.add(allocationKey);
    const actor = actors.get(policy.actor_instance_id);
    const evidence = activityAndStrength(actor, scenes.get(entry.g5_node_id),
      policy.policy, result.immediate.timestamp);
    const inventory = actorInventory(baseItems, containers, actor.instance_id);
    const profiles = allocationProfiles(entry.inventory_profiles,
      policy.policy.allocations);
    const created = [];
    for (const line of policy.policy.allocations) {
      const reusable = inventory.items.find((item) => item.template_id
        === line.item_template_ref);
      if (reusable) {
        allocations.push({ item: reusable, reused: true, evidence,
          layer: line.layer });
        continue;
      }
      const profile = profiles.get(line.item_template_ref);
      const item = { instance_id: allocationItemId(policy.policy_id,
        actor.instance_id, line.item_template_ref),
      template_id: line.item_template_ref, profile_id: line.inventory_profile_ref,
      category_id: line.object_category_ref, quantity: 1,
      condition_state: 'serviceable', legal_status: 'owned',
      claim_state: 'established', holder_npc_id: actor.instance_id,
      owner_npc_id: actor.instance_id, controller_npc_id: actor.instance_id,
      physical_position: line.layer === 'tool' ? 'hands' : 'external', state: {
        display_name: line.item_template_ref,
        causal_basis: 'procedural_actor_allocation_v1',
        inventory_profile_snapshot: profile,
        allocation_evidence: { policy_id: policy.policy_id, layer: line.layer,
          activity: evidence, source_refs: [...(line.source_refs ?? []),
            ...(line.source_binding_refs ?? [])] }
      } };
      created.push(item);
      allocations.push({ item, reused: false, evidence, layer: line.layer });
    }
    validateInventory([...inventory.items, ...created], inventory.containers,
      actor.instance_id, evidence.strength);
  }
  return allocations;
}

function allocationProfiles(profiles, allocations) {
  if (!Array.isArray(profiles) || !Array.isArray(allocations)
      || new Set(allocations.map(({ item_template_ref }) => item_template_ref)).size
        !== allocations.length) fail('P16_ALLOCATION_POLICY_INVALID');
  const resolved = new Map();
  for (const line of allocations) {
    if (!['tool', 'work_material'].includes(line?.layer)
        || line.min_quantity !== 1 || line.max_quantity !== 1) {
      fail('P16_ALLOCATION_POLICY_INVALID');
    }
    const matches = profiles.filter((profile) => profile?.id
      === line.inventory_profile_ref
      && profile.item_template_id === line.item_template_ref
      && profile.status === 'approved'
      && Number(profile.mass_grams) === Number(line.mass_grams)
      && Number(profile.external_hand_cost) === Number(line.external_hand_cost));
    if (matches.length !== 1) fail('P16_ALLOCATION_INVENTORY_PROFILE_INVALID');
    const profile = matches[0];
    resolved.set(line.item_template_ref, {
      template_id: profile.item_template_id,
      mass_grams: Number(profile.mass_grams),
      carry_form: profile.carry_form,
      external_hand_cost: Number(profile.external_hand_cost)
    });
  }
  return resolved;
}

function allocationItemId(policyId, actorId, templateId) {
  return `item_allocation_${encodeURIComponent(policyId)}_${encodeURIComponent(actorId)}_${encodeURIComponent(templateId)}`;
}

function actorInventory(items, containers, actorId) {
  const carriedContainers = new Set(containers.filter((container) =>
    container.holder_npc_id === actorId).map(({ instance_id }) => instance_id));
  for (let changed = true; changed;) {
    changed = false;
    for (const container of containers) {
      if (container.parent_container_id && carriedContainers.has(
        container.parent_container_id) && !carriedContainers.has(container.instance_id)) {
        carriedContainers.add(container.instance_id); changed = true;
      }
    }
  }
  const selected = new Map(items.filter((item) => item.holder_npc_id === actorId
    || carriedContainers.has(item.container_id)).map((item) =>
    [item.instance_id, item]));
  for (let changed = true; changed;) {
    changed = false;
    for (const item of items) if (selected.has(item.attached_item_id)
        && !selected.has(item.instance_id)) {
      selected.set(item.instance_id, item); changed = true;
    }
  }
  return { items: [...selected.values()], containers: containers.filter(
    (container) => carriedContainers.has(container.instance_id)) };
}

function activityAndStrength(actor, scene, policy, timestamp) {
  const activity = actor?.machine_state?.current_activity;
  const exact = activity?.activity_profile_ref
    === policy.applicability?.activity_profile_ref;
  const generic = actor?.machine_state?.schedule_state === 'working'
    && activity?.status === 'active' && CARRIERS.has(activity?.activity_ref)
    && activity.can_continue_automatically === true;
  const band = partyTimeBand(timestamp);
  const scheduled = actor?.schedule_records?.filter((record) =>
    record?.schedule_profile_id === activity?.activity_ref
      && record.time_band === band) ?? [];
  if (!actor || actor.role_ref?.id !== policy.applicability?.role_ref
      || actor.occupation_ref?.id !== policy.applicability?.occupation_ref
      || actor.anchor_id !== scene.anchor.instance_id || (!exact && !generic)
      || (generic && scheduled.length !== 1)) {
    fail('P16_ALLOCATION_ACTIVITY_DATA_GAP');
  }
  if (!['background', 'scene'].includes(actor.profile_level)
      || !actor.semantic_state?.approved_runtime_basis
      || typeof actor.profile_record_digest !== 'string') {
    fail('P16_ALLOCATION_BODY_DATA_GAP');
  }
  return { resolved_activity_profile_ref: policy.applicability.activity_profile_ref,
    carrier_ref: exact ? activity.activity_profile_ref : activity.activity_ref,
    time_band: band, strength: 10,
    strength_state: 'derived_for_current_scene_mechanic', source_refs: [
      'data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt',
      actor.profile_record_digest, actor.role_ref.id, actor.occupation_ref.id] };
}

function partyTimeBand(timestamp) {
  const minutes = Number(timestamp?.whole_minutes);
  if (!Number.isSafeInteger(minutes) || minutes < 0) fail('P16_ALLOCATION_TIME_DATA_GAP');
  const local = minutes % 1440;
  return local >= 360 && local < 1080 ? 'day' : 'night';
}

function validateInventory(items, containers, actorId, strength) {
  const itemProfiles = items.map((item) => ({ template_id: item.template_id,
    ...(item.state?.inventory_profile_snapshot ?? {}) }));
  const input = { party_id: 'stage24', actor_id: actorId, strength,
    items: items.map((item) => ({ item_id: item.instance_id,
      template_id: item.template_id, quantity: item.quantity })),
    containers: containers.map((container) => ({
      container_id: container.instance_id, template_id: container.template_id })),
    item_profiles: itemProfiles, container_profiles: [],
    item_placements: items.map((item) => inventoryPlacement(item, false)),
    container_placements: containers.map((container) =>
      inventoryPlacement(container, true)) };
  const topology = validateInventoryTopology(input);
  const mass = calculateInventoryMass(input);
  const hands = calculateHandsState(input);
  const load = resolveInventoryLoad({ total_mass_grams: mass.total_mass_grams,
    strength });
  if (!topology.pass || !mass.pass || !hands.pass || !load.pass
      || load.load_category === 'overloaded') fail('P16_ALLOCATION_INVENTORY_REJECTED');
}

function inventoryPlacement(value, container) {
  const key = container ? 'container_id' : 'item_id';
  const placement = { party_id: 'stage24', [key]: value.instance_id };
  for (const field of ['anchor_id', 'container_id', 'parent_container_id',
    'attached_item_id', 'physical_position', 'equipment_slot_category_id']) {
    if (value[field] != null) placement[field] = value[field];
  }
  if (value.holder_npc_id != null) placement.holder_character_id = value.holder_npc_id;
  else if (value.holder_character_id != null) placement.holder_character_id = value.holder_character_id;
  return placement;
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
