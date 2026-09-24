import { loadLowerDvinaTraceScreenPresentation } from '../../internal/lower-dvina-trace-screen-presentation.js'; import { canonicalDigest } from '@rus/materialization'; import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { json } from '../../runtime/first-playable/shared.js';
import { commitLowerDvinaTracePhase2 } from './lower-dvina-trace-phase-2-commit.js';
import { assertPhase2NormalizedRows, phase2IntegrityError, validPhase2Snapshot } from './lower-dvina-trace-phase-2-read.js';
import { loadInitialTracePhase2State } from './lower-dvina-trace-phase-2-initial-state.js';
import { phase2PublicResult, phase2ScreenDigest, publicCombatStateFromConsequence } from './lower-dvina-trace-phase-2-projection.js';
import { validFactualTurnDelivery, rebuildExpectedFactualTurnDelivery, factualTurnDeliveryMatchesExpected } from './factual-presentation-delivery.js';
import { projectLowerDvinaTraceScreenPanels } from './lower-dvina-trace-screen-panels.js';
import { phase2InitialCurrentVisibleContext, withPhase2CurrentVisibleContext,
  withPhase2CurrentLocalEdges,
  withoutPhase2CurrentVisibleContext } from './lower-dvina-trace-phase-2-current-visible.js';
