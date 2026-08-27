import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { buildTracePhase10Completion, tracePhase10Pending } from
  '../../runtime/lower-dvina-trace-phase-10-completion.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { phase10PendingScreen, phase10VisibleEnvelope, phase10Writes,
  nextPhase10State } from './lower-dvina-trace-phase-10-writes.js';

export async function commitLowerDvinaTracePhase10({ partyId,
  phase10Contracts, loadState, committer,
  presentationIdempotencyKey = null, turnBudget = null }) {
  const state = await loadState(partyId, {
    presentationIdempotencyKey, turnBudget
  });
  if (!tracePhase10Pending(state)) {
    if (validCommittedCompletion(state)) return completionAnchor(state, true);
    fail('TRACE_PHASE_10_PRECONDITION_INVALID');
  }
  const sourceVersion = state.party_state.state_version;
  const inputDigest = canonicalDigest({
    schema: 'rus.lower_dvina_trace_phase_10_follow_up_identity.v1',
    party_id: partyId, source_commit_version: sourceVersion,
    binding_digest: phase10Contracts.pins.find(({ key }) =>
      key === 'phase_10_bindings')?.digest
  });
  const changeSetId = `change:${partyId}:trace-phase10:${sourceVersion}`;
  const idempotencyKey = `completion:${partyId}:${sourceVersion}`;
  const idemId = `idem:${partyId}:${canonicalDigest(idempotencyKey)
    .slice(0, 20)}`;
  const resolved = buildTracePhase10Completion({ state,
    contracts: phase10Contracts });
  const nextVersion = sourceVersion + 1;
  const envelope = phase10VisibleEnvelope({ partyId, state, nextVersion,
    changeSetId, idemId, contracts: phase10Contracts,
    terminalProjection: resolved.terminalProjection });
  const next = nextPhase10State({ state, outcome: resolved.outcome,
    envelope, changeSetId });
  const screen = phase10PendingScreen({ state, envelope, nextVersion });
  const writes = phase10Writes({ partyId, next, envelope, screen,
    changeSetId, idemId });
  const builder = createCombinedWritePlanBuilder({ verifyApproval:
    async (candidate) => ({ ok: candidate.party_id === partyId
      && candidate.operation_kind === 'trace_phase_10_completion'
      && candidate.canonical_input_digest === digest(inputDigest) }) });
  const pins = { phase10: phase10Contracts.pins };
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase10:${sourceVersion}`,
    party_id: partyId, write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_10_completion',
    canonical_input_digest: digest(inputDigest),
    expected_state_versions: [expected('parties', partyId, sourceVersion),
      expected('party_server_sessions', partyId,
        state.party_state.session_state_version)],
    validation_report: { status: 'pass', digest: digest(canonicalDigest({
      input_digest: inputDigest, outcome: resolved.outcome })) },
    idempotency: { id: idemId, key: idempotencyKey,
      request_id: `completion-request:${partyId}:${sourceVersion}`,
      semantic_command_snapshot: {
        schema: 'rus.lower_dvina_trace_phase_10_follow_up_snapshot.v1',
        input_digest: inputDigest, raw_text: 'automatic phase 10 completion',
        action_set_digest: canonicalDigest([]),
        selected_option_id: 'automatic_phase_10_completion',
        semantic_trace: { kind: 'deterministic_follow_up',
          semantic_llm_calls: 'forbidden', rng_calls: 'forbidden',
          check_calls: 'forbidden' } },
      semantic_command_digest: digest(canonicalDigest({ inputDigest,
        outcome: resolved.outcome })), semantic_dependency_pins: pins },
    change_set: { id: changeSetId },
    visible_package_envelope: envelope,
    approved_write_sets: [writes], lock_context: {
      owner_keys: [`party:${partyId}`], execution_keys: [
        `completion:${partyId}:${sourceVersion}`], g4_keys: [],
      physical_keys: Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`) },
    commit_rechecks: [sealedCheck('physical', { party_id: partyId,
      location_ref: state.position?.location_ref ?? null,
      g5_anchor_id: state.position?.g5_anchor_id ?? null }),
    sealedCheck('state', { party_id: partyId,
      expected_party_state_version: sourceVersion }),
    sealedCheck('pin', { dependency_pins: pins }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version:
      state.party_state.clock_state_version, exact_elapsed_minutes: 0 }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })]
  });
  if (!built.ok) fail('TRACE_PHASE_10_WRITE_PLAN_REJECTED', built.error);
  const committed = await committer.commit({ plan: built.plan,
    created_at_turn: state.party_state.turn_number, turnBudget });
  if (!committed.ok) {
    const replayed = await loadState(partyId, {
      presentationIdempotencyKey, turnBudget
    });
    if (committed.error?.code === 'idempotency_conflict'
        && validCommittedCompletion(replayed)
        && replayed.completion.source_commit_version === sourceVersion) {
      return completionAnchor(replayed, true);
    }
    fail('TRACE_PHASE_10_COMMIT_FAILED', committed.error);
  }
  return { ...committed, state_version: nextVersion,
    turn_number: state.party_state.turn_number,
    package_id: envelope.package_id, package_digest: envelope.package_digest,
    completion: structuredClone(next.completion) };
}

function validCommittedCompletion(state) {
  return state?.completion?.status === 'committed'
    && state.completion.outcome?.schema
      === 'rus.trace_composite_completion_outcome.v1'
    && state.completion.change_set_id
      === state.last_turn?.visible_package?.change_set_id;
}
function completionAnchor(state, replayed) {
  return { ok: true, replayed, state_version: state.party_state.state_version,
    turn_number: state.party_state.turn_number,
    package_id: state.last_turn.visible_package.package_id,
    package_digest: state.last_turn.visible_package.package_digest,
    completion: structuredClone(state.completion) };
}
const digest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
function fail(code, details = null) { throw serverError(code,
  'Phase 10 deterministic completion failed closed.', {
    status: 409, details }); }
