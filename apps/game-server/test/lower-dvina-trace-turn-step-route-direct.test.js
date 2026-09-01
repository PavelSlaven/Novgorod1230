import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBodyCommitted,
  commit,
  minutesBetween,
  routeBoundaryScenario,
  routeDirectScenario,
  submit
} from './lower-dvina-trace-turn-step-route-fixture.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTraceKnownRouteCommands, routeCandidates } from
  '../src/runtime/lower-dvina-trace-known-route-command.js';
import { createTracePhase3VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { validateAuthoritativePreparedRoute } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-authority.js';

test('generic camp-to-shed prepared route binds its resolved destination zone', () => {
  const state = { clock: { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' }, position: { location_ref: 'camp',
    g5_anchor_id: 'camp-anchor' } };
  const route = { consequence: { phase3_kind: 'movement', duration_minutes: 8,
    generic_known_route: true, body_effect_ref: null, movement: {
      owner: '@rus/movement-routes', activity_ref: 'route-camp-shed',
      route_ref: 'route-camp-shed', source: { location_ref: 'camp',
        g5_anchor_id: 'camp-anchor' }, destination: { location_ref: 'shed',
        g5_anchor_id: 'shed-anchor', zone_ref: 'shed_approach' },
      result: { route_id: 'route-camp-shed', elapsed_minutes: 8 } } },
    time_update: { owner: '@rus/time-events-history', clock_before: state.clock,
      exact_elapsed: { exact_minutes: { numerator: '8', denominator: '1' } } } };
  const contracts = { route: { route_id: 'route-camp-shed', duration_minutes: 8 },
    movement: { profile_id: 'route-camp-shed', duration_minutes: 8 },
    ids: { campLocation: 'shed' }, campAnchor: 'shed-anchor',
    destinationZone: 'shed_approach', routeBodyEffect: null };
  validateAuthoritativePreparedRoute({ route, state, phase3Contracts: contracts });
  route.consequence.movement.destination.zone_ref = 'forged-zone';
  assert.throws(() => validateAuthoritativePreparedRoute({ route, state,
    phase3Contracts: contracts }),
  { code: 'TRACE_TURN_STEP_PREPARED_EFFECT_RECONCILIATION_FAILED' });
});

test('revision 13 route then direct semantic activity commits one ordered t9 root',
  async () => {
    const scenario = await routeDirectScenario();
    const { semantic, input, first, writePlan, factual } = scenario;
    const ledger = factual.time_update.prepared_effect_ledger;
    assert.equal(semantic.turnStepCount(), 2);
    assert.deepEqual(ledger.slices.map(({ step_index: stepIndex }) => stepIndex),
      [1, 2]);
    assert.equal(factual.consequence.duration_minutes, 9);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      factual.time_update.clock_after), 9);

    const plans = [];
    await commit(writePlan, scenario, plans);
    assert.equal(plans.length, 1);
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(minutesBetween(factual.time_update.clock_before,
      snapshot.route_history.at(-1).ended_at), 8);
    assert.deepEqual(snapshot.clock, factual.time_update.clock_after);
    assertBodyCommitted(snapshot.body_state, factual.body_update.state_after);
    const direct = snapshot.turn_step_activity_history.at(-1);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      direct.owner_resolution.execution.started_at), 8);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      direct.owner_resolution.execution.ended_at), 9);

    const replayed = await submit(semantic, input);
    assert.deepEqual(replayed, first);
    assert.equal(semantic.turnStepCount(), 2);
    assert.equal(semantic.commitCount(), 1);
  });

test('route commit persists no interlocutor portrait from its planner trace',
  async () => {
    const scenario = await routeDirectScenario({ plannerPortrait: true });
    for (const traces of [scenario.writePlan.turn_step_commit.loop_trace.step_traces,
      scenario.writePlan.turn_step_commit.mode_resolution.decision_trace.step_traces]) {
      const interlocutor = traces[0].plan_request.player_safe_state
        .active_interlocutor;
      assert.deepEqual(interlocutor, {
        entity_ref: { entity_kind: 'npc', entity_id: 'npc:visible' },
        display_label: 'Visible interlocutor'
      });
    }
    const plans = [];
    await commit(scenario.writePlan, scenario, plans);
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(snapshot.position.location_ref, 'trace_ld_v1_loc_fishing_camp');
    assert.deepEqual(snapshot.clock, scenario.factual.time_update.clock_after);
  });

