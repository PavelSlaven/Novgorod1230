import { validateActorBaseAppearance } from '@rus/actors';

import { serverError } from '../../../errors.js';
import {
  ref
} from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';

export function landingMaterializationWrites({
  previousState,
  state,
  changeSet
}) {
  if (previousState.landing_materialized || !state.landing_materialized) {
    return null;
  }
  const partyId = state.party_id;
  const runId = `run:${partyId}:baseline`;
  const position = `position:${partyId}:landing`;
  const npcId = `npc:${partyId}:fisher`;
  const npcRef = ref('npc', npcId);
  const access = ref('access_profile', 'owner_direct');
  const catalogVersion = state.first_playable_catalog_version
    ?? state.npc.catalog_version ?? 1;
  const identityState = landingNpcIdentity(
    state.npc.identity, catalogVersion
  );
  const itemIdPrefix = Number(catalogVersion) >= 2
    ? `item:${partyId}:fisher`
    : `item:${partyId}`;
  const itemWrites = state.npc.equipment_profile.initial_item_allocations
    .flatMap((allocation) => landingItemWrites({
      allocation, itemIdPrefix, partyId, runId, npcId, npcRef, access,
      changeSet
    }));
  const containerWrites = state.npc.equipment_profile
    .initial_container_allocations.flatMap((allocation) =>
      landingContainerWrites({
        allocation, partyId, runId, npcId, npcRef, access, changeSet
      }));
  return {
    inserts: [
      row('party_npcs', npcId, {
        party_id: partyId,
        npc_id: npcId,
        run_id: runId,
        profile_set_id: 'scene_fisher',
        profile_level: 'background',
        identity_state: identityState,
        machine_state: { activity: 'net_work' },
        semantic_state: {
          reason_for_presence: 'late_summer_seasonal_net_work'
        }
      }),
      ...itemWrites,
      ...containerWrites,
      row(
        'party_resource_nodes',
        `resource:${partyId}:surface-water`,
        {
          resource_node_id: `resource:${partyId}:surface-water`,
          party_id: partyId,
          source_resource_ref: ref('resource', 'surface_water'),
          position_node_id: position,
          quantity_numerator: 100000,
          quantity_denominator: 1,
          quantity_unit_ref: ref('quantity_unit', 'millilitre'),
          quality_ref: ref('quality', 'untested_surface_water'),
          access_policy_ref:
            ref('access_policy', 'shoreline_direct_access_v1'),
          state_version: 1,
          created_change_set_id: changeSet,
          updated_change_set_id: changeSet
        }
      )
    ],
    updates: [],
    appends: [],
    deletes: []
  };
}

function landingItemWrites({
  allocation, itemIdPrefix, partyId, runId, npcId, npcRef, access, changeSet
}) {
  const itemId = `${itemIdPrefix}:${allocation.slot_id}`;
  const physicalPosition = allocation.physical_position
    ?? (allocation.equipment_role === 'work_tool' ? 'hands' : 'external');
  return [
    row('party_items', itemId, {
      party_id: partyId,
      item_id: itemId,
      run_id: runId,
      template_id: allocation.template_id,
      profile_id: 'first_playable',
      category_id: allocation.category_id,
      quantity: allocation.resolved_quantity.quantity,
      condition_state: 'serviceable',
      legal_status: 'owned',
      state: allocation.visual_profile_snapshot == null ? {} : {
        visual_profile_snapshot: allocation.visual_profile_snapshot
      }
    }),
    row('party_item_placements', itemId, {
      party_id: partyId,
      item_id: itemId,
      holder_npc_id: npcId,
      physical_position: physicalPosition,
      equipment_slot_category_id:
        allocation.equipment_slot_category_id ?? null
    }),
    row('party_ownership', `ownership:${itemId}`, {
      party_id: partyId,
      ownership_id: `ownership:${itemId}`,
      item_id: itemId,
      owner_npc_id: npcId,
      controller_npc_id: npcId,
      claim_state: 'established'
    }),
    attachedEntityPlacement({
      partyId, kind: 'item', id: itemId, npcRef, changeSet
    }),
    entityControl({
      partyId, kind: 'item', id: itemId, npcRef, access, changeSet
    })
  ];
}

function landingContainerWrites({
  allocation, partyId, runId, npcId, npcRef, access, changeSet
}) {
  const containerId = `container:${partyId}:${allocation.slot_id}`;
  return [
    row('party_containers', containerId, {
      party_id: partyId,
      container_id: containerId,
      run_id: runId,
      template_id: allocation.template_id,
      holder_npc_id: npcId,
      physical_position: 'external',
      condition_state: 'serviceable',
      closure_state: 'open',
      state: {},
      state_version: 1,
      updated_change_set_id: changeSet
    }),
    row('party_ownership', `ownership:${containerId}`, {
      party_id: partyId,
      ownership_id: `ownership:${containerId}`,
      container_id: containerId,
      owner_npc_id: npcId,
      controller_npc_id: npcId,
      claim_state: 'established'
    }),
    attachedEntityPlacement({
      partyId, kind: 'container', id: containerId, npcRef, changeSet
    }),
    entityControl({
      partyId, kind: 'container', id: containerId, npcRef, access, changeSet
    })
  ];
}

function attachedEntityPlacement({ partyId, kind, id, npcRef, changeSet }) {
  return row('entity_placements', `${kind}:${id}`, {
    party_id: partyId,
    entity_kind: kind,
    entity_id: id,
    placement_kind: 'attached_to_entity',
    host_entity_ref: npcRef,
    occupies_capacity_units: 1,
    state_version: 1,
    updated_change_set_id: changeSet
  });
}

function entityControl({ partyId, kind, id, npcRef, access, changeSet }) {
  return row('party_entity_controls', `${kind}:${id}`, {
    party_id: partyId,
    entity_kind: kind,
    entity_id: id,
    owner_ref: npcRef,
    holder_ref: npcRef,
    controller_ref: npcRef,
    access_profile_ref: access,
    capacity_units: 1,
    state_version: 1,
    updated_change_set_id: changeSet
  });
}

function landingNpcIdentity(identity, catalogVersion) {
  if (Number(catalogVersion) < 2) {
    return identity ?? { identity: 'not_yet_enriched' };
  }
  const validation = validateActorBaseAppearance(identity);
  if (!validation.ok) {
    throw serverError(
      'FIRST_PLAYABLE_ACTOR_APPEARANCE_DATA_GAP',
      'First-playable catalog v2 requires complete NPC appearance before P16.',
      {
        details: {
          catalog_version: Number(catalogVersion),
          errors: validation.errors
        }
      }
    );
  }
  return identity;
}
