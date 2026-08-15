import {
  TRANSPORT_CONTRACT, hash, json, ref, versionedTextRef
} from '../../../runtime/first-playable/shared.js';

export async function insertBoatAndInventory(tx, { state, changeSet, runId, landingPosition }) {
  const partyId = state.party_id;
  const playerRef = ref('actor', state.player.id);
  const boatId = state.boat.id;
  await tx.query(
    `INSERT INTO party_runtime.party_transports
     (party_id,transport_id,transport_category_ref,transport_template_ref,
      applicability_snapshot,capacity_policy_ref,movement_capability_refs,
      control_requirement_ref,route_applicability_ref,transport_contract_digest,
      state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,
       $8::jsonb,$9::jsonb,$10,1,$11,$11)`,
    [partyId, boatId, json(versionedTextRef(
      'transport_category',
      TRANSPORT_CONTRACT.transport_category_ref
    )),
      json(versionedTextRef(
        'transport_template',
        TRANSPORT_CONTRACT.transport_template_ref
      )),
      json({ season: 'late_summer_open_water' }),
      json(TRANSPORT_CONTRACT.capacity_policy),
      json(TRANSPORT_CONTRACT.movement_capability_refs.map((value) =>
        versionedTextRef('movement_capability', value))),
      json(TRANSPORT_CONTRACT.control_requirements),
      json({ scopes: TRANSPORT_CONTRACT.route_applicability }),
      hash(TRANSPORT_CONTRACT.transport_contract_id), changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_journey_locations
     (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
      state_version,updated_change_set_id)
     VALUES ($1,$2,'transport',$3,'scene',$4,1,$5)`,
    [`location:${partyId}:boat`, partyId, boatId, landingPosition, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.entity_placements
     (party_id,entity_kind,entity_id,placement_kind,position_node_id,
      occupies_capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'transport',$2,'moored_at_position',$3,2,1,$4)`,
    [partyId, boatId, landingPosition, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_entity_controls
     (party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
      access_profile_ref,capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'transport',$2,$3::jsonb,$3::jsonb,$3::jsonb,$4::jsonb,2,1,$5)`,
    [partyId, boatId, json(playerRef), json(ref('access_profile', 'owner_direct')), changeSet]
  );
  for (const allocation of
    state.player.equipment_profile.initial_item_allocations) {
    const id = `item:${partyId}:${allocation.slot_id}`;
    await tx.query(
      `INSERT INTO party_runtime.party_items
       (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
        condition_state,legal_status,state)
       VALUES ($1,$2,$3,$4,'first_playable',$5,$6,'serviceable','owned',$7::jsonb)`,
      [
        partyId,
        id,
        runId,
        allocation.template_id,
        allocation.category_id,
        allocation.resolved_quantity.quantity,
        json(allocation.visual_profile_snapshot == null ? {} : {
          visual_profile_snapshot: allocation.visual_profile_snapshot
        })
      ]
    );
    await tx.query(
      `INSERT INTO party_runtime.entity_placements
       (party_id,entity_kind,entity_id,placement_kind,host_entity_ref,
        occupies_capacity_units,state_version,updated_change_set_id)
       VALUES ($1,'item',$2,'attached_to_entity',$3::jsonb,1,1,$4)`,
      [partyId, id, json(playerRef), changeSet]
    );
    const physicalPosition = allocation.physical_position ?? 'external';
    await tx.query(
      `INSERT INTO party_runtime.party_item_placements
       (party_id,item_id,holder_character_id,physical_position,
        equipment_slot_category_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [partyId, id, state.player.id, physicalPosition,
        allocation.equipment_slot_category_id ?? null]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_ownership
       (party_id,ownership_id,item_id,owner_character_id,
        controller_character_id,claim_state)
       VALUES ($1,$2,$3,$4,$4,'established')`,
      [partyId, `ownership:${id}`, id, state.player.id]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_entity_controls
       (party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
        access_profile_ref,capacity_units,state_version,updated_change_set_id)
       VALUES ($1,'item',$2,$3::jsonb,$3::jsonb,$3::jsonb,$4::jsonb,1,1,$5)`,
      [partyId, id, json(playerRef), json(ref('access_profile', 'owner_direct')), changeSet]
    );
  }
  for (const allocation of
    state.player.equipment_profile.initial_container_allocations) {
    const id = `container:${partyId}:${allocation.slot_id}`;
    await tx.query(
      `INSERT INTO party_runtime.party_containers
       (party_id,container_id,run_id,template_id,holder_character_id,
        physical_position,condition_state,closure_state,state)
       VALUES ($1,$2,$3,$4,$5,'external','serviceable','open','{}'::jsonb)`,
      [partyId, id, runId, allocation.template_id, state.player.id]
    );
    await tx.query(
      `INSERT INTO party_runtime.entity_placements
       (party_id,entity_kind,entity_id,placement_kind,host_entity_ref,
        occupies_capacity_units,state_version,updated_change_set_id)
       VALUES ($1,'container',$2,'attached_to_entity',$3::jsonb,1,1,$4)`,
      [partyId, id, json(playerRef), changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_entity_controls
       (party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
        access_profile_ref,capacity_units,state_version,updated_change_set_id)
       VALUES ($1,'container',$2,$3::jsonb,$3::jsonb,$3::jsonb,$4::jsonb,1,1,$5)`,
      [partyId, id, json(playerRef), json(ref('access_profile', 'owner_direct')), changeSet]
    );
  }
}