test('P16 still rejects a portrait outside the persisted interlocutor path',
  async () => {
    const scenario = await routeDirectScenario();
    const forged = structuredClone(scenario.writePlan);
    for (const traces of [forged.turn_step_commit.loop_trace.step_traces,
      forged.turn_step_commit.mode_resolution.decision_trace.step_traces]) {
      traces[0].plan_request.player_safe_state.portrait_spec_v1 = {
        schema: 'portrait_spec_v1'
      };
    }
    forged.command_trace = structuredClone(
      forged.turn_step_commit.mode_resolution.decision_trace);
    forged.write_targets.find(({ target }) => target === 'party_state').value
      .mode_resolution = structuredClone(forged.turn_step_commit.mode_resolution);
    await assert.rejects(() => commit(forged, scenario, []), (error) => {
      assert.equal(error.code, 'TRACE_PHASE_3_WRITE_PLAN_REJECTED');
      return true;
    });
  });

test('route-only commit preserves one exact deferred second-step boundary',
  async (t) => {
    for (const resolution of ['domain_request', 'generic_check']) {
      await t.test(resolution, async () => {
        const scenario = await routeBoundaryScenario(resolution);
        const { semantic, writePlan, factual } = scenario;
        const ledger = factual.time_update.prepared_effect_ledger;
        const traces = writePlan.turn_step_commit.loop_trace.step_traces;
        assert.equal(semantic.turnStepCount(), 2);
        assert.equal(semantic.rollCount(), 0);
        assert.equal(ledger.slices.length, 1);
        assert.equal(traces.length, 2);
        assert.equal(traces[1].resolution, resolution);
        assert.equal(traces[1].applied, false);
        assert.equal(traces[1].player_response_boundary, true);
        assert.equal(writePlan.write_targets.some(
          ({ target }) => target === 'party_turn_step_operations'), false);

        const plans = [];
        await commit(writePlan, scenario, plans);
        const snapshot = plans[0].inserts.find(
          ({ target_table: table }) => table === 'party_state_snapshots')
          .record.state_payload;
        assert.equal(minutesBetween(factual.time_update.clock_before,
          snapshot.route_history.at(-1).ended_at), 8);
        assert.equal(minutesBetween(factual.time_update.clock_before,
          snapshot.clock), 8);
      });
    }
  });

