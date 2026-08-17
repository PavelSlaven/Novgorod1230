import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { assertPhase2CurrentStateVersion } from './lower-dvina-trace-phase-2-commit-admission.js';
import { nextPhase4State } from './lower-dvina-trace-phase-4-state.js';
import {
  phase4PendingScreen,
  phase4VisibleEnvelope,
  phase4Writes
} from './lower-dvina-trace-phase-4-write-projection.js';
import { serverError } from '../../errors.js';
import { mergeLowerDvinaTraceTurnStepWrites, prepareLowerDvinaTraceTurnStepPersistence } from './lower-dvina-trace-turn-step-persistence.js';
import { bindLowerDvinaTraceTurnStepIdempotency } from './lower-dvina-trace-turn-step-idempotency.js';
import { committedTraceScenarioDefinitionRevision } from '../../runtime/lower-dvina-trace-committed-revision.js';
import { integrateConversationTemporalWrites } from './lower-dvina-trace-conversation-temporal.js';
import { resumedPendingConversationActivity } from './lower-dvina-trace-pending-activity-state.js';

export async function commitLowerDvinaTracePhase4({ partyId, writePlan, inputDigest, phase4Contracts, loadState, committer }) {
  const factual = writePlan.write_targets.find((entry) => entry.target === 'party_state')?.value;
  if (!factual?.consequence?.phase4_kind) throw fail('TRACE_PHASE_4_WRITE_PLAN_INVALID');
  const state = await loadState(partyId, { presentationIdempotencyKey: factual.player_input.idempotency_key });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const scenarioRevision = committedTraceScenarioDefinitionRevision(state);
  const semanticContext = phase4SemanticCommitContext({
    writePlan,
    factual,
    scenarioRevision
  });
  const nextVersion = state.party_state.state_version + 1, turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase4:${turnNumber}`, idemId = `idem:${partyId}:${canonicalDigest(factual.player_input.idempotency_key).slice(0, 20)}`;
  let next = nextPhase4State({ state, factual, nextVersion, turnNumber,
    inputDigest, changeSetId, contracts: phase4Contracts,
    rootTurnId: semanticContext?.rootTurnId,
    workingRevision: semanticContext?.workingRevision });
  const builder = createCombinedWritePlanBuilder({ verifyApproval: async (candidate) => ({ ok: candidate.party_id === partyId && candidate.operation_kind === 'trace_phase_4_turn' }) });
  const context = writePlan.write_targets.find((entry) => entry.target === 'party_visible_context_package')?.value;
  if (!context) throw fail('TRACE_PHASE_4_VISIBLE_CONTEXT_MISSING');
  const visibleEnvelope = phase4VisibleEnvelope({ partyId, nextVersion, turnNumber,
    changeSetId, idemId, factual, visibleContext: context, contracts: phase4Contracts });
  next.last_turn.visible_package = { package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest, change_set_id: changeSetId };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({ partyId,
    writePlan, state, snapshot: next, factual, changeSetId, idemId });
  next = turnStep.snapshot;
  const pendingScreen = phase4PendingScreen({ state, factual, visibleEnvelope,
    turnNumber, nextVersion });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase4Writes({ partyId, state, next, factual, visibleEnvelope,
    pendingScreen, nextVersion, turnNumber, changeSetId, idemId,
    contracts: phase4Contracts, scenarioRevision,
    rootTurnId: semanticContext?.rootTurnId,
    workingRevision: semanticContext?.workingRevision }), turnStep.writes);
  const resumedActivity = resumedPendingConversationActivity(
    state, semanticContext?.semanticExchange
  );
  const expectedStateVersions = [
    expected('parties', partyId, state.party_state.state_version),
    expected('party_server_sessions', partyId,
      state.party_state.session_state_version),
    expected('party_clocks', partyId, state.party_state.clock_state_version),
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
    ...(writes.updates.some(({ target_table: table }) =>
      table === 'party_obligations') ? [expected(
      'party_obligations', state.promise_instances[0].obligation_id,
      Number(state.promise_instances[0].state_version)
    )] : [])
  ];
  const turnStepIdempotency = bindLowerDvinaTraceTurnStepIdempotency({
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
    semanticCommandDigest:
      `sha256:${canonicalDigest(inputDigest).replace('sha256:', '')}`,
    semanticDependencyPins: { activity: phase4Contracts.activityPins },
    visibleDependencyPins: visibleEnvelope.dependency_pins
  });
  const baseWritePlanInput = {
    plan_id: `p16:${partyId}:trace-phase4:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_4_turn',
    canonical_input_digest:
      `sha256:${inputDigest.replace('sha256:', '')}`,
    expected_state_versions: expectedStateVersions,
    validation_report: {
      status: 'pass',
      digest: `sha256:${canonicalDigest(factual).replace('sha256:', '')}`
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...turnStepIdempotency,
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: [`actor:${state.actor_id}`],
      execution_keys: [],
      g4_keys: [],
      physical_keys: Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`)
    },
    commit_rechecks: phase4CommitRechecks({
      partyId, state, factual, phase4Contracts, inputDigest
    })
  };
  const integratedInput = integrateConversationTemporalWrites({
    input: baseWritePlanInput,
    semanticExchange: semanticContext?.semanticExchange,
    fail: (error) => {
      throw fail('TRACE_PHASE_4_TEMPORAL_WRITE_CONFLICT', error);
    }
  });
  const built = await builder.build(integratedInput);
  if (!built.ok) throw fail('TRACE_PHASE_4_WRITE_PLAN_REJECTED', built.error);
  const committed = await committer.commit({ plan: built.plan, created_at_turn: turnNumber });
  if (!committed.ok) throw fail('TRACE_PHASE_4_COMMIT_FAILED', committed.error);
  return { ...committed, state_version: nextVersion, turn_number: turnNumber, package_id: visibleEnvelope.package_id, package_digest: visibleEnvelope.package_digest };
}
function fail(code, details = null) { return serverError(code, 'Phase 4 factual commit failed closed.', { status: 409, details }); }

export function phase4SemanticCommitContext({
  writePlan,
  factual,
  scenarioRevision
}) {
  const isNegotiation =
    factual.consequence.phase4_kind === 'negotiation';
  const semanticExchange = isNegotiation
    ? factual.consequence.negotiation?.semantic_exchange
    : null;
  if (![14, 15, 16, 17, 18, 19, 20, 21, 22].includes(scenarioRevision)) {
    if (semanticExchange != null) {
      throw fail('TRACE_M2_PHASE_4_SEMANTIC_REVISION_INVALID');
    }
    return null;
  }
  if (!isNegotiation) return null;
  const envelope = writePlan.turn_step_commit;
  const exactFastPath = envelope == null
    && writePlan.command_trace?.decision_protocol
      === 'code_exact_fast_path_v1';
  if (semanticExchange == null) {
    throw fail('TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID');
  }
  if (exactFastPath) {
    const rootTurnId = writePlan.turn_id;
    if (typeof rootTurnId !== 'string'
        || rootTurnId.length === 0
        || rootTurnId !== factual.mode_resolution.turn_id) {
      throw fail('TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID');
    }
    return { rootTurnId, workingRevision: 0, semanticExchange };
  }
  const rootTurnId = envelope?.root_turn_id;
  const workingRevision = envelope?.loop_trace?.working_revision;
  if (writePlan.command_trace?.decision_protocol !== 'turn_step_plan_v1'
      || envelope?.schema !== 'turn_step_commit_envelope_v1'
      || typeof rootTurnId !== 'string'
      || rootTurnId.length === 0
      || rootTurnId !== factual.mode_resolution.turn_id
      || envelope.loop_trace?.root_turn_id !== rootTurnId
      || !Number.isSafeInteger(workingRevision)
      || workingRevision < 0) {
    throw fail('TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID');
  }
  return { rootTurnId, workingRevision, semanticExchange };
}

function expectedSemanticConversationSession(state, semanticExchange) {
  if (semanticExchange == null) return [];
  const conversationId = semanticExchange.decision_request?.conversation_id
    ?? semanticExchange.exchange?.contributions?.[0]?.conversation_id;
  const existing = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  );
  if (existing == null) return [];
  if (!Number.isSafeInteger(existing.state_version)
      || existing.state_version < 1) {
    throw fail('TRACE_M2_CONVERSATION_SESSION_VERSION_INVALID');
  }
  return [expected(
    'party_conversation_sessions',
    conversationId,
    existing.state_version
  )];
}

function expectedChangedConditions(state, nextBodyState) {
  const changed = new Set((nextBodyState.active_conditions ?? [])
    .filter(({ condition_outcome: outcome }) => Boolean(outcome))
    .map(({ storage_condition_id: id }) => id));
  return (state.body_state.active_conditions ?? [])
    .filter(({ storage_condition_id: id }) => changed.has(id))
    .map((condition) => expected(
      'party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`,
      condition.state_version
    ));
}

function phase4CommitRechecks({ partyId, state, factual, phase4Contracts,
  inputDigest }) {
  const movement = factual.consequence.phase4_kind === 'movement'
    ? factual.consequence.movement : null;
  return [
    sealedCheck('physical', { party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id }),
    sealedCheck('state', { party_id: partyId,
      expected_party_state_version: state.party_state.state_version }),
    sealedCheck('pin', { dependency_pins: phase4Contracts.activityPins }),
    sealedCheck('endpoint', { destination_ref:
      movement?.traversal?.target_endpoint ?? null }),
    sealedCheck('route', { route_binding_ref: movement?.route_ref ?? null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version:
      state.party_state.clock_state_version }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })
  ];
}
