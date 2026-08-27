import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { serverError } from '../../errors.js';
import { json } from '../../runtime/first-playable/shared.js';
import { commitLowerDvinaTracePhase2 } from './lower-dvina-trace-phase-2-commit.js';
import { assertPhase2NormalizedRows, phase2IntegrityError,
  validPhase2Snapshot } from './lower-dvina-trace-phase-2-read.js';
import { loadInitialTracePhase2State } from './lower-dvina-trace-phase-2-initial-state.js';
import { buildPhase2ReadyScreen, phase2PublicResult,
  phase2ScreenDigest } from
  './lower-dvina-trace-phase-2-projection.js';
import { projectLowerDvinaTraceScreenPanels } from
  './lower-dvina-trace-screen-panels.js';
import { phase2InitialCurrentVisibleContext,
  withPhase2CurrentVisibleContext,
  withoutPhase2CurrentVisibleContext } from './lower-dvina-trace-phase-2-current-visible.js';
import { loadCurrentOrHistoricalPhase2Replay } from './lower-dvina-trace-phase-2-replay.js';
import { loadTracePhase2TemporalSourceProof } from './lower-dvina-trace-phase-2-temporal-state.js';
import { assertPhase2PresentationAdmission } from './lower-dvina-trace-phase-2-presentation-admission.js';
import {
  assertPhase3NormalizedRows,
  hydrateSemanticDecisionReplay
} from './lower-dvina-trace-phase-3-read.js';
import { assertPhase4NormalizedRows } from './lower-dvina-trace-phase-4-read.js';
import { assertPhase5NormalizedRows } from './lower-dvina-trace-phase-5-read.js';
import { assertPhase6NormalizedRows } from './lower-dvina-trace-phase-6-persistence.js';
import { assertPhase7NormalizedRows } from './lower-dvina-trace-phase-7-read.js';
import { assertTurnStepNormalizedRows } from
  './lower-dvina-trace-turn-step-read.js';
