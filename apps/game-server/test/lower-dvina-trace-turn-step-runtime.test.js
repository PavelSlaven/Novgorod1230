import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixture,
  loadScenarioBundle
} from './lower-dvina-trace-phase-2-fixture.js';
import { createPhase6TestTemporalOwner } from
  './lower-dvina-trace-phase-6-fixtures.js';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';

const [bundle12, bundle13, bundle15] = await Promise.all([
  loadScenarioBundle(12),
  loadScenarioBundle(13),
  loadScenarioBundle(15)
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

test('revision 13 Phase 3-6 paraphrases delegate to the exact production owners',
  async (t) => {
    const bootstrap = fixture({
      scenarioBundle: bundle13,
      materializationBundle: bundle13,
      rollValue: 0
    });
    await submit(bootstrap, {
      request_id: 'turn-step-rev13-bootstrap',
      idempotency_key: 'turn-step-rev13-bootstrap',
      raw_text: 'Осмотреть место крушения подробно.'
    });
    let state = stateWithCommittedBlueWool(bootstrap.state);

    await t.test('Phase 3 movement preserves route, eight minutes and position',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Хочу выбраться к рыбакам по тропинке, заметной от берега.',
          exactText: 'Дойти до рыбацкого стана.',
          operation: (request) => ({
            op: 'request_movement',
            actor_ref: request.actor.actor_id,
            movement_kind: 'local',
            target_ref: 'trace_ld_v1_loc_fishing_camp'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          minutes: factual.consequence.duration_minutes,
          route: factual.consequence.movement.route_ref,
          destination:
            factual.consequence.movement.destination.location_ref,
          committedLocation: after.position.location_ref
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 8);
        state = pair.semantic.state;
      });

    await t.test('Phase 3 speech delegates emit_interaction to the current owner',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Расспрошу Еремея: пусть объяснит, что заметил у разбитой лодки.',
          exactText: 'Поговорить с Еремеем о крушении.',
          operation: (request) => ({
            op: 'emit_interaction',
            actor_ref: request.actor.actor_id,
            interaction_kind: 'request',
            target_actor_refs: [npcRef(request, 'eremey_fisher')],
            instrument_refs: [],
            content: 'что Еремей заметил у разбитой лодки'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          minutes: factual.consequence.duration_minutes,
          statement: factual.consequence.conversation.statement_ref,
          npcOption:
            factual.consequence.conversation.decision.trace.option_id,
          interactionCount: after.interactions.length
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 5);
        state = pair.semantic.state;
      });

    await t.test('Phase 3 evidence preserves check, disclosure and route knowledge',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Предъявлю Еремею найденный синий клочок как доказательство и попрошу содействия.',
          exactText: 'Показать Еремею синюю шерсть.',
          operation: (request) => ({
            op: 'emit_interaction',
            actor_ref: request.actor.actor_id,
            interaction_kind: 'offer',
            target_actor_refs: [npcRef(request, 'eremey_fisher')],
            instrument_refs: ['trace_ld_v1_evidence_blue_wool'],
            content: 'показать синюю шерсть и попросить содействия'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          difficulty: result.check.difficulty,
          band: result.check.outcome.band,
          minutes: factual.consequence.duration_minutes,
          statement: factual.consequence.conversation.statement_ref,
          routeKnowledge:
            factual.consequence.conversation.route_knowledge_ref,
          committedRoutes: [...after.route_knowledge].sort()
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 10);
        state = pair.semantic.state;
      });

    await t.test('Phase 4 route preserves group traversal and twelve minutes',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Поведу спутников по разведанному пути от стана к старой сушильне.',
          exactText: 'Пройти известной тропой к старой сушильне.',
          operation: (request) => ({
            op: 'request_movement',
            actor_ref: request.actor.actor_id,
            movement_kind: 'route',
            target_ref: 'trace_ld_v1_loc_old_drying_shed'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          minutes: factual.consequence.duration_minutes,
          route: factual.consequence.movement.route_ref,
          participants: factual.consequence.movement.participants,
          committedLocation: after.position.location_ref
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 12);
        state = pair.semantic.state;
      });

    await t.test('Phase 4 negotiation preserves social check, surrender and promise',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Обращусь к Ратше с условием: защита в обмен на немедленную сдачу.',
          exactText:
            'Предложить Ратше условную защиту и потребовать сдачи.',
          operation: (request) => ({
            op: 'emit_interaction',
            actor_ref: request.actor.actor_id,
            interaction_kind: 'offer',
            target_actor_refs: [
              npcRef(request, 'ratsha_storehouse_helper')
            ],
            instrument_refs: [],
            content: 'условная защита в обмен на сдачу'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          difficulty: result.check.difficulty,
          band: result.check.outcome.band,
          minutes: factual.consequence.duration_minutes,
          npcOption: factual.consequence.negotiation.npc_decision.option_id,
          promiseState: after.promise_instances[0].current_state,
          surrendered: after.ratsha_surrendered
        }));
        assert.equal(pair.semantic.state.promise_instances[0].current_state,
          'active');
        state = pair.semantic.state;
      });

    await t.test('Phase 5 treatment preserves check, 25 minutes and recovery state',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Займусь раненой ногой Онисима: подготовлю повязку и стабилизирую её.',
          exactText: 'Оказать Онисиму первую помощь.',
          operation: (request) => ({
            op: 'request_activity',
            actor_ref: request.actor.actor_id,
            activity_kind: 'recover',
            target_refs: [npcRef(request, 'onisim_boatman')],
            description: 'оказать помощь раненой ноге Онисима'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          difficulty: result.check.difficulty,
          band: result.check.outcome.band,
          minutes: factual.consequence.duration_minutes,
          outcome: factual.consequence.treatment.outcome_fact,
          status: after.phase5_treatment.status,
          onisimCondition: after.npcs.find(({ participant_slot_ref: slot }) =>
            slot === 'onisim_boatman').machine_state.body_condition.state
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 25);
        state = pair.semantic.state;
      });

    await t.test('Phase 6 carry preserves 20 minutes and terminal group state',
      async () => {
        const pair = await compareSemanticAndExact({
          state,
          semanticText:
            'Соберём средство для переноски и всей группой доставим раненого обратно к рыбакам.',
          exactText: 'Сделать носилки и отнести Онисима в стан.',
          operation: (request) => ({
            op: 'request_activity',
            actor_ref: request.actor.actor_id,
            activity_kind: 'carry',
            target_refs: [npcRef(request, 'onisim_boatman')],
            description: 'перенести Онисима всей группой в рыбацкий стан'
          })
        });
        assertSame(pair, ({ result, factual, state: after }) => ({
          option: result.option_id,
          minutes: factual.consequence.duration_minutes,
          executionStatus:
            factual.consequence.carry.intent.execution_after.status,
          elapsed: factual.consequence.carry.intent.exact_elapsed,
          progress: after.phase6_carry_execution.progress_ppm,
          committedLocation: after.position.location_ref
        }));
        assert.equal(pair.semantic.factual.consequence.duration_minutes, 20);
      });
  });

