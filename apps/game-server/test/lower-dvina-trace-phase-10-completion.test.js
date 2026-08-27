import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { commitLowerDvinaTracePhase10 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-10-commit.js';
import { buildTracePhase10Completion, resolveTracePhase10Contracts } from
  '../src/runtime/lower-dvina-trace-phase-10-completion.js';
import { createLowerDvinaTracePhase2Runtime } from
  '../src/runtime/lower-dvina-trace-phase-2.js';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 18 });
const contracts = resolveTracePhase10Contracts({ bundle });

test('builds full completion from exact committed producers only', () => {
  const state = phase9State();
  const result = buildTracePhase10Completion({ state, contracts });
  assert.equal(result.outcome.primary_completion_state,
    'trace_ld_v1_completion_full');
  assert.equal(result.outcome.source_commit_version, 25);
  assert.equal(value(result.outcome, 'onisim_fate'), 'found_alive');
  assert.equal(value(result.outcome, 'packet_state'), 'returned');
  assert.equal(result.terminalProjection.visible_packet_state, 'returned');
  assert.equal(JSON.stringify(result.terminalProjection).includes(
    'hidden_truth'), false);

  const uncommitted = phase9State();
  uncommitted.phase9.checkpoints = [];
  uncommitted.phase9.seal_observation = null;
  uncommitted.phase9.committed_facts = uncommitted.phase9.committed_facts
    .filter((fact) => !['sealed_packet_returned', 'seal_intact']
      .includes(fact));
  const partial = buildTracePhase10Completion({ state: uncommitted,
    contracts });
  assert.equal(value(partial.outcome, 'packet_state'), 'unresolved');
  assert.equal(value(partial.outcome, 'seal_state'), 'unresolved');

  const destroyed = phase9State();
  Object.assign(destroyed.items[0].state, { seal_state: 'destroyed',
    document_condition: 'destroyed_unreadable',
    evidence_availability: 'destroyed' });
  destroyed.phase9.seal_observation.seal_state = 'destroyed';
  destroyed.phase9.committed_facts = destroyed.phase9.committed_facts
    .filter((fact) => !['sealed_packet_returned', 'seal_intact']
      .includes(fact));
  destroyed.phase9.committed_facts.push('packet_lost_or_destroyed');
  const destroyedResult = buildTracePhase10Completion({ state: destroyed,
    contracts });
  assert.equal(value(destroyedResult.outcome, 'packet_state'),
    'lost_or_destroyed');
  assert.equal(value(destroyedResult.outcome, 'seal_state'), 'damaged');
});

test('keeps objective evidence conclusions hidden without visible lineage',
  () => {
    const result = buildTracePhase10Completion({ state: phase9State(),
      contracts });

    assert.equal(result.outcome.primary_completion_state,
      'trace_ld_v1_completion_full');
    assert.equal(visibleValue(result.terminalProjection,
      'principal_resolution'), 'unresolved');
    assert.equal(visibleValue(result.terminalProjection,
      'wreck_cause_resolution'), 'unresolved');
    assert.equal(visibleValue(result.terminalProjection,
      'ratsha_participation_resolution'), 'unresolved');
    assert.deepEqual(result.terminalProjection.visible_proved_conclusions,
      []);
    assert.deepEqual(result.terminalProjection.visible_committed_facts.filter(
      (fact) => fact.startsWith('conclusion:')), []);

    const disclosedState = phase9State();
    disclosedState.knowledge = [{ fact_id: 'conclusion:principal_zhdanko',
      knowledge_state: 'known_from_committed_phase9_fact',
      evidence_refs: ['change:visible-conclusion'] }];
    const disclosed = buildTracePhase10Completion({ state: disclosedState,
      contracts });
    assert.equal(visibleValue(disclosed.terminalProjection,
      'principal_resolution'), 'zhdanko_established');
    assert.deepEqual(disclosed.terminalProjection.visible_proved_conclusions,
      ['conclusion:principal_zhdanko']);
  });

