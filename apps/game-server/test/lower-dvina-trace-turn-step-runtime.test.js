import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixture,
  loadScenarioBundle,
  currentWorldBaseReferenceSnapshot
} from './lower-dvina-trace-phase-2-fixture.js';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const [bundle12, bundle13, bundle15, bundle25] = await Promise.all([
  loadScenarioBundle(12),
  loadScenarioBundle(13),
  loadScenarioBundle(15),
  loadScenarioBundle(25)
]);

test('revision 12 free input stays on the historical bounded path', async () => {
  const f = fixture({
    scenarioBundle: bundle12,
    materializationBundle: bundle12,
    rollValue: 0
  });
  const result = await submit(f, {
    request_id: 'turn-step-rev12',
    idempotency_key: 'turn-step-rev12',
    raw_text: 'Внимательно изучаю всё место крушения.'
  });
  assert.equal(result.option_id, 'inspect_wreck_in_detail');
  assert.equal(f.semanticInput()?.schema,
    'turn_semantic_resolution_request');
  assert.equal(f.turnStepCount(), 0);
  assert.equal(f.commitCount(), 1);
});

test('revision 15 early turns carry the Phase 7 action policy pin', async () => {
  const f = fixture({
    scenarioBundle: bundle15,
    materializationBundle: bundle15,
    rollValue: 0
  });
  const result = await submit(f, {
    request_id: 'turn-step-rev15-early',
    idempotency_key: 'turn-step-rev15-early',
    raw_text: 'Осмотреть место крушения подробно.'
  });

  assert.equal(result.option_id, 'inspect_wreck_in_detail');
  assert.equal(f.turnStepCount(), 0);
  assert.equal(f.commitCount(), 1);
});

test('revision 13 discovery delegates to the unchanged Phase 2 mechanics',
  async () => {
    const semantic = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0,
      turnStepModel: discoveryPlan
    });
    const exact = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0
    });
    const semanticResult = await submit(semantic, {
      request_id: 'turn-step-rev13-semantic',
      idempotency_key: 'turn-step-rev13-semantic',
      raw_text: 'Внимательно изучаю всё место крушения.'
    });
    const exactResult = await submit(exact, {
      request_id: 'turn-step-rev13-exact',
      idempotency_key: 'turn-step-rev13-exact',
      raw_text:
        'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    });

    assert.equal(semantic.semanticInput(), null);
    assert.equal(semantic.turnStepCount(), 1);
    assert.equal(semanticResult.option_id, exactResult.option_id);
    assert.equal(semanticResult.check.difficulty,
      exactResult.check.difficulty);
    assert.equal(semanticResult.check.outcome.band,
      exactResult.check.outcome.band);
    assert.deepEqual(semanticResult.body_update.proposal.exact_deltas,
      exactResult.body_update.proposal.exact_deltas);
    assert.equal(semanticResult.time_update.elapsed_minutes,
      exactResult.time_update.elapsed_minutes);
    assert.equal(
      semantic.lastWritePlan().command_trace.decision_protocol,
      'turn_step_plan_v1'
    );
    assert.equal(semantic.commitCount(), 1);
  });

test('revision 13 semantic replay does not rerun any factual owner',
  async () => {
    const f = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0.99,
      turnStepModel: discoveryPlan
    });
    const input = {
      request_id: 'turn-step-rev13-replay',
      idempotency_key: 'turn-step-rev13-replay',
      raw_text: 'Внимательно изучаю всё место крушения.'
    };
    const first = await submit(f, input);
    const counters = () => ({
      planner: f.turnStepCount(),
      rng: f.rollCount(),
      time: f.timeUpdateCount(),
      body: f.bodyUpdateCount(),
      itemCreation: f.itemCreationCount(),
      commit: f.commitCount()
    });
    assert.deepEqual(counters(), {
      planner: 1,
      rng: 1,
      time: 1,
      body: 1,
      itemCreation: 1,
      commit: 1
    });

    const replayed = await submit(f, input);

    assert.deepEqual(replayed, first);
    assert.deepEqual(counters(), {
      planner: 1,
      rng: 1,
      time: 1,
      body: 1,
      itemCreation: 1,
      commit: 1
    });
  });

test('revision 13 exact command does not require or invoke a turn step model',
  async () => {
    const f = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0
    });
    const result = await submit(f, {
      request_id: 'turn-step-rev13-exact-only',
      idempotency_key: 'turn-step-rev13-exact-only',
      raw_text: 'Осмотреть место крушения подробно.'
    });
    assert.equal(result.option_id, 'inspect_wreck_in_detail');
    assert.equal(f.semanticInput(), null);
    assert.equal(f.turnStepCount(), 0);
    assert.equal(
      f.lastWritePlan().command_trace.decision_protocol,
      'code_exact_fast_path_v1'
    );
  });

