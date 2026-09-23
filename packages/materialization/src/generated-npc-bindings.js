import { canonicalDigest, createRandomSource, deriveSeed, MaterializationError,
  RNG_VERSION } from './core.js';

const VERSION = 'm2c_npc_composition_v1';
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const same = (a, b) => a?.id === b?.id && a?.version === b?.version;
const gap = (code) => { throw new MaterializationError(code, 'Exact approved generated NPC data is required.'); };

/** Compile imported P12 composition into existing NPC/Stage 16 inputs. No persistence. */
export function compileGeneratedNpcBindings({ party_id: partyId, run_id: runId,
  scene, closure, approved_bundle: approvedBundle, environment,
  actor_base_attributes_runtime_profile: actorProfile, equipment_activation: activation,
  equipment_catalog_digest: equipmentDigest, world_catalog_digest: worldDigest } = {}) {
  const world = closure?.world_revision_id;
  const composition = closure?.composition;
  const canonical = closure?.canonical_g5_ref;
  const template = closure?.generation_template_ref;
  if (closure?.schema !== 'rus.m2c_npc_binding_bundle.v1'
    || ![partyId, runId, scene?.site_id, world, worldDigest].every(text)
    || scene.party_id !== partyId || !Array.isArray(scene.rows)
    || composition?.status !== 'approved' || composition.world_revision_id !== world
    || composition.g4_id !== closure.g4_ref?.id
    || composition.g4_version !== closure.g4_ref?.version
    || Boolean(canonical) === Boolean(template)
    || (canonical ? composition.canonical_g5_id !== canonical.id
      || composition.canonical_g5_version !== canonical.version
      || composition.generation_template_id != null || composition.generation_template_version != null
      : composition.generation_template_id !== template.id
        || composition.generation_template_version !== template.version
        || composition.canonical_g5_id != null || composition.canonical_g5_version != null)
    || !text(composition.canonical_digest)) gap('NPC_COMPOSITION_SCOPE_GAP');
  const runtimeRows = approvedIndex(closure.runtime_profiles, world);
  const regionalRows = approvedIndex(closure.regional_context_profiles, world);
  const definition = composition.payload;
  const candidates = definition?.weighted_profile_refs;
  if (!Array.isArray(candidates) || !candidates.length
    || new Set(candidates.map((entry) => key(entry.profile_ref))).size !== candidates.length) {
    gap('NPC_COMPOSITION_PROFILE_GAP');
  }
  const profiles = candidates.map((entry) => ({ row: resolve(runtimeRows, entry.profile_ref, 'npc_binding'), weight: entry.weight }));
  validateWeights(profiles);
  const counts = definition.count_weights;
  if (!Number.isSafeInteger(composition.min_count) || composition.min_count < 0
    || !Number.isSafeInteger(composition.max_count) || composition.max_count < composition.min_count
    || !Array.isArray(counts) || counts.length !== composition.max_count - composition.min_count + 1) {
    gap('NPC_COMPOSITION_COUNT_GAP');
  }
  const countCandidates = counts.map((weight, index) => ({ count: composition.min_count + index, weight }));
  validateWeights(countCandidates);
  const positionResult = approvedPositions(scene, definition.placement_policy);
  const seed = deriveSeed({ version: VERSION, rng_version: RNG_VERSION, party_id: partyId,
    run_id: runId, site_id: scene.site_id, world_revision_id: world,
    composition_id: composition.id, composition_version: composition.version,
    composition_digest: composition.canonical_digest });
  const random = createRandomSource({ seed: seed.uint32 });
  const choices = [];
  const select = (entries, choiceKey, identity) => {
    const draw = random.nextUint32();
    const selected = weighted(entries, draw);
    choices.push({ choice_key: choiceKey, rng_draw: draw, rng_counter: random.drawCount,
      selected_id: identity(selected), candidate_set_digest: canonicalDigest(entries),
      selected_weight: selected.weight });
    return selected;
  };
  const count = positionResult.empty_rule ? 0
    : select(countCandidates, 'npc_count', (entry) => String(entry.count)).count;
  if (count > positionResult.positions.length) gap('NPC_COMPOSITION_POSITION_CAPACITY_GAP');
  if (count > 0 && (approvedBundle?.schema !== 'rus.procedural_actor_temporal_bundle.v1'
    || environment?.schema !== 'rus.approved_initial_environment.v1'
    || activation?.status !== 'active' || !text(equipmentDigest) || !actorProfile)) gap('NPC_COMPOSITION_RUNTIME_PIN_GAP');
  const npcInputs = [];
  const usedRows = new Map();
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const selected = select(profiles, `npc_profile:${ordinal}`, (entry) => entry.row.id).row;
    const payload = selected.payload;
    if (!Array.isArray(payload.runtime_profile_refs) || !payload.runtime_profile_refs.length
      || !Array.isArray(payload.regional_context_refs) || !payload.regional_context_refs.length) gap('NPC_COMPOSITION_DEPENDENCY_GAP');
    const shared = new Map(payload.runtime_profile_refs.map((ref) => {
      const row = resolve(runtimeRows, ref);
      usedRows.set(key(row), row);
      return [key(row), row];
    }));
    const body = resolve(shared, payload.body_profile_ref, 'body').payload;
    const activity = resolve(shared, payload.activity_profile_ref, 'activity').payload;
    const routine = resolve(shared, payload.routine_profile_ref, 'routine').payload;
    const clothing = resolve(shared, payload.clothing_profile_ref, 'clothing').payload;
    const regions = payload.regional_context_refs.map((ref) => resolve(regionalRows, ref))
      .filter((row) => applicable(row.payload, closure))
      .map((row) => ({ row, weight: row.payload.gameplay_weight }));
    if (!regions.length) gap('NPC_COMPOSITION_REGIONAL_CONTEXT_GAP');
    validateWeights(regions);
    const region = select(regions, `npc_regional_context:${ordinal}`, (entry) => entry.row.id).row;
    const actorSlot = `${scene.site_id}:npc:${ordinal}`;
    const tools = (payload.initial_equipment_templates ?? []).map((candidate) => ({ ...structuredClone(candidate),
      equipment_candidate_id: `${actorSlot}:${candidate.equipment_candidate_id}`,
      target_actor_slot_ref: actorSlot, owner_ref: actorSlot, holder_ref: actorSlot,
      controller_ref: actorSlot, instance_key: `${actorSlot}:${candidate.equipment_candidate_id}` }));
    if (!text(selected.role_ref) || !text(selected.occupation_ref)
      || activity.status !== 'approved' || clothing.status !== 'approved'
      || !text(activity.record_id)) gap('NPC_COMPOSITION_RUNTIME_PROFILE_GAP');
    const position = positionResult.positions[ordinal];
    const actorSeed = deriveSeed({ parent_seed_digest: seed.digest, actor_slot_ref: actorSlot, domain: 'appearance' });
    const temporal = [...approvedBundle.temporal_records];
    const existing = temporal.filter((record) => record.record_id === activity.record_id);
    if (existing.length > 1 || (existing.length === 1 && canonicalDigest(existing[0]) !== canonicalDigest(activity))) gap('NPC_COMPOSITION_ACTIVITY_CONFLICT');
    if (!existing.length) temporal.push(activity);
    npcInputs.push({ position_id: position.id, environment,
      random: createRandomSource({ seed: actorSeed.uint32 }), routine_profile: routine,
      approved_bundle: { ...approvedBundle, temporal_records: temporal,
        clothing_profiles: [clothing], regional_context_profiles: [region.payload] },
      binding: { schema: 'rus.approved_procedural_npc_binding.v1', status: 'approved',
        actor_slot_ref: actorSlot, ordinal, role_ref: selected.role_ref, occupation_ref: selected.occupation_ref,
        profile_level: payload.profile_level, actor_profile_rule_ref: payload.actor_profile_rule_ref,
        demographic_profile_ref: payload.demographic_profile_ref, appearance_profile_ref: payload.appearance_profile_ref,
        anchor_id: position.id, g5_node_id: scene.site_id, location_profile_ref: composition.id,
        zone_ref: position.template_slot_key, activity_record_ref: activity.record_id,
        observable_activity: structuredClone(payload.observable_activity), body_profile: body,
        profile_candidate_set_digest: canonicalDigest(candidates), profile_record_digest: canonicalDigest(selected.payload),
        world_revision_id: world, world_catalog_digest: worldDigest, parent_seed_digest: actorSeed.digest,
        actor_base_attributes_runtime_profile: actorProfile, initial_equipment_candidates: tools,
        equipment_activation: activation, activity_equipment_candidate_refs: tools.map((tool) => tool.equipment_candidate_id),
        clothing_profile_ref: payload.clothing_profile_ref, regional_context_ref: { id: region.id, version: region.version },
        g4_ref: { ...closure.g4_ref, world_revision_id: world },
        ...(canonical ? { canonical_g5_ref: canonical } : { generation_template_ref: template }) } });
  }
  const rows = [...usedRows.values()];
  return { npc_inputs: npcInputs, equipment_catalog: { activation, catalog_digest: equipmentDigest,
    item_templates: rows.filter((row) => row.profile_kind === 'item_template').map((row) => row.payload),
    item_inventory_profiles: rows.filter((row) => row.profile_kind === 'item_inventory').map((row) => row.payload),
    item_visual_profiles: rows.filter((row) => row.profile_kind === 'item_visual').map((row) => row.payload) },
  selection_trace: { algorithm_version: VERSION, rng_version: RNG_VERSION, seed_digest: seed.digest,
    count, choices, empty_context_rule: positionResult.empty_rule, equipment_catalog_digest: equipmentDigest ?? null,
    composition_ref: { id: composition.id, version: composition.version, canonical_digest: composition.canonical_digest } } };
}

