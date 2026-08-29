import { canonicalDigest } from '@rus/materialization';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { nextCombatState } from './lower-dvina-trace-combat-state.js';
import { combatPendingScreen, combatVisibleEnvelope, combatWrites } from
  './lower-dvina-trace-combat-writes.js';
import { bindLowerDvinaTraceFactualTurnStepIdempotency } from
  './lower-dvina-trace-turn-step-idempotency.js';
import { mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence } from
  './lower-dvina-trace-turn-step-persistence.js';

export async function commitLowerDvinaTraceCombat({ partyId, writePlan,
  inputDigest, loadState, committer }) {
  const factual = target(writePlan, 'party_state');
  const visibleContext = target(writePlan, 'party_visible_context_package');
  if (factual?.consequence?.combat_kind !== 'exchange'
      || factual.consequence.combat?.session_after == null
      || !visibleContext) fail('TRACE_COMBAT_WRITE_PLAN_INVALID');
  const state = await loadState(partyId, { presentationIdempotencyKey:
    factual.player_input.idempotency_key });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:combat:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key).slice(0, 20)}`;
  let next = nextCombatState({ state, factual, nextVersion, turnNumber,
    changeSetId, inputDigest });
  const visibleEnvelope = combatVisibleEnvelope({ partyId, factual,
    visibleContext, nextVersion, turnNumber, changeSetId, idemId });
  next.last_turn.visible_package = { package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({ partyId,
    writePlan, state, snapshot: next, factual, changeSetId, idemId });
  next = turnStep.snapshot;
  const pendingScreen = combatPendingScreen({ state, factual, visibleEnvelope,
    turnNumber, nextVersion });
  const writes = mergeLowerDvinaTraceTurnStepWrites(combatWrites({ partyId,
    state, next, factual, turnNumber, changeSetId, idemId, visibleEnvelope,
    pendingScreen }), turnStep.writes);
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({ ok:
      candidate.party_id === partyId
      && candidate.operation_kind === 'combat_exchange' }),
    approveNarration: committer.approveNarration });
  let buildInput = {
    plan_id: `p16:${partyId}:combat:${turnNumber}`, party_id: partyId,
    write_plan_kind: 'semantic_commit', operation_kind: 'combat_exchange',
    canonical_input_digest: digest(inputDigest),
    expected_state_versions: expectedVersions({ partyId, state, factual }),
    validation_report: { status: 'pass', digest: digest(canonicalDigest({
      input_digest: inputDigest,
      combat_id: factual.consequence.combat.session_after.combat_id,
      exchange_ordinal:
        factual.consequence.combat.session_after.exchange_ordinal,
      exchange_digest: canonicalDigest(factual.consequence.combat.exchange)
    })) },
    idempotency: { id: idemId, key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceFactualTurnStepIdempotency({
        envelope: writePlan.turn_step_commit, inputDigest, factual,
        semanticCommandDigest: digest(canonicalDigest({ inputDigest,
          option_id: factual.mode_resolution.option_id })),
        semanticDependencyPins: visibleEnvelope.dependency_pins,
        visibleDependencyPins: visibleEnvelope.dependency_pins }),
      request_id: factual.player_input.request_id },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: { owner_keys: factual.consequence.combat.session_after
      .participant_refs.map((ref) => `actor:${ref.entity_id}`),
    execution_keys: [factual.consequence.combat.exchange?.proposal_id]
      .filter(Boolean), g4_keys: [], physical_keys: Object.values(writes).flat()
      .map((write) => `party_runtime.${write.target_table}:${write.id}`) },
    commit_rechecks: [sealedCheck('physical', { party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id }),
    sealedCheck('state', { party_id: partyId,
      expected_party_state_version: state.party_state.state_version }),
    sealedCheck('pin', { dependency_pins: visibleEnvelope.dependency_pins }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', { expected_clock_state_version:
      state.party_state.clock_state_version,
    exact_elapsed_minutes: factual.consequence.duration_minutes }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })]
  };
  for (const temporalResult of factual.consequence.combat
    .temporal_advance_results ?? []) {
    const integrated = integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input: buildInput, temporal_result: temporalResult });
    if (!integrated.ok) fail('TRACE_COMBAT_TEMPORAL_WRITE_INVALID',
      integrated.error);
    buildInput = integrated.input;
  }
  const built = await builder.build(buildInput);
  if (!built.ok) fail('TRACE_COMBAT_WRITE_PLAN_REJECTED', built.error);
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: next, screen: pendingScreen
  });
  const committed = await committer.commit({ plan: built.plan,
    created_at_turn: turnNumber });
  if (!committed.ok) fail('TRACE_COMBAT_COMMIT_FAILED', committed.error);
  return { ...committed, state_version: nextVersion,
    turn_number: turnNumber, package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    committed_public_result: committedPublicResult };
}

function expectedVersions({ partyId, state, factual }) {
  const session = (state.combat_sessions ?? []).find(({ combat_id: id }) =>
    id === factual.consequence.combat.session_after.combat_id);
  const values = [expected('parties', partyId, state.party_state.state_version),
    expected('party_server_sessions', partyId,
      state.party_state.session_state_version),
    expected('party_clocks', partyId, state.party_state.clock_state_version),
    expected('party_combat_sessions', session.combat_id,
      Number(session.state_version))];
  if (factual.consequence.combat.body_transitions.some(({ actor_ref: actor }) =>
    actor.entity_kind === 'player_character' && actor.entity_id === state.actor_id)) {
    values.push(expected('party_actor_body_states',
      `player_character:${state.actor_id}`,
      state.party_state.body_state_version));
  }
  for (const position of factual.consequence.combat.position_transitions) {
    const traversal = position?.movement_result?.traversal;
    if (traversal?.started_new !== false) continue;
    const prior = (state.active_combat_traversals ?? []).find(
      (entry) => entry.traversal?.ids?.execution_id
        === traversal.ids.execution_id)?.traversal;
    const nextInterval = Number(
      prior?.final_travel_state?.next_interval_ordinal);
    if (!Number.isSafeInteger(nextInterval) || nextInterval <= 0) {
      fail('TRACE_COMBAT_TRAVERSAL_REPLAY_GAP');
    }
    values.push(expected('party_route_plan_executions',
      traversal.ids.execution_id, 2 + nextInterval));
    values.push(expected('traveller_travel_states',
      traversal.ids.travel_state_id, nextInterval));
  }
  return values;
}
const target = (plan, name) => plan.write_targets.find(
  ({ target: id }) => id === name)?.value;
const digest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
function fail(code, details = null) { throw serverError(code,
  'Combat exchange commit failed closed.', { status: 409, details }); }