test('current production revision keeps exact fast path and sends free input to turn_step_planner',
  async () => {
    const exact = fixture({
      scenarioBundle: bundle25,
      materializationBundle: bundle25,
      worldBaseReferenceSnapshot: currentWorldBaseReferenceSnapshot(),
      rollValue: 0,
      turnStepModel: async () => assert.fail('exact command reached planner')
    });
    await submit(exact, {
      request_id: 'turn-step-current-exact',
      idempotency_key: 'turn-step-current-exact',
      raw_text: 'Осмотреть место крушения подробно.'
    });
    assert.equal(exact.turnStepCount(), 0);
    assert.equal(exact.lastWritePlan().command_trace.decision_protocol,
      'code_exact_fast_path_v1');

    let plannerCall = null;
    const freeForm = fixture({
      scenarioBundle: bundle25,
      materializationBundle: bundle25,
      worldBaseReferenceSnapshot: currentWorldBaseReferenceSnapshot(),
      rollValue: 0,
      turnStepModel: createLowerDvinaTraceTurnStepModel({
        roleRunner: { async run(call) {
          plannerCall = call;
          return { output: discoveryChoice() };
        } }
      })
    });
    await submit(freeForm, {
      request_id: 'turn-step-current-free-form',
      idempotency_key: 'turn-step-current-free-form',
      raw_text: 'Внимательно изучаю всё место крушения.'
    });
    assert.equal(freeForm.turnStepCount(), 1);
    assert.equal(freeForm.turnStepInput().schema, 'turn_step_request_v1');
    assert.equal(plannerCall.role_id, 'turn_step_planner');
    assert.equal(
      freeForm.lastWritePlan().command_trace.decision_protocol,
      'turn_step_plan_v1'
    );
  });

test('current temporal proof keeps detailed wreck inspection available across fire due boundary',
  async () => {
    let temporalCalls = 0;
    const f = fixture({
      scenarioBundle: bundle25,
      materializationBundle: bundle25,
      worldBaseReferenceSnapshot: currentWorldBaseReferenceSnapshot(),
      rollValue: 0,
      turnStepModel: async () => assert.fail('exact command reached planner'),
      temporalAdvanceOwner: {
        advance() {
          temporalCalls += 1;
          return { result: { clock_after: { whole_minutes: '333075',
            subminute_numerator: '0', subminute_denominator: '1' },
            combined_change_set: { proposals: [] },
            trace: { processed_boundary_ids: ['local-fire:active:state:2'] } } };
        }
      }
    });
    const candidate = {
      boundary_id: 'local-fire:active:state:2',
      idempotency_key: 'local-fire:active:state:2',
      scheduled_at: { whole_minutes: '333065', subminute_numerator: '0',
        subminute_denominator: '1' },
      source_ref: { entity_kind: 'propagation_process', entity_id: 'fire:active' },
      primary_subject_ref: { entity_kind: 'item', entity_id: 'fuel:active' },
      scope_ref: { entity_kind: 'party', entity_id: f.partyId },
      resolution_class: 'propagation_background', subject_refs: [],
      causal_parent_refs: []
    };
    f.state.temporal_boundary_candidates = [candidate];
    f.state.temporal_source_proof = {
      schema: 'lower_dvina_trace_temporal_source_proof', version: 2,
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner:
        '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      admission_policy: 'pass_exact_candidates_to_temporal_activity_owner',
      pending_event_count: 0, active_schedule_count: 0, candidate_count: 1,
      candidates: [candidate]
    };

    const result = await submit(f, {
      request_id: 'turn-step-current-exact-fire-boundary',
      idempotency_key: 'turn-step-current-exact-fire-boundary',
      raw_text: 'Осмотреть место крушения подробно.'
    });

    assert.equal(result.option_id, 'inspect_wreck_in_detail');
    assert.equal(result.check.outcome.success, false);
    assert.equal(f.turnStepCount(), 0);
    assert.equal(temporalCalls, 1);
  });