import { loadCurrentOrHistoricalPhase2Replay } from './lower-dvina-trace-phase-2-replay.js';
import { replayLowerDvinaTracePhase2Presentation } from './lower-dvina-trace-phase-2-presentation-replay.js';
import { loadTracePhase2TemporalSourceProof } from './lower-dvina-trace-phase-2-temporal-state.js';
import { hydrateNpcRoutineState } from '../../runtime/npc-routine-temporal.js';
import { assertPhase2PresentationAdmission } from './lower-dvina-trace-phase-2-presentation-admission.js';
import { assertPhase3NormalizedRows, hydrateSemanticDecisionReplay } from './lower-dvina-trace-phase-3-read.js';
import { assertPhase4NormalizedRows } from './lower-dvina-trace-phase-4-read.js';
import { assertPhase5NormalizedRows } from './lower-dvina-trace-phase-5-read.js';
import { assertPhase6NormalizedRows } from './lower-dvina-trace-phase-6-persistence.js';
import { assertPhase7NormalizedRows } from './lower-dvina-trace-phase-7-read.js';
import { assertTurnStepNormalizedRows } from './lower-dvina-trace-turn-step-read.js';
import { assertCombatSessionRows } from './lower-dvina-trace-combat-read.js';
import { assertPhase9NormalizedRows } from './lower-dvina-trace-phase-9-read.js';
import { assertPhase10NormalizedRows } from './lower-dvina-trace-phase-10-read.js';
import { commitLowerDvinaTracePhase10 } from './lower-dvina-trace-phase-10-commit.js';
import { withCommittedRuntimeContainers } from './lower-dvina-trace-phase-2-committed-runtime-containers.js';
import { loadPhase2JourneyLocation, withJourneyLocation } from './lower-dvina-trace-phase-2-journey-location.js';
import { loadPhase2VisibleContext } from './lower-dvina-trace-phase-2-visible-context.js';
import { withSpatialSemanticCommittedState } from './spatial-semantic-readback.js';
import { queryWithTurnDeadline, withTurnDeadlineQueryPool } from './query-with-turn-deadline.js';
import { serverError } from '../../errors.js';
import { loadPhase2StateVersion } from './lower-dvina-trace-phase-2-state-version.js';
import { loadLowerDvinaTraceScenePresentation } from '../../internal/lower-dvina-trace-scene-presentation.js'; import { withLowerDvinaTracePostActionKnowledge } from './lower-dvina-trace-post-action-knowledge.js';
export { normalizeJourneyLocation, normalizeJourneyLocationRows } from './lower-dvina-trace-phase-2-journey-location.js';
export function createLowerDvinaTracePhase2PostgresRepository({ partyPool,
  committer, authoredRuntimeBindingResolver = null,
  loadInitialNaturalScenePerceptionInput = null,
  readLocalEdgeDisclosure = null, readCurrentExitDisclosure = null } = {}) {
  if (!partyPool?.query || !partyPool?.connect
      || typeof committer?.commit !== 'function') {
    throw new TypeError(
      'Phase 2 PostgreSQL repository requires pool and P16 committer.'
    );
  }
  async function loadPhase2State(
    partyId,
    { presentationIdempotencyKey = null, turnBudget = null,
      includeCurrentVisibleContext = true } = {}
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
      const resolvedBinding = typeof authoredRuntimeBindingResolver === 'function'
        ? authoredRuntimeBindingResolver(row.stage26_result?.runtime_binding)
        : null;
      const authoredInitialState = row.state_payload?.schema === 'rus.authored_start_initial_party_snapshot.v3';
      const naturalPin = resolvedBinding?.initial_natural_perception_rule_pin;
      const canonicalInitialState = naturalPin != null
        || row.state_payload?.initial_spatial_v3?.canonical_scene_proposal != null;
      if (authoredInitialState && resolvedBinding?.snapshot_schema !== row.state_payload.schema) {
        throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
          'Canonical initial turn runtime binding is unavailable.', { status: 409 });
      }
      if (canonicalInitialState && (!authoredInitialState || (naturalPin != null
        && (!Array.isArray(row.state_payload.policy_profile_pins)
        || row.state_payload.policy_profile_pins.filter((pin) => pin.key === naturalPin.key
          && pin.revision === naturalPin.revision && pin.digest === naturalPin.digest).length !== 1)))) {
        throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
          'Canonical initial turn perception rule pin is unavailable.', { status: 409 });
      }
      if (includeCurrentVisibleContext && canonicalInitialState
        && typeof loadInitialNaturalScenePerceptionInput !== 'function') {
        throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
          'Canonical initial turn perception loader is unavailable.', { status: 409 });
      }
      const temporalSourceProof =
        await loadTracePhase2TemporalSourceProof(readPool, partyId);
      const initial = await loadInitialTracePhase2State({
        partyId,
        row,
        phase1A,
        partyPool: readPool,
        temporalSourceProof,
        runtimeBinding: resolvedBinding
      });
      const naturalScenePerceptionInput = includeCurrentVisibleContext && canonicalInitialState
        ? await loadInitialNaturalScenePerceptionInput({ partyId,
          actorId: initial.actor_id, initialState: initial }) : null;
      const visible = !includeCurrentVisibleContext ? initial : withPhase2CurrentVisibleContext(
        initial,
        phase2InitialCurrentVisibleContext({
          screen: row.screen,
          openingScreenDigest: row.stage26_result.opening_screen_digest,
          initialState: initial,
          canonicalInitialState,
          naturalScenePerceptionInput,
          scenePresentation: canonicalInitialState ? null : await loadLowerDvinaTraceScenePresentation({
            scenarioDefinitionRevision: initial.materialization_trace?.seed_context
              ?.scenario_definition_revision
          })
        })
      );
      const journeyLocation = await loadPhase2JourneyLocation(
        readPool, partyId, initial.actor_id);
      const current = await withPhase2CurrentLocalEdges(
        withJourneyLocation(visible, journeyLocation),
        includeCurrentVisibleContext ? readLocalEdgeDisclosure : null,
        includeCurrentVisibleContext ? readCurrentExitDisclosure : null);
      return withLowerDvinaTracePostActionKnowledge(readPool, partyId, await withSpatialSemanticCommittedState(readPool, partyId, hydrateNpcRoutineState({ ...current,
        npc_schedule_runtime: structuredClone(temporalSourceProof.npc_schedule_runtime ?? []),
        local_fire_runtime:structuredClone(temporalSourceProof.local_fire_runtime) })));
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
    loadedPayload.scenario_id ??= row.stage26_result?.scenario_id ?? null;
    const journeyLocation = await loadPhase2JourneyLocation(
      readPool, partyId, loadedPayload.actor_id);
    withJourneyLocation(loadedPayload, journeyLocation);
    hydrateSemanticDecisionReplay(
      loadedPayload, semanticDecisionTraces, semanticDecisionInputs);
    const loadedWithCurrentVisible = !includeCurrentVisibleContext ? loadedPayload : withPhase2CurrentVisibleContext(
      loadedPayload, await loadPhase2VisibleContext(partyPool, {
        commit: loadedPayload.last_turn.visible_package, turnBudget
      }));
    const current = await withPhase2CurrentLocalEdges(loadedWithCurrentVisible,
      includeCurrentVisibleContext ? readLocalEdgeDisclosure : null,
      includeCurrentVisibleContext ? readCurrentExitDisclosure : null);
    return withLowerDvinaTracePostActionKnowledge(readPool, partyId, await withSpatialSemanticCommittedState(readPool, partyId, await withCommittedRuntimeContainers(readPool, partyId, hydrateNpcRoutineState({
      ...current,
      world_identity: {
        world_revision_id: row.world_revision_id,
        world_catalog_digest: row.world_catalog_digest
      },
      temporal_boundary_candidates:
        structuredClone(temporalSourceProof.candidates),
      temporal_source_proof: structuredClone(temporalSourceProof),
      npc_schedule_runtime: structuredClone(temporalSourceProof.npc_schedule_runtime ?? []),
        local_fire_runtime:structuredClone(temporalSourceProof.local_fire_runtime)
      }))));
  }
  async function loadPhase2Replay({ partyId, idempotencyKey, turnBudget = null }) {
    const readPool = withTurnDeadlineQueryPool(partyPool, turnBudget);
    return loadCurrentOrHistoricalPhase2Replay({
      partyPool: readPool, partyId, idempotencyKey,
      loadState: (id, options) => loadPhase2State(id, { ...options, turnBudget })
    });
  }
  async function replayPhase2Turn({ partyId, replay, narrator, turnBudget = null }) {
    return replayLowerDvinaTracePhase2Presentation({ partyPool, partyId, replay,
      narrator, turnBudget, persistPhase2Screen });
  }
  async function commitPhase2Turn(input) {
    return commitLowerDvinaTracePhase2({ ...input, ...commitPorts(input.turnBudget) });
  }
  function commitPorts(turnBudget = null) {
    const loadState = turnBudget == null ? loadCommittablePhase2State :
      (partyId, options = {}) => loadCommittablePhase2State(
        partyId, { ...options, turnBudget });
    return { loadState, committer: {
      async commit(input) {
        turnBudget?.assertCanCommit();
        return committer.commit({ ...input, turnBudget });
      }
    } };
  }
  async function loadCommittablePhase2State(partyId, {
    includeCurrentVisibleContextForValidation = false,
    ...options
  } = {}) {
    const state = await loadPhase2State(partyId, options);
    return includeCurrentVisibleContextForValidation
      ? state
      : withoutPhase2CurrentVisibleContext(state);
  }
  async function persistPhase2Screen({ partyId, inputDigest, result, turnBudget = null }) {
    const anchor = result.commit;
    const factualDelivery = result.factual_delivery;
    const snapshot = (await queryWithTurnDeadline(partyPool, {
      text: `SELECT state_payload,state_digest
         FROM party_runtime.party_state_snapshots
       WHERE party_id=$1 AND state_version=$2`,
      values: [partyId, anchor.state_version]
    }, turnBudget)).rows[0];
    const payload = snapshot?.state_payload;
    if (payload?.last_turn?.input_digest !== inputDigest
        || (factualDelivery != null
          && snapshot?.state_digest !== canonicalDigest(payload))) {
      throw phase2IntegrityError();
    }
    if (factualDelivery != null) {
      const factualEnvelope = (await queryWithTurnDeadline(partyPool, {
        text: `SELECT visible.package_id,visible.party_id,visible.turn_id,
                      visible.committed_state_version,visible.package_digest,
                      visible.visible_payload,snapshot.state_payload AS snapshot_payload,
                      snapshot.state_digest
                 FROM party_runtime.party_visible_packages visible
                 JOIN party_runtime.party_state_snapshots snapshot
                   ON snapshot.party_id=visible.party_id
                  AND snapshot.state_version=visible.committed_state_version
                WHERE visible.party_id=$1 AND visible.package_id=$2
                  AND visible.package_digest=$3`,
        values: [partyId, anchor.package_id, anchor.package_digest]
      }, turnBudget)).rows[0];
      if (!factualEnvelope
          || factualEnvelope.turn_id !== result.turn_id
          || String(factualEnvelope.committed_state_version) !== String(anchor.state_version)
          || !validFactualTurnDelivery(factualDelivery, factualEnvelope)
          || !factualTurnDeliveryMatchesExpected(factualDelivery,
            rebuildExpectedFactualTurnDelivery({ envelope: factualEnvelope,
              presentation: await loadLowerDvinaTraceScreenPresentation(factualEnvelope.snapshot_payload) }))) {
        throw phase2IntegrityError();
      }
      const updated = await queryWithTurnDeadline(partyPool, {
        text: `UPDATE party_runtime.party_server_sessions
            SET screen=$2::jsonb,updated_at=now()
          WHERE party_id=$1 AND last_turn_id=$3`,
        values: [partyId, json(factualDelivery), result.turn_id]
      }, turnBudget);
      if (updated.rowCount !== 1) throw phase2IntegrityError();
      return phase2PublicResult({ payload, screen: factualDelivery });
    }
    const narration =
      result.narration ?? result.checkpoint?.stages?.narration;
    const narrationOutputDigest =
      narration.presentation?.output_digest
      ?? canonicalDigest(narration.approved_output);
    const combatState = publicCombatStateFromConsequence(payload.last_turn?.consequence);
    const screen = projectLowerDvinaTraceScreenPanels({
      payload, presentation: await loadLowerDvinaTraceScreenPresentation(payload),
      screen: {
        ...structuredClone(result.screen),
        schema: payload.scenario_id === 'lower_dvina_trace_v1'
          ? 'lower_dvina_trace_turn_screen' : 'turn_screen',
        screen_status: 'ready',
        ...(combatState == null ? {} : { combat_state: combatState }),
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
