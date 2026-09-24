import { planApprovedActorDestinationTransition } from '@rus/movement-routes';
import { createSpatialV3LocalSceneMovementReader } from
  '../infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { serverError } from '../errors.js';
import { packageBase } from './lower-dvina-trace-phase-3-command-shared.js';

export function createSpatialV3LocalSceneRuntime({ pool,
  readVisibleLocalEdgeRefs = null, readLocalMovementEligibility = null } = {}) {
  const reader = createSpatialV3LocalSceneMovementReader({ pool, readLocalMovementEligibility });
  async function current({ partyId, actorId, state }) {
    const positionId = state?.position?.position_id;
    if (state?.party_id !== partyId || state.actor_id !== actorId || !text(positionId)
        || state.journey_location?.scene_position_id !== positionId) {
      gap('SPATIAL_V3_LOCAL_SOURCE_INVALID');
    }
    if (readVisibleLocalEdgeRefs == null) return [];
    const visible = await readVisibleLocalEdgeRefs({ partyId, actorId, state });
    if (!Array.isArray(visible) || visible.some((id) => !text(id))
        || new Set(visible).size !== visible.length) {
      gap('SPATIAL_V3_LOCAL_VISIBILITY_DATA_GAP');
    }
    const edges = await reader.list({ partyId, actorId, positionId });
    return edges.filter(({ movement_admission: admission }) =>
      visible.includes(admission.edge_id));
  }
  return Object.freeze({
    async listLocalOptions({ partyId, actorId, state }) {
      const edges = await current({ partyId, actorId, state });
      return edges.map((edge, index) => ({ edge_id: edge.movement_admission.edge_id,
        action_units: edge.movement_admission.action_units,
        display_label: `Перейти к соседнему месту ${index + 1}` }));
    },
    async prepareLocalMovement({ partyId, actorId, state, edgeId,
      playerInput, inputDigest }) {
      if (!text(edgeId) || !text(inputDigest) || !playerInput) {
        gap('SPATIAL_V3_LOCAL_REQUEST_INVALID');
      }
      if (readVisibleLocalEdgeRefs == null) {
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
