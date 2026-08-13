import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { expectedSemanticConversationSession } from
  './lower-dvina-trace-phase-3-commit-support.js';
import { nextPhase8AccusationState } from
  './lower-dvina-trace-phase-8-state.js';
import { phase8AccusationWrites, phase8PendingScreen,
  phase8VisibleEnvelope } from './lower-dvina-trace-phase-8-writes.js';
import { bindLowerDvinaTraceFactualTurnStepIdempotency } from
  './lower-dvina-trace-turn-step-idempotency.js';
import { mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence } from
  './lower-dvina-trace-turn-step-persistence.js';

export async function commitLowerDvinaTracePhase8Accusation({ partyId,
  writePlan, inputDigest, phase8Contracts, turnStepApprovedOwners,
  loadState, committer }) {
  const factual = target(writePlan, 'party_state');
  const visible = target(writePlan, 'party_visible_context_package');
  if (factual?.consequence?.phase8_kind !== 'accusation'
      || !factual.consequence.accusation?.semantic_exchange || !visible) {
    fail('TRACE_PHASE_8_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, { presentationIdempotencyKey:
    factual.player_input.idempotency_key });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase8:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key).slice(0, 20)}`;
  let next = nextPhase8AccusationState({ state, factual, nextVersion,
    turnNumber, changeSetId, inputDigest });
  const envelope = phase8VisibleEnvelope({ partyId, factual,
    visibleContext: visible, nextVersion, turnNumber, changeSetId, idemId });
  next.last_turn.visible_package = { package_id: envelope.package_id,
    package_digest: envelope.package_digest, change_set_id: changeSetId };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({ partyId,
    writePlan, state, snapshot: next, factual, changeSetId, idemId,
    phase3Contracts: phase8Contracts, turnStepApprovedOwners });
  next = turnStep.snapshot;
  const screen = phase8PendingScreen({ state, factual, envelope, turnNumber,
    nextVersion });
  const writes = mergeLowerDvinaTraceTurnStepWrites(
    phase8AccusationWrites({ partyId, state, next, factual, turnNumber,
      changeSetId, idemId, envelope, screen }), turnStep.writes);
  const builder = createCombinedWritePlanBuilder({ verifyApproval:
    async (candidate) => ({ ok: candidate.party_id === partyId
      && candidate.operation_kind === 'trace_phase_8_accusation' }) });
  const semantic = factual.consequence.accusation.semantic_exchange;
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase8:${turnNumber}`, party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_8_accusation',
    canonical_input_digest: digest(inputDigest),
    expected_state_versions: [expected('parties', partyId,
      state.party_state.state_version), expected('party_server_sessions',
      partyId, state.party_state.session_state_version),
    expected('party_clocks', partyId, state.party_state.clock_state_version),
    ...expectedSemanticConversationSession(state, semantic)],
    validation_report: { status: 'pass', digest: digest(canonicalDigest({
      input_digest: inputDigest, activity_ref:
        factual.consequence.accusation.activity_ref,
      response_kind: semantic.response_kind,
      combat_id: factual.consequence.accusation.combat_initialization
        ?.session.combat_id ?? null })) },
    idempotency: { id: idemId, key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceFactualTurnStepIdempotency({
        envelope: writePlan.turn_step_commit, inputDigest, factual,
        semanticCommandDigest: digest(canonicalDigest({ inputDigest,
          option_id: factual.mode_resolution.option_id })),
        semanticDependencyPins: { activity: phase8Contracts.activityPins },
        visibleDependencyPins: envelope.dependency_pins }),
      request_id: factual.player_input.request_id },
    change_set: { id: changeSetId }, visible_package_envelope: envelope,
    approved_write_sets: [writes], lock_context: { owner_keys:
      Object.values(phase8Contracts.actors).map(({ instance_id: id }) =>
        `actor:${id}`), execution_keys: [
        `activity:${partyId}:trace-phase8:${turnNumber}:accusation`],
      g4_keys: [], physical_keys: Object.values(writes).flat()
        .map((write) => `party_runtime.${write.target_table}:${write.id}`) },
    commit_rechecks: [sealedCheck('physical', { party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id }),
    sealedCheck('state', { party_id: partyId,
      expected_party_state_version: state.party_state.state_version }),
    sealedCheck('pin', { dependency_pins: phase8Contracts.pins }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version:
      state.party_state.clock_state_version,
    exact_elapsed_minutes: factual.consequence.duration_minutes }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })] });
  if (!built.ok) fail('TRACE_PHASE_8_WRITE_PLAN_REJECTED', built.error);
  const committed = await committer.commit({ plan: built.plan,
    created_at_turn: turnNumber });
  if (!committed.ok) fail('TRACE_PHASE_8_COMMIT_FAILED', committed.error);
  return { ...committed, state_version: nextVersion,
    turn_number: turnNumber, package_id: envelope.package_id,
    package_digest: envelope.package_digest };
}

const target = (plan, name) => plan.write_targets.find(
  ({ target: id }) => id === name)?.value;
const digest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
function fail(code, details = null) { throw serverError(code,
  'Phase 8 accusation commit failed closed.', { status: 409, details }); }
