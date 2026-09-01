
import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  expected, sealedCheck
} from './first-playable/plan-shared.js';
import {
  assertPhase2CurrentStateVersion
} from './lower-dvina-trace-phase-2-commit-admission.js';
import {
  nextState,
  phase3ActivityRef
} from './lower-dvina-trace-phase-3-state.js';
import { phase3Writes } from './lower-dvina-trace-phase-3-write-projection.js';
import { resolveFirstEntry } from './lower-dvina-trace-phase-3-first-entry.js';
import {
  pendingScreenFor,
  visibleEnvelopeFor
} from './lower-dvina-trace-phase-3-read-projection.js';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
import {
  committedTraceScenarioDefinitionRevision
} from '../../runtime/lower-dvina-trace-committed-revision.js';
import { resolveGenericKnownRouteContracts } from
  '../../runtime/lower-dvina-trace-known-route-contracts.js';
import { integrateConversationTemporalWrites } from
  './lower-dvina-trace-conversation-temporal.js';
import { resumedPendingConversationActivity } from
  './lower-dvina-trace-pending-activity-state.js';

import {
  expectedChangedConditions,
  expectedSemanticConversationSession,
  fail,
  normalizeDigest,
  phase3CommitRechecks,
  phase3SemanticCommitContext,
  target
} from './lower-dvina-trace-phase-3-commit-support.js';

