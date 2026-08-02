import { carrierInventorySnapshot } from
  '../../../runtime/lower-dvina-trace-phase-6-carry-inventory.js';

export function phase6TargetedAdmissionEvidence({ state, intent }) {
  const activeCarrierIds = [...new Set(
    intent.inventory_admission_checkpoints.flatMap(
      ({ active_carrier_ids: ids }) => ids
    )
  )].sort();
  const snapshots = intent.carrier_inventory_snapshots.filter(
    ({ actor_id: id }) => activeCarrierIds.includes(id)
  );
  if (snapshots.length !== activeCarrierIds.length) {
    throw Object.assign(new Error('TRACE_PHASE_6_ADMISSION_PROOF_INVALID'), {
      code: 'TRACE_PHASE_6_ADMISSION_PROOF_INVALID'
    });
  }
  return {
    physical_model: 'trace_phase6_targeted_admission',
    source_anchor_id: state.position.g5_anchor_id,
    execution_id: intent.execution_id,
    resume: intent.resume,
    participant_bindings: structuredClone(intent.participant_bindings),
    assembly_resources: structuredClone(intent.assembly_snapshot.resources),
    active_carrier_snapshots: structuredClone(snapshots),
    player_strength: state.player_profile.attributes.strength.value
  };
}

export async function recheckPhase6TargetedAdmission({ transaction, partyId,
  check }) {
  if (!valid(check)) return result(false, 'generated_schema_mismatch');
  const participantResult = await recheckParticipants(
    transaction, partyId, check
  );
  if (!participantResult) return result(false);
  const assemblyResult = await recheckAssembly(transaction, partyId, check);
  if (!assemblyResult) return result(false);
  return result(await recheckCarriers(transaction, partyId, check));
}

async function recheckParticipants(transaction, partyId, check) {
  const binding = check.participant_bindings;
  const npcIds = [...binding.initial_carrier_ids.slice(1),
    binding.replacement_carrier_id, binding.carried_actor_id].sort();
  const [position, npcs, persisted] = await sequential(transaction, [
    [`SELECT g5_anchor_id FROM party_runtime.party_positions
       WHERE party_id=$1 FOR UPDATE`, [partyId]],
    [`SELECT npc_id,anchor_id FROM party_runtime.party_npcs
       WHERE party_id=$1 AND npc_id=ANY($2::text[])
       ORDER BY npc_id FOR UPDATE`, [partyId, npcIds]],
    [`SELECT participant_kind,participant_id,role_id
       FROM party_runtime.party_activity_participant_bindings
       WHERE activity_execution_id=$1
       ORDER BY participant_kind,participant_id FOR UPDATE`,
      [check.execution_id]]
  ]);
  if (position.rowCount !== 1
      || position.rows[0].g5_anchor_id !== check.source_anchor_id
      || npcs.rowCount !== npcIds.length
      || npcs.rows.some(({ anchor_id: id }) => id !== check.source_anchor_id)) {
    return false;
  }
  const expected = participantRows(binding);
  return check.resume
    ? sameRows(persisted.rows, expected)
    : persisted.rowCount === 0;
}

async function recheckAssembly(transaction, partyId, check) {
  const ids = check.assembly_resources.map(({ item_id: id }) => id).sort();
  const [items, ownership] = await sequential(transaction, [
    [`SELECT i.item_id,i.template_id,i.condition_state,
            i.state->>'accessibility' AS accessibility,
            i.state->>'use_state' AS use_state,
            p.holder_npc_id,p.physical_position
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id=ANY($2::text[])
      ORDER BY i.item_id FOR UPDATE OF i,p`, [partyId, ids]],
    [`SELECT item_id,owner_npc_id,controller_npc_id
       FROM party_runtime.party_ownership
      WHERE party_id=$1 AND item_id=ANY($2::text[])
      ORDER BY item_id FOR UPDATE`, [partyId, ids]]
  ]);
  if (items.rowCount !== ids.length || ownership.rowCount !== ids.length) {
    return false;
  }
  const ownerById = new Map(ownership.rows.map((row) => [row.item_id, row]));
  const actual = items.rows.map((row) => ({
    item_id: row.item_id,
    item_template_ref: row.template_id,
    condition_state: row.condition_state,
    holder_npc_id: row.holder_npc_id,
    physical_position: row.physical_position,
    owner_npc_id: ownerById.get(row.item_id)?.owner_npc_id ?? null,
    controller_npc_id:
      ownerById.get(row.item_id)?.controller_npc_id ?? null,
    accessibility: row.accessibility,
    use_state: row.use_state
  }));
  return sameRows(actual, [...check.assembly_resources].sort(byItemId));
}

