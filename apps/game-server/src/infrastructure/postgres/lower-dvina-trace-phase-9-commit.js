import { canonicalDigest } from '@rus/materialization';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { expectedSemanticConversationSession } from
  './lower-dvina-trace-phase-3-commit-support.js';
import { nextPhase9State } from './lower-dvina-trace-phase-9-state.js';
import { phase9PendingScreen, phase9VisibleEnvelope, phase9Writes } from
  './lower-dvina-trace-phase-9-writes.js';
import { bindLowerDvinaTraceFactualTurnStepIdempotency } from
  './lower-dvina-trace-turn-step-idempotency.js';
import { mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence } from
  './lower-dvina-trace-turn-step-persistence.js';

export async function commitLowerDvinaTracePhase9({ partyId, writePlan,
  inputDigest, phase9Contracts, turnStepApprovedOwners, loadState,
  committer }) {
  const factual = target(writePlan, 'party_state');
  const visible = target(writePlan, 'party_visible_context_package');
  if (!factual?.consequence?.phase9_kind || !factual.consequence.phase9
      || !visible || phase9Contracts == null) fail('TRACE_PHASE_9_PLAN_INVALID');
  const state = await loadState(partyId, { presentationIdempotencyKey:
    factual.player_input.idempotency_key });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const kind = factual.consequence.phase9_kind;
  const changeSetId = `change:${partyId}:trace-phase9:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key).slice(0, 20)}`;
  let next = nextPhase9State({ state, factual, nextVersion, turnNumber,
    changeSetId, inputDigest, contracts: phase9Contracts });
  const envelope = phase9VisibleEnvelope({ partyId, factual,
    visibleContext: visible, nextVersion, turnNumber, changeSetId, idemId });
  next.last_turn.visible_package = { package_id: envelope.package_id,
    package_digest: envelope.package_digest, change_set_id: changeSetId };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({ partyId,
    writePlan, state, snapshot: next, factual, changeSetId, idemId,
    phase3Contracts: phase9Contracts,
    turnStepApprovedOwners });
  next = turnStep.snapshot;
  const screen = phase9PendingScreen({ state, factual, envelope, turnNumber,
    nextVersion });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase9Writes({ partyId,
    state, next, factual, turnNumber, changeSetId, idemId, envelope, screen,
    contracts: phase9Contracts }), turnStep.writes);
  const builder = createCombinedWritePlanBuilder({ verifyApproval:
    async (candidate) => ({ ok: candidate.party_id === partyId
      && candidate.operation_kind === `trace_phase_9_${kind}` }) });
  const semantic = factual.consequence.phase9.semantic_exchange;
  const updatedTables = new Set(writes.updates.map(
    ({ target_table: table }) => table));
  const updatedContainer = writes.updates.find(
    ({ target_table: table }) => table === 'party_containers');
  const expectedVersions = [expected('parties', partyId,
    state.party_state.state_version), expected('party_server_sessions',
    partyId, state.party_state.session_state_version),
  expected('party_clocks', partyId, state.party_state.clock_state_version),
  ...(updatedTables.has('party_actor_body_states')
    ? [expected('party_actor_body_states',
      `player_character:${state.actor_id}`,
      state.party_state.body_state_version)] : []),
  ...(updatedContainer == null ? [] : [expected('party_containers',
    updatedContainer.id, containerVersion(state, updatedContainer.id))]),
  ...(updatedTables.has('party_obligations')
    ? [expected('party_obligations', state.promise_instances[0].obligation_id,
      Number(state.promise_instances[0].state_version))] : []),
  ...(semantic == null ? []
    : expectedSemanticConversationSession(state, semantic))];
  if (kind === 'return_to_camp' && preparedS1Arrival(state)
      && state.journey_location != null) expectedVersions.push(
    expected('party_journey_locations', state.journey_location.id,
      state.journey_location.state_version));
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase9:${turnNumber}`, party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: `trace_phase_9_${kind}`,
    canonical_input_digest: digest(inputDigest),
    expected_state_versions: expectedVersions,
    validation_report: { status: 'pass', digest: digest(canonicalDigest({
      input_digest: inputDigest, phase9_kind: kind,
      phase9_digest: canonicalDigest(factual.consequence.phase9) })) },
    idempotency: { id: idemId, key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceFactualTurnStepIdempotency({
        envelope: writePlan.turn_step_commit, inputDigest, factual,
        semanticCommandDigest: digest(canonicalDigest({ inputDigest,
          option_id: factual.mode_resolution.option_id })),
        semanticDependencyPins: { phase9: phase9Contracts.pins },
        visibleDependencyPins: envelope.dependency_pins }),
      request_id: factual.player_input.request_id },
    change_set: { id: changeSetId }, visible_package_envelope: envelope,
    approved_write_sets: [writes], lock_context: { owner_keys: [
      `actor:${state.actor_id}`], execution_keys: [
      `activity:${partyId}:trace-phase9:${turnNumber}:${kind}`],
    g4_keys: [], physical_keys: Object.values(writes).flat()
      .map((write) => `party_runtime.${write.target_table}:${write.id}`) },
    commit_rechecks: [sealedCheck('physical', { party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id }),
    sealedCheck('state', { party_id: partyId,
      expected_party_state_version: state.party_state.state_version }),
    sealedCheck('pin', { dependency_pins: phase9Contracts.pins }),
    sealedCheck('endpoint', { destination_ref:
      factual.consequence.phase9.movement?.destination?.location_ref
        ?? null }),
    sealedCheck('route', { route_binding_ref:
      factual.consequence.phase9.movement?.route_ref ?? null }),
    sealedCheck('capacity', kind === 'return_to_camp' && preparedS1Arrival(state) ? {
      party_id: partyId, capacity_model: 'world_route_s1_arrival', actor_id: state.actor_id,
      destination_position_id: state.first_entry_preparation.spatial_v3.target.position_id,
      destination_capacity: state.first_entry_preparation.spatial_v3.target.base_static_template.position.capacity,
      destination_access_class: state.first_entry_preparation.spatial_v3.target.base_static_template.position.access_class_id,
      expected_journey_state_version: state.journey_location?.state_version ?? null
    } : { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version:
      state.party_state.clock_state_version,
    exact_elapsed_minutes: factual.consequence.duration_minutes }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })] });
  if (!built.ok) fail('TRACE_PHASE_9_WRITE_PLAN_REJECTED', built.error);
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: next, screen
  });
  const committed = await committer.commit({ plan: built.plan,
    created_at_turn: turnNumber });
  if (!committed.ok) fail('TRACE_PHASE_9_COMMIT_FAILED', committed.error);
  return { ...committed, state_version: nextVersion, turn_number: turnNumber,
    package_id: envelope.package_id, package_digest: envelope.package_digest,
    committed_public_result: committedPublicResult };
}
function preparedS1Arrival(state) {
  return state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared';
}

const target = (plan, name) => plan.write_targets.find(
  ({ target: id }) => id === name)?.value;
const digest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
function containerVersion(state, containerId) {
  const version = state.containers.find(
    ({ container_id: id }) => id === containerId)?.state_version;
  if (!Number.isInteger(version) || version < 0) {
    fail('TRACE_PHASE_9_CONTAINER_VERSION_MISSING');
  }
  return version;
}
function fail(code, details = null) { throw serverError(code,
  'Phase 9 commit failed closed.', { status: 409, details }); }