function submit(f, input) {
  return f.runtime.submitTurn({ partyId: f.partyId, input });
}

async function compareSemanticAndExact({ state, semanticText, exactText,
  operation }) {
  const semantic = fixture({
    scenarioBundle: bundle13,
    materializationBundle: bundle13,
    committedState: state,
    rollValue: 0.99,
    temporalAdvanceOwner: phase6TemporalOwner(state),
    turnStepModel: (request) => domainPlan(request, operation(request))
  });
  const exact = fixture({
    scenarioBundle: bundle13,
    materializationBundle: bundle13,
    committedState: state,
    rollValue: 0.99,
    temporalAdvanceOwner: phase6TemporalOwner(state)
  });
  const semanticResult = await submit(semantic,
    turn(`semantic-${state.party_state.turn_number}`, semanticText));
  const exactResult = await submit(exact,
    turn(`exact-${state.party_state.turn_number}`, exactText));
  assert.equal(semantic.semanticInput(), null);
  assert.equal(semantic.turnStepCount(), 1);
  assert.equal(semantic.lastWritePlan().command_trace.decision_protocol,
    'turn_step_plan_v1');
  assert.equal(exact.turnStepCount(), 0);
  assert.equal(exact.lastWritePlan().command_trace.decision_protocol,
    'code_exact_fast_path_v1');
  return {
    semantic: outcome(semantic, semanticResult),
    exact: outcome(exact, exactResult)
  };
}

function outcome(f, result) {
  return {
    result,
    factual: f.lastWritePlan().write_targets.find(
      ({ target }) => target === 'party_state'
    ).value,
    state: structuredClone(f.state)
  };
}

function assertSame(pair, select) {
  assert.deepEqual(select(pair.semantic), select(pair.exact));
}

function turn(key, rawText) {
  return {
    request_id: key,
    idempotency_key: key,
    raw_text: rawText
  };
}

function npcRef(request, slot) {
  const npc = request.player_safe_state.npcs.find(
    ({ participant_slot_ref: current }) => current === slot
  );
  assert.ok(npc?.instance_id, `${slot} must be visible to the player`);
  return npc.instance_id;
}

function phase6TemporalOwner(state) {
  return createPhase6TestTemporalOwner({
    state,
    resolve() {
      throw new Error('Unexpected external Phase 6 temporal boundary.');
    }
  });
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
    operations: [{
      op: 'request_discovery',
      actor_ref: request.actor.actor_id,
      discovery_kind: 'inspect',
      target_refs: [request.player_safe_state.position.location_ref],
      query: 'какие следы видны на месте крушения'
    }],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'inspect_visible_wreck',
    reason: 'Осмотр принадлежит существующему discovery owner.'
  };
}
