import {
  createOrdinaryWorldRuntimeInstanceMechanicsSnapshot
} from '@rus/items-property';
import { ordinaryArmamentWeaponDanger } from '@rus/combat-health';

export function buildOrdinaryMaterializedRuntimeItem({ partyId, item }) {
  const snapshot = createOrdinaryWorldRuntimeInstanceMechanicsSnapshot(
    item.mechanics_snapshot);
  const scenePositionId = item.runtime_placement?.scene_position_id;
  const semanticType = item.item_proposal?.semantic_descriptor?.semantic_type;
  const name = item.item_proposal?.semantic_descriptor?.name;
  const ownership = ordinaryWorldOwnership(item);
  if (![partyId, item.item_id, scenePositionId, semanticType, name]
    .every(exactText)) {
    throw code('ORDINARY_RUNTIME_ITEM_PROJECTION_INVALID');
  }
  const weaponMechanics = item.weapon_mechanics_snapshot == null ? null
    : ordinaryArmamentWeaponDanger(item.weapon_mechanics_snapshot) == null
      || item.weapon_mechanics_snapshot.condition_state !== item.condition_state
      ? invalid() : structuredClone(item.weapon_mechanics_snapshot);
  const state = {
    lifecycle_status: 'active',
    ...(item.condition_state == null ? {}
      : { condition_state: item.condition_state }),
    runtime_instance_mechanics_snapshot: structuredClone(snapshot),
    ...(weaponMechanics == null ? {}
      : { weapon_mechanics_snapshot: weaponMechanics }),
    ordinary_metadata: {
      semantic_type: semanticType,
      name,
      origin: {
        kind: 'ordinary_world_materialization',
        source_refs: [...snapshot.provenance.source_refs]
      },
      semantic_facts: [],
      operation_history: []
    },
    semantic_category: semanticType,
    property_state: {
      property_basis_ref: item.property_basis_ref,
      property_placement_evidence: structuredClone(
        item.item_proposal.property_placement_evidence)
    },
    causal_basis: item.supporting_basis_ref
  };
  const placement = {
    anchor_id: null,
    scene_position_id: scenePositionId,
    container_id: null,
    holder_npc_id: null,
    holder_character_id: null,
    physical_position: null,
    equipment_slot_category_id: null,
    attached_item_id: null
  };
  return Object.freeze({
    snapshot_item: Object.freeze({
      item_id: item.item_id,
      template_id: null,
      name,
      quantity: 1,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'ordinary_world_property_bound',
      visible: true,
      placement: structuredClone(placement),
      runtime_instance_mechanics_snapshot: structuredClone(snapshot),
      ...(weaponMechanics == null ? {}
        : { weapon_mechanics_snapshot: structuredClone(weaponMechanics) }),
      state: structuredClone(state)
    }),
    item_record: Object.freeze({
      party_id: partyId,
      item_id: item.item_id,
      run_id: null,
      template_id: null,
      profile_id: null,
      category_id: null,
      quantity: 1,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'ordinary_world_property_bound',
      state: structuredClone(state)
    }),
    placement_record: Object.freeze({
      party_id: partyId,
      item_id: item.item_id,
      ...structuredClone(placement)
    }),
    ownership_record: Object.freeze({
      party_id: partyId,
      ownership_id: `ownership:${item.item_id}`,
      item_id: item.item_id,
      ...structuredClone(ownership)
    })
  });
}

export async function insertOrdinaryMaterializedRuntimeItem({
  client, partyId, item
}) {
  const runtime = buildOrdinaryMaterializedRuntimeItem({ partyId, item });
  const record = runtime.item_record;
  await client.query(
    `INSERT INTO party_runtime.party_items
     (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
      condition_state,legal_status,state)
     VALUES ($1,$2,NULL,NULL,NULL,NULL,$3,$4,$5,$6::jsonb)`,
    [record.party_id, record.item_id, record.quantity,
      record.condition_state, record.legal_status, JSON.stringify(record.state)]
  );
  const placement = runtime.placement_record;
  await client.query(
    `INSERT INTO party_runtime.party_item_placements
     (party_id,item_id,anchor_id,scene_position_id,container_id,holder_npc_id,
      holder_character_id,physical_position,equipment_slot_category_id,
      attached_item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [placement.party_id, placement.item_id, placement.anchor_id,
      placement.scene_position_id, placement.container_id,
      placement.holder_npc_id,
      placement.holder_character_id, placement.physical_position,
      placement.equipment_slot_category_id, placement.attached_item_id]
  );
  const ownership = runtime.ownership_record;
  await client.query(
    `INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,container_id,owner_npc_id,
       owner_character_id,owner_party,owner_external_ref,controller_npc_id,
       controller_character_id,claim_state)
     VALUES ($1,$2,$3,NULL,NULL,NULL,false,$4::jsonb,NULL,NULL,$5)`,
    [ownership.party_id, ownership.ownership_id, ownership.item_id,
      JSON.stringify(ownership.owner_external_ref), ownership.claim_state]
  );
  return runtime;
}

function ordinaryWorldOwnership(item) {
  const evidence = item.item_proposal?.property_placement_evidence;
  const unowned = evidence?.property_basis_class === 'genuinely_unowned';
  const entityId = unowned
    ? evidence?.unowned_cause_ref : evidence?.property_source_ref;
  if (!exactText(entityId)) {
    throw code('ORDINARY_RUNTIME_ITEM_PROJECTION_INVALID');
  }
  return {
    owner_npc_id: null,
    owner_character_id: null,
    owner_party: false,
    owner_external_ref: {
      entity_kind: unowned
        ? 'ordinary_unowned_cause' : 'ordinary_property_source',
      entity_id: entityId
    },
    controller_npc_id: null,
    controller_character_id: null,
    claim_state: unowned ? 'unowned' : 'property_bound'
  };
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function code(value) { return Object.assign(new TypeError(value), {
  code: value
}); }
function invalid() { throw code('ORDINARY_RUNTIME_ITEM_PROJECTION_INVALID'); }