test('commits one zero-time follow-up and exact retry is a no-op', async () => {
  let current = phase9State(), commitCalls = 0, capturedPlan = null,
    capturedTurnBudget = null;
  const turnBudget = {};
  const loadState = async (_partyId, options) => {
    assert.equal(options.turnBudget, turnBudget);
    return structuredClone(current);
  };
  const committer = { async commit({ plan, turnBudget: budget }) {
    commitCalls += 1;
    capturedPlan = plan;
    capturedTurnBudget = budget;
    const snapshot = plan.inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    current = structuredClone(snapshot);
    return { ok: true, plan_digest: plan.digest };
  } };
  const first = await commitLowerDvinaTracePhase10({ partyId: 'party-1',
    phase10Contracts: contracts, loadState, committer,
    presentationIdempotencyKey: 'turn-idem-7', turnBudget });
  assert.equal(first.state_version, 26);
  assert.equal(first.turn_number, 7);
  assert.equal(commitCalls, 1);
  assert.deepEqual(Object.keys(current.completion).sort(), [
    'change_set_id', 'outcome', 'source_commit_version', 'status']);
  assert.equal(current.completion.source_commit_version, 25);
  assert.equal(current.party_state.clock_state_version, 11);
  assert.equal(current.party_state.body_state_version, 12);
  assert.equal(capturedPlan.updates.some(({ target_table: table }) =>
    ['party_clocks', 'party_actor_body_states'].includes(table)), false);
  assert.equal(capturedPlan.idempotency_key, 'completion:party-1:25');
  assert.equal(capturedPlan.semantic_command_snapshot.semantic_trace
    .semantic_llm_calls, 'forbidden');
  assert.equal(capturedPlan.visible_package_envelope.visible_payload
    .known_context.some((line) => line.includes('продолжают существовать')),
  true);
  assert.equal(capturedTurnBudget, turnBudget);

  const replay = await commitLowerDvinaTracePhase10({ partyId: 'party-1',
    phase10Contracts: contracts, loadState, committer,
    presentationIdempotencyKey: 'turn-idem-7', turnBudget });
  assert.equal(replay.replayed, true);
  assert.equal(commitCalls, 1);
  assert.equal(replay.package_digest, first.package_digest);
});

test('restart after Phase 9 resumes completion before replay narration',
  async () => {
    const input = { request_id: 'turn-request-7',
      idempotency_key: 'turn-idem-7',
      raw_text: 'зафиксировать временное решение' };
    const inputDigest = canonicalDigest({ party_id: 'party-1',
      request_id: input.request_id, idempotency_key: input.idempotency_key,
      raw_text: input.raw_text });
    let state = phase9State(), completionCalls = 0, replayCalls = 0;
    const turnBudget = { assertWithinDeadline() {} };
    const repository = {
      async loadPhase2Replay() { return { input_digest: inputDigest,
        state: structuredClone(state), public_result: { premature: true },
        screen: { screen_status: 'committed_presentation_pending' } }; },
      async commitPhase10FollowUp({ turnBudget: budget }) {
        assert.equal(budget, turnBudget);
        completionCalls += 1;
        state.completion = { status: 'committed', outcome: { schema:
          'rus.trace_composite_completion_outcome.v1' },
        source_commit_version: 25, change_set_id: 'completion-change' };
        state.party_state.state_version = 26;
        state.last_turn.visible_package = { package_id: 'completion-package',
          package_digest: 'completion-digest',
          change_set_id: 'completion-change' };
      },
      async replayPhase2Turn({ replay }) { replayCalls += 1;
        assert.equal(replay.state.completion.status, 'committed');
        return { completion_replayed: true }; },
      async loadPhase2State() { return structuredClone(state); },
      async commitPhase2Turn() { throw new Error('unexpected commit'); },
      async loadPhase2VisibleContext() { return {}; },
      async persistPhase2Screen() { throw new Error('unexpected screen'); }
    };
    let modelCalls = 0, rngCalls = 0;
    const model = async () => { modelCalls += 1; return {}; };
    const runtime = createLowerDvinaTracePhase2Runtime({ repository,
      semanticResolver: model, turnStepModel: model,
      playerConversationModel: model, npcSemanticModel: model,
      npcAutonomousModel: model, npcCombatModel: model,
      narrator: { run: model }, randomSourceFactory: () => {
        rngCalls += 1; return {}; }, decisionSecret: 'secret',
      llmTurnBudget: turnBudget });
    const result = await runtime.submitTurn({ partyId: 'party-1', input });
    assert.deepEqual(result, { completion_replayed: true });
    assert.equal(completionCalls, 1);
    assert.equal(replayCalls, 1);
    assert.equal(modelCalls, 0);
    assert.equal(rngCalls, 0);
  });