import { assertCombatSessionRows } from './lower-dvina-trace-combat-read.js';
import { assertPhase9NormalizedRows } from './lower-dvina-trace-phase-9-read.js';
import { assertPhase10NormalizedRows } from './lower-dvina-trace-phase-10-read.js';
import { commitLowerDvinaTracePhase10 } from './lower-dvina-trace-phase-10-commit.js';
import { withCommittedRuntimeContainers } from './lower-dvina-trace-phase-2-committed-runtime-containers.js';
import { loadPhase2JourneyLocation } from './lower-dvina-trace-phase-2-journey-location.js';
import { loadPhase2VisibleContext } from './lower-dvina-trace-phase-2-visible-context.js';
import { withSpatialSemanticCommittedState } from './spatial-semantic-readback.js';
import { queryWithTurnDeadline, withTurnDeadlineQueryPool } from './query-with-turn-deadline.js';
import { loadPhase2StateVersion } from './lower-dvina-trace-phase-2-state-version.js';
import { runWithinTurnDeadline } from '../../runtime/llm-turn-budget.js';
export { normalizeJourneyLocation, normalizeJourneyLocationRows } from
  './lower-dvina-trace-phase-2-journey-location.js';
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
  async function loadPhase2State(
    partyId,
    { presentationIdempotencyKey = null, turnBudget = null } = {}
  ) {
    const readPool = withTurnDeadlineQueryPool(partyPool, turnBudget);
    const phase1A = createLowerDvinaTracePhase1ARepository({
      query: readPool.query.bind(readPool)
    });
    const head = await readPool.query(
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
        await loadTracePhase2TemporalSourceProof(readPool, partyId);
      const initial = await loadInitialTracePhase2State({
        partyId,
        row,
        phase1A,
        partyPool: readPool,
        temporalSourceProof
      });
      const visible = withPhase2CurrentVisibleContext(
        initial,
        phase2InitialCurrentVisibleContext({
          screen: row.screen,
          openingScreenDigest: row.stage26_result.opening_screen_digest
        })
      );
      return withSpatialSemanticCommittedState(readPool, partyId, { ...visible,
        local_fire_runtime:structuredClone(temporalSourceProof.local_fire_runtime) });
    }
    const payload = row.state_payload;
    if (!validPhase2Snapshot(payload, row, partyId)) {
      throw phase2IntegrityError();
    }
    assertPhase2PresentationAdmission({
      row,
      payload,
      presentationIdempotencyKey
    });
    const temporalSourceProof =
      await loadTracePhase2TemporalSourceProof(readPool, partyId);
    let semanticDecisionTraces = [], semanticDecisionInputs = [];
    if (payload.schema === 'rus.lower_dvina_trace_turn_snapshot.v2') {
      ({
        decisionTraces: semanticDecisionTraces,
        decisionInputs: semanticDecisionInputs
      } = await assertPhase3NormalizedRows(readPool, payload, row));
      await assertPhase4NormalizedRows(readPool, payload, row);
      await assertPhase5NormalizedRows(readPool, payload, row);
      await assertPhase6NormalizedRows(readPool, payload, row);
      await assertPhase7NormalizedRows(readPool, payload, row);
      await assertTurnStepNormalizedRows(readPool, payload, row);
      await assertCombatSessionRows(readPool, payload);
      await assertPhase9NormalizedRows(readPool, payload);
      await assertPhase10NormalizedRows(readPool, payload, row);
    } else {
      await assertPhase2NormalizedRows(readPool, payload, row);
    }
    const loadedPayload = structuredClone(payload);
    const journeyLocation = await loadPhase2JourneyLocation(
      readPool, partyId, loadedPayload.actor_id);
    if (journeyLocation != null) loadedPayload.journey_location = journeyLocation;
    hydrateSemanticDecisionReplay(
      loadedPayload, semanticDecisionTraces, semanticDecisionInputs);
    return withSpatialSemanticCommittedState(readPool, partyId, await withCommittedRuntimeContainers(readPool, partyId, {
      ...loadedPayload,
      world_identity: {
        world_revision_id: row.world_revision_id,
        world_catalog_digest: row.world_catalog_digest
      },
      temporal_boundary_candidates:
        structuredClone(temporalSourceProof.candidates),
      temporal_source_proof: structuredClone(temporalSourceProof),
      local_fire_runtime:structuredClone(temporalSourceProof.local_fire_runtime)
      }));
  }
  async function loadPhase2Replay({ partyId, idempotencyKey, turnBudget = null }) {
    const readPool = withTurnDeadlineQueryPool(partyPool, turnBudget);
    return loadCurrentOrHistoricalPhase2Replay({
      partyPool: readPool, partyId, idempotencyKey,
      loadState: (id, options) => loadPhase2State(id, { ...options, turnBudget })
    });
  }
  async function replayPhase2Turn({ partyId, replay, narrator, turnBudget = null }) {
    if (replay.screen?.screen_status !== 'committed_presentation_pending') {
      return replay.public_result;
    }
    const visibleContext = await loadPhase2VisibleContext(partyPool, {
      commit: replay.state.last_turn.visible_package, turnBudget
    });
    const narration = await runWithinTurnDeadline(turnBudget, () => narrator.run({
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
    }));
    return persistPhase2Screen({
      partyId,
      inputDigest: replay.input_digest,
      turnBudget,
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
    return commitLowerDvinaTracePhase2({ ...input, ...commitPorts(input.turnBudget) });
  }

  function commitPorts(turnBudget = null) {
    if (turnBudget == null) return { loadState: loadCommittablePhase2State,
      committer };
    return { loadState: (partyId, options = {}) => loadCommittablePhase2State(
      partyId, { ...options, turnBudget }),
    committer: { commit: (input) => committer.commit({ ...input, turnBudget }) } };
  }

  async function loadCommittablePhase2State(...args) {
    return withoutPhase2CurrentVisibleContext(
      await loadPhase2State(...args)
    );
  }

  async function persistPhase2Screen({ partyId, inputDigest, result, turnBudget = null }) {
    const anchor = result.commit;
    const narration =
      result.narration ?? result.checkpoint?.stages?.narration;
    const narrationOutputDigest =
      narration.presentation?.output_digest
      ?? canonicalDigest(narration.approved_output);
    const payload = (await queryWithTurnDeadline(partyPool, {
      text: `SELECT state_payload
         FROM party_runtime.party_state_snapshots
       WHERE party_id=$1 AND state_version=$2`,
      values: [partyId, anchor.state_version]
    }, turnBudget)).rows[0]?.state_payload;
    if (payload?.last_turn?.input_digest !== inputDigest) {
      throw phase2IntegrityError();
    }
    const screen = projectLowerDvinaTraceScreenPanels({
      payload,
      screen: {
        ...structuredClone(result.screen),
        schema: 'lower_dvina_trace_turn_screen',
        screen_status: 'ready',
        current_projection_anchor: {
          committed_state_version: anchor.state_version,
          package_id: anchor.package_id,
          package_digest: anchor.package_digest,
          narration_output_digest: narrationOutputDigest
        }
      }
    });
    screen.screen_digest = phase2ScreenDigest(screen);
    const updated = await queryWithTurnDeadline(partyPool, {
      text: `UPDATE party_runtime.party_server_sessions
          SET screen=$2::jsonb,updated_at=now()
        WHERE party_id=$1 AND last_turn_id=$3`,
      values: [partyId, json(screen), result.turn_id]
    }, turnBudget);
    if (updated.rowCount !== 1) throw phase2IntegrityError();
    return phase2PublicResult({ payload, screen });
  }
  return Object.freeze({
    loadPhase2State,
    loadPhase2StateVersion: (partyId, options) =>
      loadPhase2StateVersion(partyPool, partyId, options),
    loadPhase2Replay,
    replayPhase2Turn,
    commitPhase2Turn,
    commitPhase10FollowUp: (input) => commitLowerDvinaTracePhase10({ ...input, ...commitPorts(input.turnBudget) }),
    loadPhase2VisibleContext: (input) => loadPhase2VisibleContext(partyPool, input),
    persistPhase2Screen
  });
}
