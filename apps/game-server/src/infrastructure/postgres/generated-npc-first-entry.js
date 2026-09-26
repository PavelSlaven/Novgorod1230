import { materializeApprovedProceduralNpc, materializeApprovedActorEquipment } from '@rus/materialization';
import { createNpcRoutineState, npcRoutineActivity } from '@rus/npc-runtime';
import { approvedNpcBodyRows, approvedNpcConditionRows, initialNpcRoutineRecords } from '@rus/new-game/stages/stage-24';

/** Compose existing actor, Stage 16 and Stage 24 owners into one P16 proposal. */
export function prepareGeneratedNpcFirstEntry({ party_id: partyId, run_id: runId,
  change_set_id: changeSetId, world_revision_id: worldRevisionId, g4_ref: g4,
  generation_template_ref: template, canonical_g5_ref: canonical,
  scene, npc_inputs: inputs, equipment_catalog: equipment,
  started_at: startedAt, calendar_profile: calendarProfile } = {}) {
  if (![partyId, runId, changeSetId, worldRevisionId, scene?.site_id].every(text)
      || scene.party_id !== partyId || !Array.isArray(scene.rows)
      || !Array.isArray(inputs) || inputs.length === 0) gap('NPC_FIRST_ENTRY_INPUT_GAP');
  const positions = new Map(scene.rows.filter((row) => row.target_table === 'scene_position_nodes')
    .map(({ id, record }) => [id, record]));
  const slots = new Set();
  const counts = new Map();
  const results = inputs.map((input) => {
    const { binding, position_id: positionId } = input;
    const position = positions.get(positionId);
    if (!position || position.party_id !== partyId || position.status !== 'active'
      || binding?.world_revision_id !== worldRevisionId
      || binding.g5_node_id !== scene.site_id || binding.anchor_id !== positionId
      || !same(binding.g4_ref, g4) || binding.g4_ref.world_revision_id !== worldRevisionId
      || Boolean(canonical) === Boolean(template)
      || (canonical ? binding.generation_template_ref != null || !same(binding.canonical_g5_ref, canonical)
        : binding.canonical_g5_ref != null || !same(binding.generation_template_ref, template))
      || slots.has(binding.actor_slot_ref)) gap('NPC_FIRST_ENTRY_SCOPE_GAP');
    if (!binding.regional_context_ref) gap('NPC_FIRST_ENTRY_REGIONAL_CONTEXT_GAP');
    if (!binding.clothing_profile_ref) gap('NPC_FIRST_ENTRY_CLOTHING_GAP');
    slots.add(binding.actor_slot_ref);
    counts.set(positionId, (counts.get(positionId) ?? 0) + 1);
    if (counts.get(positionId) > position.capacity) gap('NPC_FIRST_ENTRY_CAPACITY_GAP');
    const result = materializeApprovedProceduralNpc({ ...input, party_id: partyId, run_id: runId });
    const npc = structuredClone(result.npc);
    npc.position_id = positionId;
    npc.routine_state = createNpcRoutineState({ profile: input.routine_profile,
      calendar_profile: calendarProfile, started_at: startedAt,
      current_activity: npc.machine_state.current_activity });
    npc.machine_state.current_activity = npcRoutineActivity(npc.routine_state);
    npc.machine_state.current_activity_ref = npc.machine_state.current_activity.activity_ref;
    npc.machine_state.runtime_status = npc.routine_state.runtime_status;
    npc.machine_state.schedule_state = npc.routine_state.profile.phases[npc.routine_state.phase_index].state_id;
    return { ...result, npc };
  });
  const npcs = results.map(({ npc }) => npc);
  const candidates = results.flatMap((result) => result.initial_equipment_candidates);
  if (!candidates.length || equipment?.activation?.status !== 'active') gap('NPC_FIRST_ENTRY_EQUIPMENT_GAP');
  const equipmentResult = materializeApprovedActorEquipment({ party_id: partyId, run_id: runId,
    request_id: changeSetId, world_revision_id: worldRevisionId, g4_id: g4.id,
    actor_candidate_instance_map: results.flatMap((result) => result.actor_candidate_instance_map),
    initial_equipment_candidates: candidates, catalog_digest: equipment.catalog_digest,
    item_templates: equipment.item_templates, item_inventory_profiles: equipment.item_inventory_profiles,
    item_visual_profiles: equipment.item_visual_profiles });
  const items = equipmentResult.item_instances;
  const row = (target_table, id, record) => ({ target_table, id,
    record: { party_id: partyId, ...record } });
  const versioned = { state_version: 1, updated_change_set_id: changeSetId };
  const inserts = npcs.flatMap((npc) => [
    row('party_npcs', npc.instance_id, { npc_id: npc.instance_id, run_id: runId,
      profile_set_id: npc.profile_id, profile_level: npc.profile_level,
      identity_state: npc.identity_state, machine_state: npc.machine_state,
      semantic_state: npc.semantic_state }),
    row('party_actor_profile_bindings', `npc:${npc.instance_id}`, {
      actor_kind: 'npc', actor_id: npc.instance_id, role_ref: npc.role_ref,
      occupation_ref: npc.occupation_ref, skill_profile_snapshot: npc.skill_profile_snapshot,
      name_profile_snapshot: {}, language_profile_snapshot:
        npc.semantic_state.regional_context?.language_status === 'authored'
          ? { repertoire: npc.semantic_state.regional_context.language_repertoire } : {},
      knowledge_profile_snapshot: npc.knowledge_profile_snapshot,
      attribute_profile_snapshot: npc.base_attributes,
      profile_candidate_set_digest: npc.profile_candidate_set_digest,
      created_change_set_id: changeSetId, ...versioned }),
    row('entity_placements', `npc:${npc.instance_id}`, {
      entity_kind: 'npc', entity_id: npc.instance_id, placement_kind: 'scene_position',
      position_node_id: npc.position_id, occupies_capacity_units: 1, ...versioned })
  ]);
  for (const body of approvedNpcBodyRows(npcs, partyId, changeSetId)) {
    inserts.push(row('party_actor_body_states', `npc:${body.actor_id}`, body));
  }
  for (const condition of approvedNpcConditionRows(npcs, partyId, changeSetId)) {
    inserts.push(row('party_actor_active_conditions', `npc:${condition.actor_id}:${condition.condition_id}`, condition));
  }
  for (const schedule of initialNpcRoutineRecords({ result: {}, partyId, changeSetId, npcs })) {
    inserts.push(row('party_npc_spatial_schedules', schedule.id, schedule));
  }
  for (const item of items) {
    const npcRef = { entity_kind: 'npc', entity_id: item.holder_npc_id };
    inserts.push(row('party_items', item.instance_id, { item_id: item.instance_id,
      run_id: runId, template_id: item.template_id, profile_id: item.profile_id,
      category_id: item.category_id, quantity: item.quantity,
      condition_state: item.condition_state, legal_status: item.legal_status, state: item.state }),
    row('party_item_placements', item.instance_id, { item_id: item.instance_id,
      holder_npc_id: item.holder_npc_id, physical_position: item.physical_position,
      equipment_slot_category_id: item.equipment_slot_category_id ?? null }),
    row('party_ownership', `ownership:${item.instance_id}`, { ownership_id: `ownership:${item.instance_id}`,
      item_id: item.instance_id, owner_npc_id: item.owner_npc_id,
      controller_npc_id: item.controller_npc_id, claim_state: item.claim_state }),
    row('entity_placements', `item:${item.instance_id}`, { entity_kind: 'item', entity_id: item.instance_id,
      placement_kind: 'attached_to_entity', host_entity_ref: npcRef,
      occupies_capacity_units: 1, ...versioned }),
    row('party_entity_controls', `item:${item.instance_id}`, { entity_kind: 'item', entity_id: item.instance_id,
      owner_ref: npcRef, holder_ref: npcRef, controller_ref: npcRef,
      access_profile_ref: { entity_kind: 'access_profile', entity_id: 'owner_direct' },
      capacity_units: 1, ...versioned }));
  }
  return Object.freeze({ write_set: { inserts, updates: [], appends: [], deletes: [] },
    validation_report: { pass: true, domain: 'npc', created_count: npcs.length,
      equipment_count: items.length }, choices: [...results.flatMap((result) => result.choices),
      ...equipmentResult.materialization_run.choices],
    attribute_traces: results.map((result) => result.attribute_trace) });
}

function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function same(left, right) { return text(left?.id) && left.id === right?.id
  && Number.isSafeInteger(left.version) && left.version > 0 && left.version === right.version; }
function gap(code) { throw Object.assign(new Error(code), { code }); }