async function recheckCarriers(transaction, partyId, check) {
  const actorIds = check.active_carrier_snapshots.map(
    ({ actor_id: id }) => id
  );
  const playerId = check.participant_bindings.player_actor_id;
  const npcIds = actorIds.filter((id) => id !== playerId);
  const expectedItemIds = [...new Set(check.active_carrier_snapshots.flatMap(
    ({ item_ids: ids }) => ids
  ))];
  const expectedContainerIds = [...new Set(
    check.active_carrier_snapshots.flatMap(({ container_ids: ids }) => ids)
  )];
  const [items, containers] = await sequential(transaction, [
    [`SELECT i.item_id,i.template_id,i.quantity,i.state,
            p.anchor_id,p.container_id,p.holder_npc_id,
            p.holder_character_id,p.physical_position,
            p.equipment_slot_category_id
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND (p.holder_npc_id=ANY($2::text[])
         OR p.holder_character_id=$3 OR i.item_id=ANY($4::text[])
         OR p.container_id=ANY($5::text[]))
      ORDER BY i.item_id FOR UPDATE OF i,p`,
      [partyId, npcIds, playerId, expectedItemIds, expectedContainerIds]],
    [`SELECT container_id,template_id,anchor_id,parent_container_id,
            holder_npc_id,holder_character_id,physical_position,
            equipment_slot_category_id,state
       FROM party_runtime.party_containers
      WHERE party_id=$1 AND (holder_npc_id=ANY($2::text[])
         OR holder_character_id=$3 OR container_id=ANY($4::text[]))
      ORDER BY container_id FOR UPDATE`,
      [partyId, npcIds, playerId, expectedContainerIds]]
  ]);
  const state = committedInventoryState({ partyId, playerId, check,
    items: items.rows, containers: containers.rows });
  const excluded = new Set(
    check.assembly_resources.map(({ item_id: id }) => id)
  );
  return check.active_carrier_snapshots.every((expected) => {
    try {
      const actual = carrierInventorySnapshot({ state,
        actorId: expected.actor_id, excludedAssemblyItemIds: excluded });
      return actual.canonical_digest === expected.canonical_digest;
    } catch {
      return false;
    }
  });
}

function committedInventoryState({ partyId, playerId, check, items,
  containers }) {
  return {
    party_id: partyId,
    actor_id: playerId,
    party_state: { state_version: 0 },
    position: { g5_anchor_id: check.source_anchor_id },
    player_profile: { attributes: { strength: {
      value: check.player_strength
    } } },
    items: items.map((row) => ({
      item_id: row.item_id, template_id: row.template_id,
      quantity: Number(row.quantity), state: row.state,
      placement: placement(row)
    })),
    containers: containers.map((row) => ({
      container_id: row.container_id, template_id: row.template_id,
      state: row.state
    })),
    container_placements: containers.map((row) => ({
      container_id: row.container_id, parent_container_id:
        row.parent_container_id, ...placement(row)
    })),
    container_profiles: containers.map((row) => ({
      ...(row.state?.inventory_profile_snapshot ?? {}),
      template_id: row.template_id
    }))
  };
}

function participantRows(binding) {
  return [
    ['player_character', binding.player_actor_id, 'player_clerk'],
    ['npc', binding.initial_carrier_ids[1], 'eremey_fisher'],
    ['npc', binding.initial_carrier_ids[2], 'ratsha_storehouse_helper'],
    ['npc', binding.replacement_carrier_id,
      'resolved_participating_fisher'],
    ['npc', binding.carried_actor_id, 'onisim_boatman']
  ].map(([participant_kind, participant_id, role_id]) => ({
    participant_kind, participant_id, role_id
  })).sort((left, right) => left.participant_kind.localeCompare(
    right.participant_kind) || left.participant_id.localeCompare(
    right.participant_id));
}

function placement(row) {
  return { anchor_id: row.anchor_id, container_id: row.container_id,
    holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id };
}
async function sequential(transaction, inputs) {
  const results = [];
  for (const [sql, values] of inputs) {
    results.push(await transaction.query(sql, values));
  }
  return results;
}
function sameRows(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function byItemId(left, right) {
  return left.item_id.localeCompare(right.item_id);
}
function valid(check) {
  return check?.physical_model === 'trace_phase6_targeted_admission'
    && check.participant_bindings?.source_anchor_id
      === check.source_anchor_id
    && Array.isArray(check.assembly_resources)
    && check.assembly_resources.length === 2
    && Array.isArray(check.active_carrier_snapshots)
    && check.active_carrier_snapshots.length > 0;
}
function result(ok, code = 'state_version_conflict') {
  return Object.freeze({ ok, code });
}
