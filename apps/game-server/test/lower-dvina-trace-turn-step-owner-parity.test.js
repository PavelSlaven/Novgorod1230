import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { createPhase6TestTemporalOwner } from
  './lower-dvina-trace-phase-6-fixtures.js';

const bundle13 = await loadScenarioBundle(13);

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
            movement_kind: 'route',
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
            instrument_refs: [],
            target_actor_refs: [state.npcs.find(
              ({ participant_slot_ref: slot }) => slot === 'eremey_fisher')
              .instance_id]
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
            instrument_refs: ['trace_ld_v1_evidence_blue_wool']
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
            instrument_refs: []
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

function phase6TemporalOwner(state) {
  return createPhase6TestTemporalOwner({
    state,
    resolve() {
      throw new Error('Unexpected external Phase 6 temporal boundary.');
    }
  });
}

function domainPlan(request, operation) {
  const matches = request.available_domain_operations.filter((candidate) =>
    candidate.op === operation.op
    && ['movement_kind', 'activity_kind', 'interaction_kind'].every((key) =>
      operation[key] == null || candidate[key] === operation[key])
    && ['target_actor_refs', 'instrument_refs'].every((key) =>
      operation[key] == null
      || JSON.stringify(candidate[key]) === JSON.stringify(operation[key])));
  assert.equal(matches.length, 1, JSON.stringify({ operation,
    candidates: request.available_domain_operations }));
  operation = matches[0];
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
