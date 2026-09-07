import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';
import {
  actionProducedAccessState,
  actionProducedControllerPermitted,
  actionProducedControllerRef,
  actionProducedPlacementAccessible
} from './action-produced-contained-access.js';

export function createActionProducedCommittedRowPin({
  row, role, actorRef, finite, accessAnchorId, accessScenePositionId,
  accessContainer = null, preparedOrdinary = null, preparedAction = null
}) {
  const placement = actionProducedPlacementFromRow(row);
  const accessPlacement = { ...row,
    scene_position_id: placement.scene_position_id ?? null };
  if (!row || !text(row.item_id)
      || !Number.isSafeInteger(Number(row.state_version))
      || Number(row.state_version) < 1
      || preparedOrdinary === null && preparedAction === null
        && !actionProducedPlacementAccessible(accessPlacement,
        accessContainer, actorRef,
        accessAnchorId, accessScenePositionId)
      || row.scene_position_id != null && (!text(accessScenePositionId)
        || row.scene_position_id !== accessScenePositionId)
      || row.item_scene_position_id != null && (!text(accessScenePositionId)
        || row.item_scene_position_id !== accessScenePositionId)
      || !validOwnership(row)
      || !actionProducedControllerPermitted(row, role, actorRef)
      || row.state?.lifecycle_status != null
        && row.state.lifecycle_status !== 'active'
      || finite != null && (
        finite.persisted_row.position_node_id
          !== row.state?.resource_position_node_id
        || finite.persisted_row.property_basis_ref
          !== row.state?.property_state?.resource_property_basis_ref)) {
    fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
  }
  const access = preparedOrdinary === null && preparedAction === null
    ? actionProducedAccessState(accessPlacement, accessContainer, actorRef,
      accessAnchorId, accessScenePositionId)
    : 'quick';
  const holderRef = [row.holder_character_id, row.holder_npc_id]
    .includes(actorRef) ? actorRef : null;
  const item = {
    item_id: row.item_id, run_id: row.run_id, template_id: row.template_id,
    profile_id: row.profile_id, category_id: row.category_id,
    quantity: Number(row.quantity), condition_state: row.condition_state,
    legal_status: row.legal_status, state: row.state,
    state_version: Number(row.state_version)
  };
  const ownership = {
    ownership_id: row.ownership_id,
    owner_npc_id: row.owner_npc_id,
    owner_character_id: row.owner_character_id,
    owner_party: row.owner_party,
    ...(row.owner_external_ref == null ? {} : {
      owner_external_ref: row.owner_external_ref
    }),
    controller_npc_id: row.controller_npc_id,
    controller_character_id: row.controller_character_id,
    claim_state: row.claim_state
  };
  return {
    role, item_id: row.item_id, item, placement, ownership,
    ...(row.scene_position_id == null ? {} : {
      scene_placement: {
        position_node_id: row.scene_position_id,
        occupies_capacity_units: Number(row.scene_occupies_capacity_units),
        state_version: Number(row.scene_state_version)
      }
    }),
    entity_snapshot: createActionProducedCommittedEntitySnapshot({ role,
      itemId: row.item_id, stateVersion: row.state_version,
      accessState: access, holderRef, ownership,
      finiteResource: finite?.snapshot ?? null }),
    finite_resource_row: finite?.persisted_row ?? null,
    ...(accessContainer === null ? {} : {
      access_container: structuredClone(accessContainer)
    }),
    ...(preparedOrdinary === null ? {} : {
      prepared_ordinary: preparedOrdinary
    }),
    ...(preparedAction === null ? {} : { prepared_action: preparedAction })
  };
}

export function actionProducedPlacementFromRow(row) {
  const scenePositionId = row?.item_scene_position_id
    ?? row?.scene_position_id;
  return {
    anchor_id: row?.anchor_id,
    ...(scenePositionId == null ? {} : {
      scene_position_id: scenePositionId
    }),
    container_id: row?.container_id,
    holder_npc_id: row?.holder_npc_id,
    holder_character_id: row?.holder_character_id,
    physical_position: row?.physical_position,
    equipment_slot_category_id: row?.equipment_slot_category_id,
    attached_item_id: row?.attached_item_id
  };
}

export function createActionProducedCommittedEntitySnapshot({ role, itemId,
  stateVersion, accessState, holderRef, ownership, finiteResource }) {
  return {
    schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role, entity_ref: itemId,
    state_version: String(stateVersion), lifecycle_state: 'active',
    access_state: accessState, holder_ref: holderRef,
    controller_ref: actionProducedControllerRef(ownership),
    ownership_snapshot: structuredClone(ownership), finite_resource: finiteResource
  };
}

function validOwnership(row) {
  const owners = Number(text(row.owner_character_id))
    + Number(text(row.owner_npc_id)) + Number(row.owner_party === true)
    + Number(validExternalOwner(row.owner_external_ref));
  return owners === 1 && typeof row.owner_party === 'boolean'
    && text(row.claim_state);
}

function validExternalOwner(value) {
  return exact(value, ['entity_kind', 'entity_id'])
    && text(value.entity_kind) && text(value.entity_id);
}
