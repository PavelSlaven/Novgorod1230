import { planApprovedActorDestinationTransition } from '@rus/movement-routes';
import { createSpatialV3LocalSceneMovementReader } from
  '../infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { serverError } from '../errors.js';
import { packageBase } from './lower-dvina-trace-phase-3-command-shared.js';
import { movementVisibleObjects } from './spatial-v3-movement-objects.js';

export function createSpatialV3LocalSceneRuntime({ pool,
  readLocalEdgeDisclosure = null, readLocalMovementEligibility = null,
  readCurrentExitDisclosure = null, readCurrentConnectionDisclosure = null } = {}) {
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
    const disclosed = new Map(visible.map((row) => [row.edge_id, row]));
    return edges.filter(({ movement_admission: admission }) => disclosed.has(admission.edge_id))
      .map((edge) => {
        const row = disclosed.get(edge.movement_admission.edge_id);
        // What the actor may be told before an attempt: the disclosure owner's status, which
        // counts only perceived occupants. `movement_admission.destination_status` is the full
        // occupancy and only decides the attempt itself.
        return { ...edge, display_label: row.display_label,
          disclosed_status: row.destination_status ?? 'open' };
      });
  }
  return Object.freeze({
    async listLocalOptions({ partyId, actorId, state }) {
      const edges = await current({ partyId, actorId, state });
      return edges.map((edge) => ({ edge_id: edge.movement_admission.edge_id,
        action_units: edge.movement_admission.action_units,
        display_label: edge.display_label,
        destination_status: edge.disclosed_status }));
    },
    /** Resolve every hidden approach edge through the same admission reader as a local move. */
    async prepareLocalLineApproach({ partyId, actorId, state, orderedLocalEdgePath }) {
      if (state?.party_id !== partyId || state.actor_id !== actorId
        || !text(state.position?.position_id)
        || state.journey_location?.scene_position_id !== state.position.position_id
        || !Array.isArray(orderedLocalEdgePath) || orderedLocalEdgePath.length === 0) {
        gap('SPATIAL_V3_LOCAL_LINE_APPROACH_INVALID');
      }
      let positionId = state.position.position_id;
      const path = [];
      for (const item of orderedLocalEdgePath) {
        if (!text(item?.edge_id) || item.from_position_id !== positionId
          || !text(item.to_position_id)) gap('SPATIAL_V3_LOCAL_LINE_APPROACH_STALE');
        const matches = (await reader.list({ partyId, actorId, positionId }))
          .filter(({ movement_admission: admission }) => admission.edge_id === item.edge_id
            && admission.to_position_ref === item.to_position_id);
        if (matches.length !== 1) gap('SPATIAL_V3_LOCAL_LINE_APPROACH_EDGE_UNAVAILABLE');
        const admission = matches[0].movement_admission;
        if (admission.destination_status !== 'open') gap('SPATIAL_V3_LOCAL_EDGE_OCCUPIED');
        path.push({ edge_id: admission.edge_id, from_position_id: admission.from_position_ref,
          to_position_id: admission.to_position_ref, movement_admission: admission });
        positionId = admission.to_position_ref;
      }
      return path;
    },
    /** The full-occupancy verdict of the movement owner for one listed edge, the same one
     * `prepareLocalMovement` enforces. Server-side only: it may name occupants the actor
     * cannot perceive, so it is never shown - it only lets the turn refuse before executing. */
    async localEdgeAttemptStatus({ partyId, actorId, state, edgeId }) {
      const edges = await current({ partyId, actorId, state });
      return edges.find(({ movement_admission: admission }) =>
        admission.edge_id === edgeId)?.movement_admission.destination_status ?? null;
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
      if (edge.movement_admission.destination_status === 'occupied') {
        gap('SPATIAL_V3_LOCAL_EDGE_OCCUPIED');
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
      // The turn's screen shows the passages of the place the actor arrives at, not of the one left.
      // ponytail: read before commit, no status per edge (an occupied edge is refused at the attempt).
      const at = { partyId, actorId, observedPositionId: admission.to_position_ref,
        state: { ...state, position: { ...state.position, position_id: admission.to_position_ref },
          journey_location: { ...state.journey_location, scene_position_id: admission.to_position_ref } } };
      const destination_movement_objects = movementVisibleObjects({
        edges: await readLocalEdgeDisclosure(at),
        exits: readCurrentExitDisclosure == null ? [] : await readCurrentExitDisclosure(at),
        connections: readCurrentConnectionDisclosure == null ? [] : await readCurrentConnectionDisclosure(at) });
      return { ...packageBase({ inputDigest, duration: 0, kind: 'movement',
        position_transition: { owner: '@rus/movement-routes', actor_id: actorId,
          from_position_ref: admission.from_position_ref,
          to_position_ref: admission.to_position_ref,
          movement_edge_ref: planned.proposal.movement_ref,
          movement_admission: planned.proposal.persisted_scene_movement_edge } }),
      visible_seed: { destination_movement_objects } };
    }
  });
}

const text = (value) => typeof value === 'string' && value.length > 0;
function gap(code) { throw serverError(code, 'Current local scene movement is unavailable.', { status: 409 }); }
