import { planApprovedActorDestinationTransition } from '@rus/movement-routes';
import { createSpatialV3LocalSceneMovementReader } from
  '../infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { serverError } from '../errors.js';
import { packageBase } from './lower-dvina-trace-phase-3-command-shared.js';

export function createSpatialV3LocalSceneRuntime({ pool,
  readLocalEdgeDisclosure = null, readLocalMovementEligibility = null } = {}) {
  const reader = createSpatialV3LocalSceneMovementReader({ pool, readLocalMovementEligibility });
  async function current({ partyId, actorId, state }) {
    const positionId = state?.position?.position_id;
    if (state?.party_id !== partyId || state.actor_id !== actorId || !text(positionId)
        || state.journey_location?.scene_position_id !== positionId) {
      gap('SPATIAL_V3_LOCAL_SOURCE_INVALID');
    }
    if (readLocalEdgeDisclosure == null) return [];
    const visible = await readLocalEdgeDisclosure({ partyId, actorId, state });
    if (!Array.isArray(visible) || visible.some((row) => !text(row?.edge_id)
        || !text(row?.display_label))
        || new Set(visible.map((row) => row.edge_id)).size !== visible.length) {
      gap('SPATIAL_V3_LOCAL_VISIBILITY_DATA_GAP');
    }
    const edges = await reader.list({ partyId, actorId, positionId });
    const labels = new Map(visible.map((row) => [row.edge_id, row.display_label]));
    return edges.filter(({ movement_admission: admission }) => labels.has(admission.edge_id))
      .map((edge) => ({ ...edge, display_label: labels.get(edge.movement_admission.edge_id) }));
  }
  return Object.freeze({
    async listLocalOptions({ partyId, actorId, state }) {
      const edges = await current({ partyId, actorId, state });
      return edges.map((edge) => ({ edge_id: edge.movement_admission.edge_id,
        action_units: edge.movement_admission.action_units,
        display_label: edge.display_label }));
    },
    async prepareLocalMovement({ partyId, actorId, state, edgeId,
      playerInput, inputDigest }) {
      if (!text(edgeId) || !text(inputDigest) || !playerInput) {
        gap('SPATIAL_V3_LOCAL_REQUEST_INVALID');
      }
      if (readLocalEdgeDisclosure == null) {
        gap('SPATIAL_V3_LOCAL_VISIBILITY_DATA_GAP');
      }
      const edges = await current({ partyId, actorId, state });
      const edge = edges.find(({ movement_admission: admission }) =>
        admission.edge_id === edgeId);
      if (!edge || edge.journey_location_id !== state.journey_location.id
          || edge.journey_state_version !== Number(state.journey_location.state_version)) {
        gap('SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE');
      }
      const admission = edge.movement_admission;
      const planned = planApprovedActorDestinationTransition({
        state_version: state.party_state.state_version,
        expected_state_version: state.party_state.state_version,
        actor: { actor_ref: { entity_kind: 'player_character', entity_id: actorId },
          location_ref: edge.site_id, zone_ref: admission.from_position_ref },
        destination: { entity_ref: { entity_kind: 'scene_position',
          entity_id: admission.to_position_ref }, location_ref: edge.site_id,
          zone_ref: admission.to_position_ref },
        persisted_scene_movement_edge: admission,
        allowed_movement_refs: [edgeId]
      });
      if (!planned.pass) gap('SPATIAL_V3_LOCAL_MOVEMENT_DENIED');
      return packageBase({ inputDigest, duration: 0, kind: 'movement',
        position_transition: { owner: '@rus/movement-routes', actor_id: actorId,
          from_position_ref: admission.from_position_ref,
          to_position_ref: admission.to_position_ref,
          movement_edge_ref: planned.proposal.movement_ref,
          movement_admission: planned.proposal.persisted_scene_movement_edge } });
    }
  });
}

const text = (value) => typeof value === 'string' && value.length > 0;
function gap(code) { throw serverError(code, 'Current local scene movement is unavailable.', { status: 409 }); }
