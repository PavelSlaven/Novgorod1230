import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { serverError } from '../../errors.js';
import { json } from '../../runtime/first-playable/shared.js';
import { commitLowerDvinaTracePhase2 } from './lower-dvina-trace-phase-2-commit.js';
import {
  assertPhase2NormalizedRows,
  phase2IntegrityError
} from './lower-dvina-trace-phase-2-read.js';
import { loadInitialTracePhase2State } from './lower-dvina-trace-phase-2-initial-state.js';
import {
  buildPhase2ReadyScreen,
  phase2PublicResult,
  phase2ScreenDigest,
  phase2VisibleContextFromPayload
} from './lower-dvina-trace-phase-2-projection.js';
import {
  loadCurrentOrHistoricalPhase2Replay
} from './lower-dvina-trace-phase-2-replay.js';
import { loadTracePhase2TemporalSourceProof } from './lower-dvina-trace-phase-2-temporal-state.js';
import { assertPhase2PresentationAdmission } from './lower-dvina-trace-phase-2-presentation-admission.js';
import { assertPhase3NormalizedRows } from './lower-dvina-trace-phase-3-read.js';
import { assertPhase4NormalizedRows } from './lower-dvina-trace-phase-4-read.js';
import { assertPhase5NormalizedRows } from './lower-dvina-trace-phase-5-read.js';
import { assertPhase6NormalizedRows } from './lower-dvina-trace-phase-6-persistence.js';
import { assertTurnStepNormalizedRows } from
  './lower-dvina-trace-turn-step-read.js';