function approvedPositions(scene, policy) {
  if (policy?.status !== 'approved' || !Array.isArray(policy.position_slot_order)
    || !policy.position_slot_order.length || !Array.isArray(policy.allowed_physical_class_ids)
    || !Array.isArray(policy.empty_context_rules)) gap('NPC_COMPOSITION_PLACEMENT_POLICY_GAP');
  const g6 = new Map(scene.rows.filter((row) => row.target_table === 'party_g6_instances').map((row) => [row.id, row.record]));
  const positions = scene.rows.filter((row) => row.target_table === 'scene_position_nodes')
    .map((row) => ({ id: row.id, ...row.record }))
    .filter((position) => policy.position_slot_order.includes(position.template_slot_key));
  if (!g6.size || !positions.length) gap('NPC_COMPOSITION_POSITION_GAP');
  const eligible = [];
  const emptyRules = [];
  for (const position of positions) {
    const host = g6.get(position.g6_instance_id);
    if (!host || host.status !== 'active' || host.party_id !== scene.party_id
      || position.party_id !== scene.party_id || position.status !== 'active'
      || !Number.isSafeInteger(position.capacity) || position.capacity < 1) gap('NPC_COMPOSITION_POSITION_GAP');
    if (policy.allowed_physical_class_ids.includes(host.physical_class_id)) {
      eligible.push(position);
    } else {
      const matches = policy.empty_context_rules.filter((rule) => rule.physical_class_id === host.physical_class_id
        && rule.condition === 'no_existing_carrier_supported_position' && rule.count === 0 && rule.carrier_creation === 'forbidden');
      if (matches.length !== 1 || host.host_kind !== 'g5_site') gap('NPC_COMPOSITION_PLACEMENT_CONTEXT_GAP');
      emptyRules.push(matches[0]);
    }
  }
  eligible.sort((a, b) => policy.position_slot_order.indexOf(a.template_slot_key)
    - policy.position_slot_order.indexOf(b.template_slot_key) || a.id.localeCompare(b.id));
  return { positions: eligible, empty_rule: eligible.length ? null : emptyRules[0] };
}
function key(ref) { return `${ref?.id}@${ref?.version}`; }
function approvedIndex(rows, world) {
  if (!Array.isArray(rows)) gap('NPC_COMPOSITION_DEPENDENCY_GAP');
  const map = new Map();
  for (const row of rows) {
    if (!text(row.id) || !Number.isSafeInteger(row.version) || row.version < 1
      || row.status !== 'approved' || row.world_revision_id !== world || !row.payload
      || !text(row.canonical_digest) || map.has(key(row))) gap('NPC_COMPOSITION_DEPENDENCY_GAP');
    map.set(key(row), row);
  }
  return map;
}
function resolve(rows, ref, kind) {
  const row = rows.get(key(ref));
  if (!row || !same(row, ref) || (kind && row.profile_kind !== kind)) gap('NPC_COMPOSITION_EXACT_REF_GAP');
  return row;
}
function validateWeights(entries) {
  if (entries.some((entry) => !Number.isSafeInteger(entry.weight) || entry.weight < 0)
    || !Number.isSafeInteger(entries.reduce((sum, entry) => sum + entry.weight, 0))
    || entries.reduce((sum, entry) => sum + entry.weight, 0) <= 0) gap('NPC_COMPOSITION_WEIGHT_GAP');
}
function weighted(entries, draw) {
  let remaining = draw % entries.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of entries) { if (remaining < entry.weight) return entry; remaining -= entry.weight; }
  gap('NPC_COMPOSITION_WEIGHT_GAP');
}
function applicable(profile, closure) {
  return Array.isArray(profile.applicability) && profile.applicability.some((entry) =>
    same(entry.g4_ref, closure.g4_ref) && (closure.canonical_g5_ref
      ? entry.generation_template_ref == null && same(entry.canonical_g5_ref, closure.canonical_g5_ref)
      : entry.canonical_g5_ref == null && same(entry.generation_template_ref, closure.generation_template_ref)));
}
