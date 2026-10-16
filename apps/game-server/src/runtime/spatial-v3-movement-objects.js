import { LOCAL_EDGE_OCCUPIED_STATUS } from './local-edge-occupancy.js';

const MOVEMENT_OBJECT_KINDS = ['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection'];
export const isMovementVisibleObject = (row) => MOVEMENT_OBJECT_KINDS.includes(row?.entity_ref?.entity_kind);

/** The route panel's objects of one position: its local edges, exits and canonical connections. */
export function movementVisibleObjects({ edges = [], exits = [], connections = [] } = {}) {
  return [
    ...edges.map(({ edge_id, display_label, destination_status: status }) => ({
      entity_ref: { entity_kind: 'scene_movement_edge', entity_id: edge_id },
      display_label, recognition: 'known',
      ...(status === 'occupied' ? { visible_status: LOCAL_EDGE_OCCUPIED_STATUS } : {}) })),
    ...exits.map(({ directional_exit_id, display_label }) => ({
      entity_ref: { entity_kind: 'g4_directional_exit', entity_id: directional_exit_id },
      display_label, recognition: 'known' })),
    ...connections.map(({ connection_binding_id, display_label }) => ({
      entity_ref: { entity_kind: 'g5_site_connection', entity_id: connection_binding_id },
      display_label, recognition: 'known' }))
  ];
}