export function createLowerDvinaTracePhase2PostgresRepository({
  partyPool,
  committer
} = {}) {
  if (!partyPool?.query || !partyPool?.connect
      || typeof committer?.commit !== 'function') {
    throw new TypeError(
      'Phase 2 PostgreSQL repository requires pool and P16 committer.'
    );
  }
  const phase1A = createLowerDvinaTracePhase1ARepository({
    query: partyPool.query.bind(partyPool)
  });

  async function loadPhase2State(
    partyId,
    { presentationIdempotencyKey = null } = {}
  ) {
    const head = await partyPool.query(
      `SELECT p.state_version AS party_state_version,
              p.world_revision_id,p.world_catalog_digest,
              s.state_version AS session_state_version,
              s.turn_number,s.delivery_ack_result,
              s.stage26_result,s.screen,s.last_turn_id,
              snapshot.state_payload,snapshot.state_digest,
              b.state_version AS body_state_version,
              b.health::text AS body_health,
              b.energy::text AS body_energy,
              b.satiety::text AS body_satiety,
              b.updated_change_set_id AS body_updated_change_set_id,
              c.state_version AS clock_state_version
         FROM party_runtime.parties p
         JOIN party_runtime.party_server_sessions s
           ON s.party_id=p.party_id
         JOIN party_runtime.party_state_snapshots snapshot
           ON snapshot.party_id=p.party_id
          AND snapshot.state_version=p.state_version
         JOIN party_runtime.party_actor_body_states b
           ON b.party_id=p.party_id
          AND b.actor_kind='player_character'
         JOIN party_runtime.party_clocks c ON c.party_id=p.party_id
        WHERE p.party_id=$1`,
      [partyId]
    );
    if (head.rowCount !== 1) {
      throw serverError(
        'PARTY_NOT_FOUND',
        'Party session was not found.',
        { status: 404 }
      );
    }
    const row = head.rows[0];
    if (row.delivery_ack_result?.pass !== true) {
      throw serverError(
        'OPENING_ACK_REQUIRED',
        'Opening screen must be acknowledged before the first trace turn.',
        { status: 409 }
      );
    }
    if (Number(row.party_state_version) === 0) {
      const temporalSourceProof =
        await loadTracePhase2TemporalSourceProof(partyPool, partyId);
      return loadInitialTracePhase2State({
        partyId,
        row,
        phase1A,
        partyPool,
        temporalSourceProof
      });
    }
    const payload = row.state_payload;
    if (!validSnapshot(payload, row, partyId)) {
      throw phase2IntegrityError();
    }
    assertPhase2PresentationAdmission({
      row,
      payload,
      presentationIdempotencyKey
    });
    const temporalSourceProof =
      await loadTracePhase2TemporalSourceProof(partyPool, partyId);
    let semanticDecisionTraces = [];
    if (payload.schema === 'rus.lower_dvina_trace_turn_snapshot.v2') {
      semanticDecisionTraces =
        await assertPhase3NormalizedRows(partyPool, payload, row);
      await assertPhase4NormalizedRows(partyPool, payload, row);
      await assertPhase5NormalizedRows(partyPool, payload, row);
      await assertPhase6NormalizedRows(partyPool, payload, row);
      await assertTurnStepNormalizedRows(partyPool, payload, row);
    } else {
      await assertPhase2NormalizedRows(partyPool, payload, row);
    }
    const loadedPayload = structuredClone(payload);
    if (semanticDecisionTraces.length > 0) {
      // Private request/plan state is hydrated only from its normalized owner.
      // Every snapshot builder strips this transient replay seam before write.
      loadedPayload.npc_semantic_decision_traces =
        structuredClone(semanticDecisionTraces);
    }
    return {
      ...loadedPayload,
      world_identity: {
        world_revision_id: row.world_revision_id,
        world_catalog_digest: row.world_catalog_digest
      },
      temporal_boundary_candidates:
        structuredClone(temporalSourceProof.candidates),
      temporal_source_proof: structuredClone(temporalSourceProof)
    };
  }

  async function loadPhase2Replay({ partyId, idempotencyKey }) {
    return loadCurrentOrHistoricalPhase2Replay({
      partyPool, partyId, idempotencyKey, loadState: loadPhase2State
    });
  }

  async function replayPhase2Turn({ partyId, replay, narrator }) {
    if (replay.screen?.screen_status !== 'committed_presentation_pending') {
      return replay.public_result;
    }
    const visibleContext = await loadPhase2VisibleContext({
      commit: replay.state.last_turn.visible_package
    });
    const narration = await narrator.run({
      version: 1,
      schema: 'narration_request',
      request_id: replay.screen.turn_id,
      surface: 'turn',
      visible_context: visibleContext,
      context: {
        player_input: {
          party_id: partyId,
          raw_text: replay.state.last_turn.raw_text
        },
        mode_resolution: {
          option_id: replay.state.last_turn.option_id
        }
      },
      style_policy: {
        preserve_uncertainty: true,
        no_new_world_facts: true
      },
      max_repairs: 1
    });
    return persistPhase2Screen({
      partyId,
      inputDigest: replay.input_digest,
      result: {
        commit: {
          state_version: replay.state.party_state.state_version,
          turn_number: replay.state.party_state.turn_number,
          package_id:
            replay.state.last_turn.visible_package.package_id,
          package_digest:
            replay.state.last_turn.visible_package.package_digest
        },
        narration,
        screen: buildPhase2ReadyScreen({
          payload: replay.state,
          turnId: replay.screen.turn_id,
          visibleContext,
          narration,
          narrationOutputDigest:
            narration.presentation.output_digest
        }),
        turn_id: replay.screen.turn_id
      }
    });
  }

  async function commitPhase2Turn(input) {
    return commitLowerDvinaTracePhase2({
      ...input,
      loadState: loadPhase2State,
      committer
    });
  }

  async function loadPhase2VisibleContext({ commit }) {
    const result = await partyPool.query(
      `SELECT visible_payload,package_digest,committed_state_version
         FROM party_runtime.party_visible_packages
        WHERE package_id=$1 AND package_digest=$2`,
      [commit.package_id, commit.package_digest]
    );
    const payload = result.rows[0]?.visible_payload;
    if (result.rowCount !== 1
        || result.rows[0].package_digest
          !== computeSpatialV3CanonicalDigest(payload)) {
      throw phase2IntegrityError();
    }
    return phase2VisibleContextFromPayload(payload);
  }

  async function persistPhase2Screen({ partyId, inputDigest, result }) {
    const anchor = result.commit;
    const narration =
      result.narration ?? result.checkpoint?.stages?.narration;
    const narrationOutputDigest =
      narration.presentation?.output_digest
      ?? canonicalDigest(narration.approved_output);
    const screen = {
      ...structuredClone(result.screen),
      schema: 'lower_dvina_trace_turn_screen',
      screen_status: 'ready',
      current_projection_anchor: {
        committed_state_version: anchor.state_version,
        package_id: anchor.package_id,
        package_digest: anchor.package_digest,
        narration_output_digest: narrationOutputDigest
      }
    };
    screen.screen_digest = phase2ScreenDigest(screen);
    const updated = await partyPool.query(
      `UPDATE party_runtime.party_server_sessions
          SET screen=$2::jsonb,updated_at=now()
        WHERE party_id=$1 AND last_turn_id=$3`,
      [partyId, json(screen), result.turn_id]
    );
    if (updated.rowCount !== 1) throw phase2IntegrityError();
    const payload = (await partyPool.query(
      `SELECT state_payload
         FROM party_runtime.party_state_snapshots
        WHERE party_id=$1 AND state_version=$2`,
      [partyId, anchor.state_version]
    )).rows[0]?.state_payload;
    if (payload?.last_turn?.input_digest !== inputDigest) {
      throw phase2IntegrityError();
    }
    return phase2PublicResult({ payload, screen });
  }

  return Object.freeze({
    loadPhase2State,
    loadPhase2Replay,
    replayPhase2Turn,
    commitPhase2Turn,
    loadPhase2VisibleContext,
    persistPhase2Screen
  });
}

function validSnapshot(payload, row, partyId) {
  return [
    'rus.lower_dvina_trace_phase_2_snapshot.v1',
    'rus.lower_dvina_trace_turn_snapshot.v2'
  ].includes(payload?.schema)
    && row.state_digest === canonicalDigest(payload)
    && payload.party_id === partyId
    && payload.party_state.state_version
      === Number(row.party_state_version)
    && payload.party_state.turn_number === Number(row.turn_number)
    && payload.party_state.session_state_version
      === Number(row.session_state_version)
    && payload.party_state.body_state_version
      === Number(row.body_state_version)
    && payload.party_state.clock_state_version
      === Number(row.clock_state_version);
}