test('revision 13 Phase 3 movement envelope reaches production persistence',
  async () => {
    const bootstrap = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0
    });
    await submit(bootstrap, {
      request_id: 'turn-step-rev13-production-bootstrap',
      idempotency_key: 'turn-step-rev13-production-bootstrap',
      raw_text: 'Осмотреть место крушения подробно.'
    });
    const before = stateWithCommittedBlueWool(bootstrap.state);
    const semantic = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      committedState: before,
      rollValue: 0.99,
      turnStepModel: (request) => domainPlan(request, {
        op: 'request_movement',
        actor_ref: request.actor.actor_id,
        movement_kind: 'local',
        target_ref: 'trace_ld_v1_loc_fishing_camp'
      })
    });
    await submit(semantic, turn(
      'turn-step-rev13-production-move',
      'Хочу выбраться к рыбакам по тропинке, заметной от берега.'
    ));

    const writePlan = semantic.lastWritePlan();
    const envelope = writePlan.turn_step_commit;
    assert.ok(envelope);
    assert.equal(writePlan.command_trace.decision_protocol,
      'turn_step_plan_v1');
    assert.equal(envelope.mode_resolution.decision_trace.selected_option_id,
      'follow_path_to_fishing_camp');
    assert.equal(writePlan.write_targets.some(
      ({ target }) => target === 'party_turn_step_operations'), false);

    const plans = [];
    await commitLowerDvinaTracePhase2({
      ...semantic.lastCommitInput(),
      loadState: async () => structuredClone(before),
      committer: { async commit({ plan }) {
        plans.push(plan);
        return { ok: true, replay: false,
          change_set_id: plan.change_set_id };
      } }
    });
    const factual = writePlan.write_targets.find(
      ({ target }) => target === 'party_state').value;
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(factual.consequence.duration_minutes, 8);
    assert.deepEqual(snapshot.clock, factual.time_update.clock_after);
    assert.deepEqual(
      ['health', 'satiety', 'energy'].map((metric) =>
        snapshot.body_state[metric]),
      ['health', 'satiety', 'energy'].map((metric) =>
        factual.body_update.state_after[metric])
    );
    assert.deepEqual(snapshot.body_state.active_conditions.map(
      ({ id, condition_outcome: outcome, condition_profile_ref: profile }) =>
        ({ id, outcome, profile })),
    factual.body_update.state_after.active_conditions.map(
      ({ id, condition_outcome: outcome, condition_profile_ref: profile }) =>
        ({ id, outcome, profile })));
    const factualConditions = new Map(
      factual.body_update.state_after.active_conditions.map((condition) =>
        [condition.storage_condition_id, condition]));
    for (const persisted of snapshot.body_state.active_conditions) {
      const proposed = factualConditions.get(persisted.storage_condition_id);
      assert.equal(persisted.state_version,
        proposed.state_version + (proposed.condition_outcome ? 1 : 0));
    }
    assert.deepEqual(snapshot.body_state.active_conditions.map(
      ({ id, condition_outcome: outcome }) => ({ id, outcome })),
    factual.body_update.state_after.active_conditions.map(
      ({ id, condition_outcome: outcome }) => ({ id, outcome })));
    assert.equal(snapshot.position.location_ref,
      'trace_ld_v1_loc_fishing_camp');
  });

function submit(f, input) {
  return f.runtime.submitTurn({ partyId: f.partyId, input });
}

function turn(key, rawText) {
  return {
    request_id: key,
    idempotency_key: key,
    raw_text: rawText
  };
}

function domainPlan(request, operation) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.root_player_action,
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'delegate_existing_lower_dvina_owner',
    reason: 'Действие передаётся существующему владельцу механики.'
  };
}

function stateWithCommittedBlueWool(source) {
  const state = structuredClone(source);
  const actorId = state.actor_id;
  state.items.push({
    item_id: 'item:m1-runtime:blue-wool',
    template_id: 'trace_ld_v1_item_blue_wool_fragment',
    profile_id: 'trace_ld_v1_item_blue_wool_fragment',
    quantity: 1,
    placement: {
      anchor_id: null,
      container_id: null,
      holder_character_id: actorId,
      physical_position: 'hands'
    },
    ownership: {
      owner_character_id: null,
      controller_character_id: actorId,
      claim_state: 'owner_preserved_evidence_held'
    },
    state: {
      evidence_ref: 'trace_ld_v1_evidence_blue_wool',
      property_state: {
        owner_ref: 'ratsha_storehouse_helper',
        holder_ref: actorId,
        controller_ref: actorId
      },
      inventory_profile_snapshot: {
        mass_grams: 10,
        carry_form: 'compact',
        external_hand_cost: 0
      },
      pickup_transition: {
        transition_template_ref:
          'trace_ld_v1_transition_blue_wool_pickup',
        source_placement_ref: 'trace_ld_v1_slot_wreck_willow_branch'
      }
    }
  });
  state.knowledge.push({
    fact_id: 'trace_ld_v1_evidence_blue_wool',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: ['trace_ld_v1_evidence_blue_wool']
  });
  return state;
}

function discoveryPlan(request) {
  const operation = request.available_domain_operations.find(
    ({ op, discovery_kind: kind }) =>
      op === 'request_discovery' && kind === 'inspect');
  assert.ok(operation);
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: 'понять, что случилось на месте крушения',
      grounded_attempt: 'осмотреть видимое место крушения',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [structuredClone(operation)],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'inspect_visible_wreck',
    reason: 'Осмотр принадлежит существующему discovery owner.'
  };
}

function discoveryChoice() {
  return {
    interpretation: {
      player_goal: 'понять, что случилось на месте крушения',
      grounded_attempt: 'осмотреть видимое место крушения',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    operation_family: 'request_discovery',
    operation_choice: 'domain_operation_1_request_discovery_inspect',
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'inspect_visible_wreck',
    reason: 'Осмотр принадлежит существующему discovery owner.'
  };
}
