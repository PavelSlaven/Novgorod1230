import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bindStepTraceCopies, commit, routeDirectScenario, submit } from
  './lower-dvina-trace-turn-step-route-fixture.js';
import { loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { conversationTemporalOwner, createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const currentBundle = await loadScenarioBundle(14);
const productionScenePresentation = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v28/scene-presentation-v3.json',
  import.meta.url), 'utf8'));

test('route continuation receives only fresh first-contact fishers at camp', async () => {
  let destinationRequest = null;
  const scenario = await routeDirectScenario({
    onDestinationRequest: (request) => { destinationRequest = request; }
  });
  const context = destinationRequest.player_safe_state.current_visible_context;
  assert.equal(scenario.semantic.turnStepCount(), 2);
  assert.equal(context.visible_scene, 'рыбацкий стан');
  assert.equal(context.visible_npc.length, 3);
  assert.ok(context.visible_npc.every((npc) =>
    npc.display_label === 'человек' && npc.recognition === 'unrecognized'));
  assert.doesNotMatch(JSON.stringify(context),
    /Еремей|canonical_name|participant_slot_ref|берег крушения/u);
});

test('route continuation receives only routes from the destination', async () => {
  let sourceRequest = null, destinationRequest = null;
  await routeDirectScenario({
    scenePresentation: productionScenePresentation,
    onSourceRequest: (request) => { sourceRequest = request; },
    onDestinationRequest: (request) => { destinationRequest = request; }
  });
  assert.ok(sourceRequest.player_safe_state.available_routes.some(
    ({ route_ref: routeRef, from_ref: fromRef }) =>
      routeRef === 'trace_ld_v1_route_wreck_to_camp'
      && fromRef === 'trace_ld_v1_loc_wreck_shore'));
  const routes = destinationRequest.player_safe_state.available_routes ?? [];
  assert.ok(routes.every(({ from_ref: fromRef }) =>
    fromRef === 'trace_ld_v1_loc_fishing_camp'));
  assert.ok(routes.every(({ route_ref: routeRef }) =>
    routeRef !== 'trace_ld_v1_route_wreck_to_camp'));
});

test('route continuation reaches a visible NPC conversation in the same turn',
  async () => {
    const models = createM2ConversationModels();
    const scenario = await routeDirectScenario({
      scenarioBundle: currentBundle,
      ...models,
      temporalAdvanceOwner: conversationTemporalOwner({}),
      rootText: 'Иду к рыбакам, здороваюсь и спрашиваю, видели ли они Онисима.',
      continuationText: 'здороваюсь и спрашиваю, видели ли они Онисима',
      destinationOperation(request) {
        const operation = request.available_domain_operations.find(({ op,
          interaction_kind: kind }) => op === 'emit_interaction'
            && kind === 'speech');
        assert.ok(operation);
        return operation;
      }
    });
    const { semantic, factual, writePlan } = scenario;
    const ledger = factual.time_update.prepared_effect_ledger;
    assert.deepEqual(ledger.slices.map(({ owner_ref: owner }) => owner), [
      'lower_dvina_trace.follow_path_to_fishing_camp',
      'lower_dvina_trace.ask_eremey_about_wreck'
    ]);
    assert.equal(writePlan.turn_step_commit.loop_trace.step_traces[1]
      .approved_plan.resolution, 'domain_request');
    assert.equal(semantic.playerConversationCount(), 1);
    assert.equal(semantic.npcSemanticCount(), 1);
    assert.equal(semantic.playerConversationInput().raw_text,
      'здороваюсь и спрашиваю, видели ли они Онисима');
    assert.equal(factual.consequence.phase3_kind, 'movement');
    assert.ok(factual.consequence.conversation?.semantic_exchange);
    const visible = semantic.narratorInput().visible_context;
    assert.match(visible.visible_scene, /^человек говорит:/u);
    assert.doesNotMatch(JSON.stringify(visible), /Еремей/u);
    assert.ok(visible.visible_npc.every(({ display_label: label,
      recognition }) => label === 'человек' && recognition === 'unrecognized'));

    const plans = [];
    await commit(writePlan, scenario, plans);
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(snapshot.position.location_ref,
      'trace_ld_v1_loc_fishing_camp');
    assert.equal(snapshot.route_history.length, 1);
    assert.ok(snapshot.conversation_sessions?.length > 0);
    assert.ok(snapshot.interactions?.length > 0);
    const persistedInteraction = plans[0].appends.find(
      ({ target_table: table }) => table === 'party_actor_npc_interactions');
    assert.equal(persistedInteraction.record.location_ref.location_ref,
      'trace_ld_v1_loc_fishing_camp');
    const activities = snapshot.activity_history.slice(-2);
    assert.deepEqual(activities.map(({ activity_snapshot: activity }) =>
      activity.consequence), ['movement', 'conversation']);
    assert.deepEqual(activities[0].ended_at, activities[1].started_at);

    const replayed = await submit(semantic, scenario.input);
    assert.deepEqual(replayed, scenario.first);
    assert.equal(semantic.commitCount(), 1);
  });

test('route continuation admits a different offered Phase 3 interaction owner',
  async () => {
    const scenario = await routeDirectScenario({
      scenarioBundle: currentBundle,
      ...createM2ConversationModels(),
      temporalAdvanceOwner: conversationTemporalOwner({}),
      rootText: 'Иду к рыбакам и показываю одному из них синюю шерсть.',
      continuationText: 'показываю одному из них синюю шерсть',
      destinationOperation(request) {
        return request.available_domain_operations.find(({ op,
          instrument_refs: instruments }) => op === 'emit_interaction'
            && instruments?.length === 1);
      }
    });
    assert.deepEqual(scenario.factual.time_update.prepared_effect_ledger.slices
      .map(({ owner_ref: owner }) => owner), [
      'lower_dvina_trace.follow_path_to_fishing_camp',
      'lower_dvina_trace.show_clue_and_seek_eremey_cooperation'
    ]);
    await commit(scenario.writePlan, scenario);
  });

test('route conversation commit requires its exact offered interaction',
  async () => {
    const scenario = await routeDirectScenario({
      scenarioBundle: currentBundle,
      ...createM2ConversationModels(),
      temporalAdvanceOwner: conversationTemporalOwner({}),
      rootText: 'Иду к рыбакам и спрашиваю, видели ли они Онисима.',
      continuationText: 'спрашиваю, видели ли они Онисима',
      destinationOperation(request) {
        return request.available_domain_operations.find(({ op,
          interaction_kind: kind }) => op === 'emit_interaction'
            && kind === 'speech');
      }
    });
    const mutations = [
      (trace) => { trace.plan_request.available_domain_operations = []; },
      (trace) => { trace.approved_plan.operations[0].target_actor_refs =
        ['npc:unoffered']; },
      (trace) => { trace.approved_plan.operations.push(
        structuredClone(trace.approved_plan.operations[0])); }
    ];
    for (const mutate of mutations) {
      const tampered = structuredClone(scenario.writePlan);
      const traces = structuredClone(
        tampered.turn_step_commit.loop_trace.step_traces);
      mutate(traces[1]);
      bindStepTraceCopies(tampered, traces);
      await assert.rejects(() => commit(tampered, scenario), (error) => [
        'TRACE_TURN_STEP_COMMIT_ENVELOPE_INVALID',
        'TRACE_TURN_STEP_PREPARED_EFFECT_RECONCILIATION_FAILED'
      ].includes(error.code));
    }
  });
