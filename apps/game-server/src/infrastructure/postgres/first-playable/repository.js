import { serverError } from '../../../errors.js';
import { isDeepStrictEqual } from 'node:util';
import { json } from '../../../runtime/first-playable/shared.js';
import { assertNewGameCreationIdentity, assertNewGameCreationIdentityAvailable } from './creation-identity.js';
import { insertInitialParty } from './initial.js';
import { loadSession, transaction } from './repository-support.js';

export function createFirstPlayablePartyRepository({ partyPool } = {}) {
  if (!partyPool?.connect) throw new TypeError('partyPool is required');
  return Object.freeze({
    async assertNewGameCreationIdentity({ partyId, creationIdentity }) {
      await assertNewGameCreationIdentityAvailable(partyPool, {
        partyId, creationIdentity
      });
    },

    async createInitial(input) {
      await transaction(partyPool, async (tx) => {
        const existing = await tx.query(
          `SELECT session.request_id,session.stage26_result,
                  snapshot.state_payload
             FROM party_runtime.parties party
             JOIN party_runtime.party_state_snapshots snapshot
               ON snapshot.party_id=party.party_id
              AND snapshot.state_version=party.state_version
             LEFT JOIN party_runtime.party_server_sessions session
               ON session.party_id=party.party_id
            WHERE party.party_id=$1
            FOR UPDATE OF party`,
          [input.state.party_id]
        );
        if (existing.rows.length > 0) {
          assertNewGameCreationIdentity({
            partyId: input.state.party_id,
            expected: input.state.creation_identity,
            statePayload: existing.rows[0].state_payload,
            sessionIdentity: existing.rows[0].stage26_result
          });
          return;
        }
        await insertInitialParty(tx, input);
      });
    },

    async attachCommittedOpeningSession({
      partyId,
      requestId,
      sessionIdentity,
      deliveryAttempt,
      screen
    }) {
      await transaction(partyPool, async (tx) => {
        const party = await tx.query(
          `SELECT schema_version,state_version,status
             FROM party_runtime.parties
            WHERE party_id=$1
            FOR SHARE`,
          [partyId]
        );
        const committed = party.rows[0];
        if (!committed
          || Number(committed.schema_version) !== 3
          || Number(committed.state_version) !== 0
          || committed.status !== 'active') {
          throw serverError(
            'TRACE_PHASE_1B_PARTY_NOT_COMMITTED',
            'A complete committed Phase 1A party is required before session attachment.',
            { status: 409 }
          );
        }
        await tx.query(
          `INSERT INTO party_runtime.party_server_sessions
             (party_id,request_id,stage26_result,delivery_attempt,
              delivery_ack_result,screen,turn_number,last_turn_id)
           VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,$5::jsonb,0,NULL)
           ON CONFLICT (party_id) DO NOTHING`,
          [
            partyId,
            requestId,
            json(sessionIdentity),
            json(deliveryAttempt),
            json(screen)
          ]
        );
        const existing = (await tx.query(
          `SELECT request_id,stage26_result,delivery_attempt,screen,
                  turn_number,last_turn_id
             FROM party_runtime.party_server_sessions
            WHERE party_id=$1
            FOR UPDATE`,
          [partyId]
        )).rows[0];
        if (!existing
          || existing.request_id !== requestId
          || !isDeepStrictEqual(existing.stage26_result, sessionIdentity)
          || !isDeepStrictEqual(existing.delivery_attempt, deliveryAttempt)
          || !isDeepStrictEqual(existing.screen, screen)
          || Number(existing.turn_number) !== 0
          || existing.last_turn_id !== null) {
          throw serverError(
            'TRACE_PHASE_1B_SESSION_IDENTITY_CONFLICT',
            'Existing public session is bound to another exact identity or screen.',
            { status: 409 }
          );
        }
      });
    },

    async acknowledgeOpening({
      partyId,
      clientAckId,
      acknowledgedAt
    }) {
      return transaction(partyPool, async (tx) => {
        const selected = await tx.query(
          `SELECT delivery_ack_result
             FROM party_runtime.party_server_sessions
            WHERE party_id=$1
            FOR UPDATE`,
          [partyId]
        );
        if (selected.rows.length === 0) {
          throw serverError(
            'PARTY_NOT_FOUND',
            'Party session was not found.',
            { status: 404 }
          );
        }
        const existing = selected.rows[0].delivery_ack_result;
        if (existing != null) {
          if (existing.pass === true
            && existing.client_ack_id === clientAckId) {
            return structuredClone(existing);
          }
          throw serverError(
            'OPENING_ACK_IDENTITY_CONFLICT',
            'Opening delivery was already acknowledged by another client acknowledgement identity.',
            { status: 409 }
          );
        }
        const result = {
            pass: true,
            client_ack_id: clientAckId,
            acknowledged_at: acknowledgedAt
        };
        await tx.query(
          `UPDATE party_runtime.party_server_sessions
              SET delivery_ack_result=$2::jsonb,updated_at=now()
            WHERE party_id=$1`,
          [partyId, json(result)]
        );
        return result;
      });
    },

    loadSession: (partyId, options) => loadSession(partyPool, partyId, options),

    async loadTurnSnapshot(partyId) {
      const loaded = await partyPool.query(
          `SELECT p.state_version AS party_state_version,
                  s.state_version AS session_state_version,
                  s.turn_number,s.delivery_ack_result,ss.state_payload,
                  c.state_version AS clock_state_version,
                  b.state_version AS body_state_version,
                  r.state_version AS resource_state_version,
                  r.quantity_numerator AS resource_quantity,
                  ctn.state_version AS container_state_version,
                  ctrl.state_version AS rope_control_state_version,
                  ctrl.owner_ref AS rope_owner_ref,
                  ctrl.holder_ref AS rope_holder_ref,
                  ctrl.controller_ref AS rope_controller_ref,
                  loc.state_version AS actor_location_state_version,
                  boat_loc.state_version AS boat_location_state_version,
                  boat_place.state_version AS boat_placement_state_version,
                  anchor.state_version AS boundary_anchor_state_version,
                  boundary_execution.state_version
                    AS boundary_execution_state_version,
                  boundary_travel.state_version
                    AS boundary_travel_state_version,
                  att.id AS attachment_id,
                  att.state_version AS attachment_state_version,
                  rel.state_version AS relation_state_version,
                  apb.state_version AS npc_profile_state_version
           FROM party_runtime.parties p
           JOIN party_runtime.party_server_sessions s
             ON s.party_id=p.party_id
           JOIN party_runtime.party_state_snapshots ss
             ON ss.party_id=p.party_id
            AND ss.state_version=p.state_version
           LEFT JOIN party_runtime.party_clocks c
             ON c.party_id=p.party_id
           LEFT JOIN party_runtime.party_actor_body_states b
             ON b.party_id=p.party_id
            AND b.actor_kind='player_character'
           LEFT JOIN party_runtime.party_resource_nodes r
             ON r.party_id=p.party_id
            AND r.resource_node_id='resource:' || p.party_id || ':surface-water'
           LEFT JOIN party_runtime.party_containers ctn
             ON ctn.party_id=p.party_id
            AND ctn.container_id='container:' || p.party_id || ':bucket'
           LEFT JOIN party_runtime.party_entity_controls ctrl
             ON ctrl.party_id=p.party_id
            AND ctrl.entity_kind='item'
            AND ctrl.entity_id='item:' || p.party_id || ':rope'
           LEFT JOIN party_runtime.party_journey_locations loc
             ON loc.party_id=p.party_id
            AND loc.owner_kind='actor'
           LEFT JOIN party_runtime.party_journey_locations boat_loc
             ON boat_loc.party_id=p.party_id
            AND boat_loc.owner_kind='transport'
            AND boat_loc.owner_id='transport:' || p.party_id || ':boat'
           LEFT JOIN party_runtime.entity_placements boat_place
             ON boat_place.party_id=p.party_id
            AND boat_place.entity_kind='transport'
            AND boat_place.entity_id='transport:' || p.party_id || ':boat'
           LEFT JOIN party_runtime.party_transit_anchors anchor
             ON anchor.party_id=p.party_id
            AND anchor.id='anchor:' || p.party_id || ':lower-dvina-boundary'
            AND anchor.status='active'
           LEFT JOIN party_runtime.party_route_plan_executions
             boundary_execution
             ON boundary_execution.id=
               ss.state_payload->'boundary_paused_execution'
                 ->>'execution_id'
           LEFT JOIN party_runtime.traveller_travel_states
             boundary_travel
             ON boundary_travel.id=
               ss.state_payload->'boundary_paused_execution'
                 ->>'travel_state_id'
           LEFT JOIN party_runtime.party_carrier_attachments att
             ON att.party_id=p.party_id
            AND att.subject_kind='actor'
            AND att.status='active'
           LEFT JOIN party_runtime.party_actor_relations rel
             ON rel.party_id=p.party_id
            AND rel.relation_id='relation:' || p.party_id || ':player:fisher'
           LEFT JOIN party_runtime.party_actor_profile_bindings apb
             ON apb.party_id=p.party_id
            AND apb.actor_kind='npc'
           WHERE p.party_id=$1
           ORDER BY att.id
           LIMIT 1`,
          [partyId]
      );
      if (loaded.rows.length === 0) {
        throw serverError(
          'PARTY_NOT_FOUND',
          'Party session was not found.',
          { status: 404 }
        );
      }
      const row = loaded.rows[0];
      if (row.delivery_ack_result?.pass !== true
          && Number(row.turn_number) === 0) {
        throw serverError(
          'OPENING_ACK_REQUIRED',
          'Opening screen must be acknowledged.',
          { status: 409 }
        );
      }
      return Object.freeze({
        statePayload: structuredClone(row.state_payload),
        stateVersion: Number(row.party_state_version),
        turnNumber: Number(row.turn_number),
        versions: Object.freeze({
          session: Number(row.session_state_version),
          clock: optionalNumber(row.clock_state_version),
          body: optionalNumber(row.body_state_version),
          resource: optionalNumber(row.resource_state_version),
          resourceQuantity: optionalNumber(row.resource_quantity),
          container: optionalNumber(row.container_state_version),
          ropeControl: optionalNumber(row.rope_control_state_version),
          actorLocation: optionalNumber(row.actor_location_state_version),
          boatLocation: optionalNumber(row.boat_location_state_version),
          boatPlacement: optionalNumber(row.boat_placement_state_version),
          boundaryAnchor: optionalNumber(
            row.boundary_anchor_state_version
          ),
          boundaryExecution: optionalNumber(
            row.boundary_execution_state_version
          ),
          boundaryTravelState: optionalNumber(
            row.boundary_travel_state_version
          ),
          attachment: optionalNumber(row.attachment_state_version),
          attachmentId: row.attachment_id ?? null,
          relation: optionalNumber(row.relation_state_version),
          npcProfile: optionalNumber(row.npc_profile_state_version),
          ropeOwnerRef: row.rope_owner_ref ?? null,
          ropeHolderRef: row.rope_holder_ref ?? null,
          ropeControllerRef: row.rope_controller_ref ?? null
        })
      });
    }
  });
}

const optionalNumber = (value) => value == null ? null : Number(value);