export async function commitLowerDvinaTracePhase3({
  partyId,
  writePlan,
  inputDigest,
  phase3Contracts,
  turnStepApprovedOwners,
  loadState,
  committer
}) {
  const factual = target(writePlan, 'party_state');
  const visibleContext = target(
    writePlan,
    'party_visible_context_package'
  );
  if (!(factual?.consequence?.phase3_kind
        || factual?.consequence?.phase8_kind === 'movement')
      || !visibleContext) {
    fail('TRACE_PHASE_3_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey:
      factual.player_input.idempotency_key
  });
  phase3Contracts = resolveGenericKnownRouteContracts({ state,
    phase3Contracts, factual });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const scenarioRevision = committedTraceScenarioDefinitionRevision(state);
  const semanticContext = phase3SemanticCommitContext({
    writePlan,
    factual,
    scenarioRevision
  });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase3:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key
  ).slice(0, 20)}`;
  let next = nextState({
    state, factual, nextVersion, turnNumber, inputDigest, changeSetId,
    rootTurnId: semanticContext?.rootTurnId,
    workingRevision: semanticContext?.workingRevision
  });
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId, writePlan, state, snapshot: next, factual, changeSetId, idemId,
    phase3Contracts, turnStepApprovedOwners
  });
  next = turnStep.snapshot;
  const visibleEnvelope = visibleEnvelopeFor({
    partyId, nextVersion, turnNumber, changeSetId, idemId,
    visibleContext, factual, phase3Contracts
  });
  next.last_turn.visible_package = {
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId
  };
  const pendingScreen = pendingScreenFor({
    state: next, factual, visibleEnvelope
  });
  const firstEntry = resolveFirstEntry({
    partyId, state, factual, phase3Contracts, changeSetId, scenarioRevision
  });
  const operationKind = firstEntry?.operation_kind ?? 'trace_phase_3_turn';
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase3Writes({
    partyId, state, next, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId, inputDigest,
    phase3Contracts, scenarioRevision, operationKind,
    rootTurnId: semanticContext?.rootTurnId,
    workingRevision: semanticContext?.workingRevision
  }), turnStep.writes);
  const canonicalInputDigest = normalizeDigest(inputDigest);
  const resumedActivity = resumedPendingConversationActivity(
    state, semanticContext?.semanticExchange
  );
  const baseWritePlanInput = {
    plan_id: `p16:${partyId}:trace-phase3:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: operationKind,
    canonical_input_digest: canonicalInputDigest,
    expected_state_versions: [
      expected('parties', partyId, state.party_state.state_version),
      expected('party_server_sessions', partyId,
        state.party_state.session_state_version),
      expected('party_clocks', partyId,
        state.party_state.clock_state_version),
      ...expectedSemanticConversationSession(
        state,
        semanticContext?.semanticExchange
      ),
      ...(resumedActivity == null
        ? [] : [expected(
            'party_timed_activity_executions',
            resumedActivity.activity_execution_id,
            resumedActivity.activity_state_version
          )]),
      ...(factual.body_update?.applied === true ? [expected(
        'party_actor_body_states', `player_character:${state.actor_id}`,
        state.party_state.body_state_version
      ), ...expectedChangedConditions(state,
        factual.body_update.state_after)] : []),
      ...([...writes.updates, ...writes.deletes].some(({ target_table: table }) =>
        table === 'party_journey_locations') && state.journey_location != null
        ? [expected('party_journey_locations', state.journey_location.id,
          state.journey_location.state_version)] : []),
      ...(firstEntry?.expected_state_versions ?? [])
    ],
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        option_id: factual.mode_resolution.option_id,
        phase3_kind: factual.consequence.phase3_kind
      }))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceTurnStepIdempotency({
        envelope: writePlan.turn_step_commit,
        inputDigest,
        semanticCommandSnapshot: {
          schema: 'rus.lower_dvina_trace_command_snapshot.v2',
          input_digest: inputDigest,
          raw_text: factual.player_input.raw_text,
          action_set_digest:
            factual.mode_resolution.decision_trace.action_set_digest,
          selected_option_id: factual.mode_resolution.option_id,
          semantic_trace: factual.mode_resolution.decision_trace
        },
        semanticCommandDigest: normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          selected_option_id: factual.mode_resolution.option_id
        })),
        semanticDependencyPins: {
          activity: phase3Contracts.activityPins.find(
            ({ id }) => id === phase3ActivityRef(factual)
          )
        },
        visibleDependencyPins: visibleEnvelope.dependency_pins
      }),
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes, ...(firstEntry?.approved_write_sets ?? [])],
    lock_context: {
      owner_keys: [`actor:${state.actor_id}`],
      execution_keys: [],
      g4_keys: firstEntry?.lock_context.g4_keys ?? [],
      physical_keys: [...Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`
      ), ...(firstEntry?.lock_context.physical_keys ?? [])]
    },
    commit_rechecks: [
      ...phase3CommitRechecks({ partyId, state, factual, phase3Contracts,
        inputDigest }).filter(({ kind }) => kind !== 'physical').map((check) =>
          operationKind === 'first_entry' && check.kind === 'capacity'
            ? sealedCheck('capacity', {
              ...withoutDigest(firstEntry.commit_rechecks.find(
                ({ kind }) => kind === 'physical')),
              capacity_model: 'trace_phase3_prepared_location_actor_capacity',
              capacity_contract_ref: phase3Contracts.capacity.contract_id,
              max_actors: phase3Contracts.capacity.zones.find(
                ({ zone_id: id }) => id === 'working_camp'
              )?.max_actors,
              expected_present_npcs: state.first_entry_preparation?.npcs ?? []
            }) : check),
      ...(firstEntry?.commit_rechecks ?? phase3CommitRechecks({ partyId,
        state, factual, phase3Contracts, inputDigest })
        .filter(({ kind }) => kind === 'physical'))
    ]
  };
  const integratedInput = integrateConversationTemporalWrites({
    input: baseWritePlanInput,
    semanticExchange: semanticContext?.semanticExchange,
    fail: (error) => {
      throw serverError(
        'TRACE_PHASE_3_TEMPORAL_WRITE_CONFLICT',
        'Conversation temporal writes conflict with Phase 3 persistence.',
        { status: 409, details: error }
      );
    }
  });
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
        ok: candidate.party_id === partyId
          && candidate.operation_kind === operationKind
          && candidate.canonical_input_digest
            === integratedInput.canonical_input_digest
      })
    });
  const built = await builder.build(integratedInput);
  if (!built.ok) {
    throw serverError(
      'TRACE_PHASE_3_WRITE_PLAN_REJECTED',
      'P16 rejected the Phase 3 factual write plan.',
      { status: 409, details: built.error }
    );
  }
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: next, screen: pendingScreen
  });
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) {
    fail(
      committed.error?.code === 'idempotency_conflict'
        ? 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT'
        : `TRACE_PHASE_3_COMMIT_${String(
          committed.error?.code ?? 'FAILED'
        ).toUpperCase()}`,
      { commit_error: committed.error }
    );
  }
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    committed_public_result: committedPublicResult
  };
}

function withoutDigest({ kind, digest, ...check }) { return check; }
