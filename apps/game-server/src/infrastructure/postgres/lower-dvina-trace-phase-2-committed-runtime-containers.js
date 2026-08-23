export async function withCommittedRuntimeContainers(pool, partyId, state) {
  const result = await pool.query(
    `SELECT container_id,run_id,template_id,condition_state,closure_state,
            state,state_version,updated_change_set_id,anchor_id,
            parent_container_id,holder_npc_id,holder_character_id,
            physical_position,equipment_slot_category_id
       FROM party_runtime.party_containers
      WHERE party_id=$1
      ORDER BY container_id`,
    [partyId]
  );
  const containers = new Map((state.containers ?? []).map((container) => [
    container.container_id, structuredClone(container)
  ]));
  const placements = new Map((state.container_placements ?? []).map((placement) => [
    placement.container_id, structuredClone(placement)
  ]));
  const containerProfiles = structuredClone(state.container_profiles ?? []);
  const containerProfileTemplateIds = new Set(
    profileEntries(containerProfiles).map(({ template_id: id }) => id)
  );
  for (const row of result.rows) {
    containers.set(row.container_id, {
      ...containers.get(row.container_id),
      container_id: row.container_id, run_id: row.run_id,
      template_id: row.template_id, condition_state: row.condition_state,
      closure_state: row.closure_state, state: structuredClone(row.state),
      state_version: Number(row.state_version),
      updated_change_set_id: row.updated_change_set_id,
      anchor_id: row.anchor_id, parent_container_id: row.parent_container_id,
      holder_npc_id: row.holder_npc_id,
      holder_character_id: row.holder_character_id,
      physical_position: row.physical_position,
      equipment_slot_category_id: row.equipment_slot_category_id
    });
    placements.set(row.container_id, {
      party_id: partyId, container_id: row.container_id,
      anchor_id: row.anchor_id, parent_container_id: row.parent_container_id,
      holder_npc_id: row.holder_npc_id,
      holder_character_id: row.holder_character_id,
      physical_position: row.physical_position,
      equipment_slot_category_id: row.equipment_slot_category_id
    });
    const profile = committedContainerProfile(row);
    if (profile && !containerProfileTemplateIds.has(row.template_id)) {
      containerProfileTemplateIds.add(row.template_id);
      addProfile(containerProfiles, row.template_id, profile);
    }
  }
  return {
    ...state,
    containers: [...containers.values()].sort(byContainerId),
    container_placements: [...placements.values()].sort(byContainerId),
    container_profiles: containerProfiles
  };
}

function committedContainerProfile(row) {
  const context = row.state?.ordinary_contents_context;
  const profile = row.state?.inventory_profile_snapshot
    ?? context?.container_inventory_profile;
  if (!profile) return null;
  return {
    ...structuredClone(profile),
    ...(profile.external_hand_cost == null
        && context?.mechanics_policy?.max_external_hand_cost === 0
      ? { external_hand_cost: 0 } : {}),
    template_id: row.template_id
  };
}

function profileEntries(value) {
  return Array.isArray(value) ? value : Object.entries(value ?? {}).map(
    ([template_id, profile]) => ({ ...profile, template_id })
  );
}

function addProfile(collection, templateId, profile) {
  if (Array.isArray(collection)) collection.push(profile);
  else collection[templateId] = profile;
}

function byContainerId(left, right) {
  return left.container_id.localeCompare(right.container_id);
}