test('a known reverse route is offered and committed once without an authored command',
  async () => {
    const bundle = await loadScenarioBundle(13);
    const seed = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, rollValue: 0.99 });
    const state = structuredClone(seed.state);
    const shed = state.prepared_scenes.find(({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_old_drying_shed');
    state.position = { ...state.position,
      location_ref: shed.location_profile_ref,
      g5_anchor_id: shed.anchor.instance_id,
      zone_ref: shed.anchor.state.zone_ref };
    state.route_knowledge = ['trace_ld_v1_route_shed_to_camp'];
    const ratsha = state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'ratsha_storehouse_helper');
    assert.ok(ratsha);
    ratsha.location_ref = shed.location_profile_ref;
    ratsha.identity_state = { ...ratsha.identity_state,
      canonical_name: 'Ратша', appearance: { ...ratsha.identity_state?.appearance,
        build: 'средний' } };
    ratsha.player_safe_presentation = { emotion: 'настороженность' };
    state.visible_context = { visible_scene: 'У старого сарая.', visible_npc: [{
      entity_ref: { entity_kind: 'npc', entity_id: ratsha.instance_id },
      display_label: 'Ратша'
    }] };
    state.conversation_sessions = [{ schema: 'conversation_session_v1',
      conversation_id: 'shed-conversation', status: 'active',
      location_ref: { entity_kind: 'location', entity_id: shed.location_profile_ref },
      active_participant_refs: [{ entity_kind: 'player_character',
        entity_id: state.actor_id }, { entity_kind: 'npc', entity_id: ratsha.instance_id }],
      last_contribution_ref: { entity_kind: 'conversation_statement',
        entity_id: 'shed-ratsha-statement' }
    }];
    state.conversation_statements = [{ statement_id: 'shed-ratsha-statement',
      conversation_id: 'shed-conversation', speaker_ref: {
        entity_kind: 'npc', entity_id: ratsha.instance_id } }];
    const before = structuredClone(state);
    const scenario = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state, rollValue: 0.99,
      playerSafeStateProjector(input) {
        const projected = projectLowerDvinaTracePlayerSafeState(input);
        const interlocutor = projected.player_safe_state.active_interlocutor;
        if (interlocutor == null) return projected;
        return { ...projected, player_safe_state: {
          ...projected.player_safe_state,
          active_interlocutor: {
            ...interlocutor,
            portrait_spec_v1: { schema: 'portrait_spec_v1' }
          }
        } };
      },
      turnStepModel(request) {
        if (request.step_index === 2) {
          assert.equal(request.player_safe_state.position.location_ref,
            'trace_ld_v1_loc_fishing_camp');
          assert.equal(request.player_safe_state.active_interlocutor, undefined);
          return {
            schema: 'turn_step_plan_v1', request_id: request.request_id,
            committed_state_version: request.committed_state_version,
            working_revision: request.working_revision, step_index: request.step_index,
            interpretation: { player_goal: request.root_player_action,
              grounded_attempt: request.remaining_intent, adaptation: 'literal' },
            resolution: 'direct', goal_result: 'achieved',
            activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
            operations: [], check: null, continuation: null, clarification: null,
            reason_code: 'complete_at_destination', reason: 'complete'
          };
        }
        const operation = request.available_domain_operations.find(
          ({ route_ref: routeRef }) => routeRef === 'trace_ld_v1_route_shed_to_camp');
        assert.ok(operation);
        assert.deepEqual(request.player_safe_state.active_interlocutor, {
          entity_ref: { entity_kind: 'npc', entity_id: ratsha.instance_id },
          display_label: 'Ратша', portrait_spec_v1: { schema: 'portrait_spec_v1' }
        });
        return {
          schema: 'turn_step_plan_v1', request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision, step_index: request.step_index,
          interpretation: { player_goal: request.root_player_action,
            grounded_attempt: request.root_player_action, adaptation: 'literal' },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [operation], check: null, continuation: {
            remaining_intent: 'осмотреться у рыбацкого стана',
            depends_on_refs: ['trace_ld_v1_loc_fishing_camp'] },
          clarification: null, reason_code: 'known_route', reason: 'known route'
        };
      } });
    const input = { request_id: 'known-route-reverse',
      idempotency_key: 'known-route-reverse', raw_text: 'Иду обратно к рыбакам.' };
    const first = await submit(scenario, input);
    assert.equal(scenario.state.position.location_ref,
      'trace_ld_v1_loc_fishing_camp');
    assert.equal(scenario.state.route_history.at(-1).route_ref,
      'trace_ld_v1_route_shed_to_camp');
    assert.equal(scenario.turnStepCount(), 2);
    const persistedInterlocutor = scenario.lastWritePlan().turn_step_commit
      .loop_trace.step_traces[0].plan_request.player_safe_state.active_interlocutor;
    assert.deepEqual(persistedInterlocutor, {
      entity_ref: { entity_kind: 'npc', entity_id: ratsha.instance_id },
      display_label: 'Ратша'
    });
    const plans = [];
    await commit(scenario.lastWritePlan(), { semantic: scenario, before }, plans);
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(snapshot.route_history.filter(({ route_ref: routeRef }) =>
      routeRef === 'trace_ld_v1_route_shed_to_camp').length, 1);
    const capacity = plans[0].commit_rechecks.find(({ kind }) => kind === 'capacity');
    assert.deepEqual(capacity.expected_present_npcs, before.npcs.filter((npc) =>
      npc.anchor_id === snapshot.position.g5_anchor_id
        && npc.location_profile_ref === snapshot.position.location_ref
    ).map((npc) => ({ npc_id: npc.instance_id,
      participant_slot_ref: npc.participant_slot_ref })));
    const replay = await submit(scenario, input);
    assert.deepEqual(replay, first);
    assert.equal(scenario.commitCount(), 1);
  });

