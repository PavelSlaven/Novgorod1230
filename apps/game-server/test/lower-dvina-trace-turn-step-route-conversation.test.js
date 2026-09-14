import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bindStepTraceCopies, commit, routeDirectScenario, submit } from
  './lower-dvina-trace-turn-step-route-fixture.js';
import { loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { conversationTemporalOwner, createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

import { projectPreparedDomainState } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-state-projection.js';
import { tracePhase3PreconditionSatisfied } from
  '../src/runtime/lower-dvina-trace-phase-3-admission.js';
import { createLowerDvinaTracePreparedDomainEffect } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-effects.js';
import { projectPosition } from
  '../src/runtime/lower-dvina-trace-player-safe-world.js';

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

test('prepared first entry projects destination identity before continuation', () => {
  const state = pendingFirstEntryState();
  const actor = state.npcs[0];
  const movement = pendingFirstEntryMovement();
  const projected = projectPreparedDomainState(state, {
    consequence: { movement }, time_update: { temporal_results: [],
      clock_after: { whole_minutes: '8', subminute_numerator: '0',
        subminute_denominator: '1' } },
    body_update: { state_after: {} }
  });
  assert.deepEqual(projected.position, {
    location_ref: 'camp', position_id: 'position:camp', g6_id: 'g6:camp',
    g5_anchor_id: 'anchor:camp', g5_node_id: 'node:camp'
  });
  assert.equal(projected.npcs[0].anchor_id, 'anchor:camp');
  assert.equal(projected.first_entry_preparation.spatial_v3.target.status,
    'prepared');
  assert.equal(projected.npc_schedule_runtime[0].current_position_node_id,
    'position:camp');
  assert.equal(tracePhase3PreconditionSatisfied({
    kind: 'materialized_present_npc', ref: 'fisher'
  }, projected, { actors: [actor] }), true);
  assert.equal(tracePhase3PreconditionSatisfied({
    kind: 'materialized_present_npc', ref: 'missing'
  }, { npcs: [], position: {} }, { actors: [] }), false);
});

test('prepared route carrier projects only player-safe first-entry position', async () => {
  const state = pendingFirstEntryState();
  const movement = pendingFirstEntryMovement();
  const owner = createLowerDvinaTracePreparedDomainEffect({
    committedState: state
  });
  const prepared = await owner.apply({
    command_id: 'lower_dvina_trace.follow_path_to_fishing_camp',
    operation: { op: 'request_movement' },
    working_projection: { position: {
      location_ref: 'wreck', position_id: 'position:wreck',
      g5_anchor_id: 'anchor:wreck', g5_node_id: 'node:wreck'
    } },
    prepared_chain_context: { prior_effect_count: 0 }, availability: {},
    consequence: { phase3_kind: 'movement', duration_minutes: 8,
      movement }
  });
  assert.deepEqual(projectPosition(prepared.working_projection.position,
    { strict: true }), {
    location_ref: 'camp', position_id: 'position:camp',
    g5_anchor_id: 'anchor:camp', g5_node_id: 'node:camp'
  });
});

test('first entry neither recalls departed NPC nor leaks camp G6 to later moves', () => {
  const state = pendingFirstEntryState();
  state.npcs[0].anchor_id = 'anchor:elsewhere';
  const projected = projectPreparedDomainState(state, {
    consequence: { movement: pendingFirstEntryMovement() },
    time_update: { temporal_results: [], clock_after: state.clock },
    body_update: { state_after: {} }
  });
  assert.equal(projected.npcs[0].anchor_id, 'anchor:elsewhere');
  assert.equal(projected.npc_schedule_runtime[0].current_position_node_id,
    null);
  assert.equal(tracePhase3PreconditionSatisfied({
    kind: 'materialized_present_npc', ref: 'fisher'
  }, projected, { actors: [state.npcs[0]] }), false);
  const later = projectPreparedDomainState({
    ...projected,
    prepared_scenes: [{ location_profile_ref: 'shed',
      node: { instance_id: 'node:shed' } }]
  }, {
    consequence: { movement: { route_ref: 'camp-to-shed',
      source: { location_ref: 'camp' }, destination: {
        location_ref: 'shed', g5_anchor_id: 'anchor:shed',
        scene_position_id: 'position:shed' } } },
    time_update: { temporal_results: [], clock_after: state.clock },
    body_update: { state_after: {} }
  });
  assert.equal(later.position.position_id, 'position:shed');
  assert.equal(Object.hasOwn(later.position, 'g6_id'), false);
});

function pendingFirstEntryState() {
  const actor = { ref: 'fisher', instance_id: 'npc:fisher', anchor_id: null };
  return {
    position: { location_ref: 'wreck', position_id: 'position:wreck',
      g6_id: 'g6:wreck' }, npcs: [structuredClone(actor)],
    first_entry_preparation: {
      scene: { location_profile_ref: 'camp',
        node: { instance_id: 'node:camp' } },
      npcs: [{ ...actor, anchor_id: 'anchor:camp' }],
      spatial_v3: { preparation_snapshot_id: 'snapshot:camp',
        preparation_member_ordinal: 0,
        target: { status: 'pending', position_id: 'position:camp',
          g6_instance_id: 'g6:camp' } }
    },
    npc_schedule_runtime: [{ npc_id: actor.instance_id,
      current_position_node_id: null,
      causal_state_ref: { deferred_placement: {
        snapshot_id: 'snapshot:camp', member_ordinal: 0 } } }],
    clock: { whole_minutes: '0', subminute_numerator: '0',
      subminute_denominator: '1' }, body_state: {}
  };
}

function pendingFirstEntryMovement() {
  return { route_ref: 'wreck-to-camp',
    source: { location_ref: 'wreck' }, destination: {
      location_ref: 'camp', g5_anchor_id: 'anchor:camp' } };
}

test('route continuation reaches a visible NPC conversation in the same turn',
  async () => {
    const models = createM2ConversationModels();
    const scenario = await routeDirectScenario({
      scenarioBundle: currentBundle,
      ...models,
      temporalAdvanceOwner: conversationTemporalOwner({}),
      committedStateVersion: 0,
      rootText: 'Иду по тропе к стоянке рыбаков. Увидев людей, здороваюсь и спрашиваю, не знают ли они лодочника Онисима и не видели ли его после крушения.',
      continuationText: 'Увидев людей, здороваюсь и спрашиваю, не знают ли они лодочника Онисима и не видели ли его после крушения.',
      destinationPlanOverrides: {
        interpretation: {
          player_goal: 'найти лодочника Онисима после крушения',
          grounded_attempt: 'здороваюсь и спрашиваю видимого человека, не знает ли он лодочника Онисима и не видел ли его после крушения',
          adaptation: 'literal'
        },
        continuation: {
          remaining_intent: 'здороваюсь и спрашиваю, не знают ли они лодочника Онисима и не видели ли его после крушения',
          depends_on_refs: []
        }
      },
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
      'здороваюсь и спрашиваю видимого человека, не знает ли он лодочника Онисима и не видел ли его после крушения');
    assert.match(semantic.npcSemanticInput().public_conversation_history
      .at(-1).utterance_text,
      /Онисима.*после крушения/u);
    assert.equal(factual.consequence.phase3_kind, 'movement');
    assert.ok(factual.consequence.conversation?.semantic_exchange);
    const visible = semantic.narratorInput().visible_context;
    assert.match(visible.visible_scene, /^человек говорит:/u);
    assert.ok(visible.visible_changes.includes(visible.visible_scene));
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
    const decisionTrace = plans[0].appends.find(
      ({ target_table: table }) => table === 'party_npc_decision_traces');
    assert.equal(decisionTrace.record.state_version, 0);
    const contributions = plans[0].appends.filter(
      ({ target_table: table }) => table === 'party_conversation_contributions');
    assert.ok(contributions.length > 0);
    assert.ok(contributions.every(({ record }) =>
      record.party_state_version === 1 && record.session_state_version === 1));
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