test('expired deadline during pending replay loader skips commit and narration',
  async () => {
    const input = { request_id: 'turn-request-8',
      idempotency_key: 'turn-idem-8', raw_text: 'продолжить' };
    const inputDigest = canonicalDigest({ party_id: 'party-1',
      request_id: input.request_id, idempotency_key: input.idempotency_key,
      raw_text: input.raw_text });
    let expired = false, commitCalls = 0, replayCalls = 0;
    const turnBudget = { assertWithinDeadline() {
      if (!expired) return;
      const error = new Error('Gameplay LLM turn budget is exhausted.');
      error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
      throw error;
    } };
    const repository = {
      async loadPhase2Replay() { return { input_digest: inputDigest,
        state: phase9State(), public_result: {},
        screen: { screen_status: 'committed_presentation_pending' } }; },
      async commitPhase10FollowUp() { commitCalls += 1; },
      async replayPhase2Turn() { replayCalls += 1; },
      async loadPhase2State() { throw new Error('unexpected load'); },
      async commitPhase2Turn() { throw new Error('unexpected commit'); },
      async loadPhase2VisibleContext() { throw new Error('unexpected load'); },
      async persistPhase2Screen() { throw new Error('unexpected screen'); }
    };
    const model = async () => ({});
    const runtime = createLowerDvinaTracePhase2Runtime({ repository,
      semanticResolver: model, turnStepModel: model,
      playerConversationModel: model, npcSemanticModel: model,
      npcAutonomousModel: model, npcCombatModel: model,
      narrator: { run: model }, randomSourceFactory: () => ({}),
      decisionSecret: 'secret', llmTurnBudget: turnBudget,
      bundleLoader: async () => {
        await Promise.resolve();
        expired = true;
        return bundle;
      } });

    await assert.rejects(runtime.submitTurn({ partyId: 'party-1', input }),
      { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
    assert.equal(commitCalls, 0);
    assert.equal(replayCalls, 0);
  });

function phase9State() {
  return { schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { state_version: 25, session_state_version: 14,
      clock_state_version: 11, body_state_version: 12, turn_number: 7 },
    clock: { whole_minutes: '105', subminute_numerator: '0',
      subminute_denominator: '1' },
    opening_identity: { opening_screen_digest: 'opening-digest' },
    position: { location_ref: 'trace_ld_v1_loc_fishing_camp',
      g5_anchor_id: 'camp-anchor' },
    materialization_trace: { seed_context: {
      scenario_definition_revision: 18 } },
    phase9: { status: 'temporary_disposition_committed',
      checkpoints: [{ kind: 'packet_recovered' },
        { kind: 'temporary_disposition' }],
      committed_facts: ['sealed_packet_returned', 'seal_intact',
        'zhdanko_submission_committed',
        'temporary_disposition_outcome_committed'],
      seal_observation: { seal_state: 'intact',
        document_contents_state: 'sealed' },
      evidence_resolution: { ok: true, graph_ref: {
        graph_id: 'trace_ld_v1_clue_evidence_graph_set', revision: 1 },
      supported_conclusion_refs: ['conclusion:physical_attack_pattern',
        'conclusion:ratsha_participated', 'conclusion:principal_zhdanko'] },
      temporary_disposition: { schema:
        'typed_temporary_disposition_proposal_v1' } },
    perceptions: [{ perception_id: 'perception-1',
      observation_ref: 'trace_ld_v1_observation_onisim_alive_at_drying_shed',
      fact_id: 'onisim_found_alive',
      causal_route_execution_id: 'route-execution-1' }],
    items: [{ item_id: 'packet-1',
      template_id: 'trace_ld_v1_item_sealed_packet', state: {
        seal_state: 'intact', document_contents_state: 'sealed' },
      placement: { container_id: null, holder_character_id: 'player-1' } }],
    promise_instances: [{ current_state: 'fulfilled',
      current_state_fact: 'promise_current_fulfilled' }],
    last_turn: { request_id: 'turn-request-7',
      idempotency_key: 'turn-idem-7', input_digest: 'input-digest',
      raw_text: 'зафиксировать временное решение',
      option_id: 'commit_temporary_disposition',
      action_set_digest: 'action-set-digest', semantic_trace: {},
      turn_step_commit: null, consequence: { phase9_kind:
        'temporary_disposition' }, time_update: {}, body_update: {},
      change_set_id: 'change:party-1:trace-phase9:7',
      visible_package: { package_id: 'visible-phase9',
        package_digest: 'phase9-digest',
        change_set_id: 'change:party-1:trace-phase9:7' } } };
}

function value(outcome, dimension) {
  return outcome.ordered_dimension_outcomes.find(
    ({ dimension_id: id }) => id === dimension).value_id;
}

function visibleValue(projection, dimension) {
  return projection.visible_completion_dimensions.find(
    ({ dimension_id: id }) => id === dimension).value_id;
}