test('known-route candidates admit a prepared first-entry scene and keep parallel routes distinct',
  async () => {
    const bundle = await loadScenarioBundle(13);
    const seed = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, rollValue: 0.99 });
    const state = structuredClone(seed.state);
    const contracts = resolveTracePhase3Contracts({ state, bundle });
    const camp = state.prepared_scenes.find(({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_fishing_camp');
    state.prepared_scenes = state.prepared_scenes.filter((scene) =>
      scene.location_profile_ref !== camp.location_profile_ref);
    state.first_entry_preparation = { spatial_v3: {
      target: { status: 'prepared' } }, scene: structuredClone(camp) };
    const shed = state.prepared_scenes.find(({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_old_drying_shed');
    state.position = { ...state.position, location_ref: shed.location_profile_ref,
      g5_anchor_id: shed.anchor.instance_id, zone_ref: shed.anchor.state.zone_ref };
    state.route_knowledge = ['trace_ld_v1_route_shed_to_camp'];
    assert.deepEqual(routeCandidates({ state, contracts }).map(({ route }) =>
      route.route_id), ['trace_ld_v1_route_shed_to_camp']);

    const full = structuredClone(contracts);
    const fullCapacity = full.capacityContracts.find(({ location_ref: ref }) =>
      ref === camp.location_profile_ref);
    const fullZone = fullCapacity.zones.find(({ zone_id: id }) =>
      id === camp.anchor.state.zone_ref);
    fullZone.max_actors = state.npcs.filter((npc) =>
      npc.anchor_id === camp.anchor.instance_id
        && npc.location_profile_ref === camp.location_profile_ref).length;
    assert.deepEqual(routeCandidates({ state, contracts: full }), []);

    const disallowed = structuredClone(state);
    disallowed.npcs.push({ instance_id: 'unseen-destination-npc',
      participant_slot_ref: 'unseen_destination_slot',
      anchor_id: camp.anchor.instance_id,
      location_profile_ref: camp.location_profile_ref,
      zone_ref: camp.anchor.state.zone_ref });
    assert.deepEqual(routeCandidates({ state: disallowed, contracts }), []);

    const parallel = structuredClone(contracts);
    const forward = parallel.routeBindings.find(({ route_id: id }) =>
      id === 'trace_ld_v1_route_camp_to_shed');
    const reverse = parallel.routeBindings.find(({ route_id: id }) =>
      id === 'trace_ld_v1_route_shed_to_camp');
    parallel.routeBindings.push({ ...forward, route_id: 'parallel-forward',
      reverse_route_ref: 'parallel-reverse' }, { ...reverse,
      route_id: 'parallel-reverse', reverse_route_ref: 'parallel-forward' });
    parallel.routePins.push({ ...parallel.routePins.find(({ id }) =>
      id === reverse.route_id), id: 'parallel-reverse' });
    state.route_knowledge.push('parallel-reverse');
    assert.deepEqual(routeCandidates({ state, contracts: parallel }).map(
      ({ route }) => route.route_id).sort(),
    ['parallel-reverse', 'trace_ld_v1_route_shed_to_camp']);
  });

test('generic known route awaits matching authored route availability', async () => {
  const bundle = await loadScenarioBundle(13);
  const seed = fixture({ scenarioBundle: bundle,
    materializationBundle: bundle, rollValue: 0.99 });
  const state = structuredClone(seed.state);
  const contracts = resolveTracePhase3Contracts({ state, bundle });
  const shed = state.prepared_scenes.find(({ location_profile_ref: ref }) =>
    ref === 'trace_ld_v1_loc_old_drying_shed');
  state.position = { ...state.position, location_ref: shed.location_profile_ref,
    g5_anchor_id: shed.anchor.instance_id, zone_ref: shed.anchor.state.zone_ref };
  state.route_knowledge = ['trace_ld_v1_route_shed_to_camp'];
  const generic = (authoredCommands) => createTraceKnownRouteCommands({ state,
    contracts, inputDigest: 'test', authoredCommands }).find(({ semantic_binding: binding }) =>
    binding.operation_dto.route_ref === 'trace_ld_v1_route_shed_to_camp');
  const authored = (canAttempt) => [{ semantic_binding: { operation: 'request_movement',
    operation_dto: { target_ref: 'trace_ld_v1_loc_fishing_camp' } },
  availability: async () => ({ can_attempt: canAttempt, status: canAttempt ? 'ready' : 'blocked',
    check_requests: [] }) }];
  assert.equal((await generic(authored(true)).availability({ committed_state: state }))
    .can_attempt, false);
  assert.equal((await generic(authored(false)).availability({ committed_state: state }))
    .can_attempt, true);
  assert.equal((await generic([]).availability({ committed_state: state })).can_attempt,
    true);
  await assert.rejects(() => generic([{ semantic_binding: {
    operation: 'request_movement', operation_dto: {
      target_ref: 'trace_ld_v1_loc_fishing_camp' } },
  availability: async () => { throw new Error('authored availability failed'); } }])
    .availability({ committed_state: state }), /authored availability failed/u);
});

test('generic known-route projection does not fabricate the fishing camp', async () => {
  const projector = createTracePhase3VisibleProjector({
    phase2Projector: { project: async () => assert.fail('phase2 fallback') },
    contracts: { actors: [] }
  });
  const visible = await projector.project({ consequence: {
    phase3_kind: 'movement', generic_known_route: true, movement: {
      route_ref: 'unseen_route', destination: {
        location_ref: 'unseen_destination', display_name: 'незнакомая пристань' }
    }
  } });
  assert.deepEqual(visible, {
    version: 1, schema: 'visible_context_package',
    visible_scene: 'незнакомая пристань',
    visible_changes: ['unseen_route:completed'], sensory_details: [],
    visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: []
  });
});
