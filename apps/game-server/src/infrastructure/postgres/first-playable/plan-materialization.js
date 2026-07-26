import {
  json, ref
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
  const net = state.npc.equipment_profile.initial_item_allocations[0];
  const basket =
    state.npc.equipment_profile.initial_container_allocations[0];
  const netId = `item:${partyId}:${net.slot_id}`;
  const basketId = `container:${partyId}:${basket.slot_id}`;
  return {
    inserts: [
      row('party_npcs', npcId, {
        party_id: partyId,
        npc_id: npcId,
        run_id: runId,
        profile_set_id: 'scene_fisher',
        profile_level: 'background',
        identity_state: { identity: 'not_yet_enriched' },
        machine_state: { activity: 'net_work' },
        semantic_state: {
          reason_for_presence: 'late_summer_seasonal_net_work'
        }
      }),
      row('party_items', netId, {
        party_id: partyId,
        item_id: netId,
        run_id: runId,
        template_id: net.template_id,
        profile_id: 'first_playable',
        category_id: net.category_id,
        quantity: net.resolved_quantity.quantity,
        condition_state: 'serviceable',
        legal_status: 'owned',
        state: {}
      }),
      row('entity_placements', `item:${netId}`, {
        party_id: partyId,
        entity_kind: 'item',
        entity_id: netId,
        placement_kind: 'scene_position',
        position_node_id: position,
        occupies_capacity_units: 1,
        state_version: 1,
        updated_change_set_id: changeSet
      }),
      row('party_entity_controls', `item:${netId}`, {
        party_id: partyId,
        entity_kind: 'item',
        entity_id: netId,
        owner_ref: npcRef,
        holder_ref: npcRef,
        controller_ref: npcRef,
        access_profile_ref: access,
        capacity_units: 1,
        state_version: 1,
        updated_change_set_id: changeSet
      }),
      row('party_containers', basketId, {
        party_id: partyId,
        container_id: basketId,
        run_id: runId,
        template_id: basket.template_id,
        holder_npc_id: npcId,
        physical_position: null,
        condition_state: 'serviceable',
        closure_state: 'open',
        state: {},
        state_version: 1,
        updated_change_set_id: changeSet
      }),
      row('entity_placements', `container:${basketId}`, {
        party_id: partyId,
        entity_kind: 'container',
        entity_id: basketId,
        placement_kind: 'scene_position',
        position_node_id: position,
        occupies_capacity_units: 1,
        state_version: 1,
        updated_change_set_id: changeSet
      }),
      row('party_entity_controls', `container:${basketId}`, {
        party_id: partyId,
        entity_kind: 'container',
        entity_id: basketId,
        owner_ref: npcRef,
        holder_ref: npcRef,
        controller_ref: npcRef,
        access_profile_ref: access,
        capacity_units: 1,
        state_version: 1,
        updated_change_set_id: changeSet
      }),
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
