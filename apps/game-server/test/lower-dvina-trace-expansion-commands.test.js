import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnAvailableActionSet, createTurnCommandRegistry } from '@rus/turn';
import { createTraceExpansionCommands } from
  '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { selectedTurnStepOperation, turnStepOperationChoices } from
  '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { canonicalDigest } from '@rus/materialization';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';
import { errorEnvelope } from '../src/http/contracts.js';
import LIVE_WORLD_TURN_PROFILE from
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };

const state = { party_id: 'party:expansion', actor_id: 'actor:traveller',
  party_state: { state_version: 4 },
  position: { g5_anchor_id: 'site:shore', location_ref: 'shore' } };
const candidate = { directional_exit_id: 'exit:woods',
  display_label: 'Продолжить путь по тропе в лес.' };

async function commands(runtime, current = state) {
  return createTraceExpansionCommands({ state: current,
    requestId: 'request:walk', inputDigest: 'input:digest',
    spatialExpansionRuntime: runtime == null ? null
      : { listApproachOptions: async () => [], ...runtime } });
}

test('the free phrase "иду к руслу" resolves to the one exit disclosed with that pass-target text (step 3)',
  async () => {
    // spatial-v3-current-visibility-provider.js resolved and disclosed this text already;
    // the command layer must carry it verbatim into the visible operation, unparsed.
    const passTarget = { directional_exit_id: 'exit:channel', display_label: 'к руслу' };
    const [command] = await commands({ listExpansionOptions: async () => [passTarget] });
    assert.equal(command.reason_visible_to_actor, 'к руслу');
    assert.equal(command.label, 'к руслу');
    const operation = command.semantic_binding.operation_dto;
    assert.equal(operation.description, 'к руслу');
    // The planner reads this description text ("к руслу") to ground free text like
    // "Иду к руслу" onto this exact operation - proven at the binding, not by re-parsing raw_text.
    // matches() ignores whatever description the model echoes back (cosmetic, not compared);
    // only the structural fields decide the binding.
    assert.equal(command.semantic_binding.matches({ operation: { ...operation } }), true);
    assert.equal(command.semantic_binding.matches({
      operation: { ...operation, target_ref: 'exit:other' } }), false);
  });

const localOption = (edgeId, destination_status = 'open') => ({ edge_id: edgeId,
  display_label: 'Проход 1', action_units: 1, destination_status });

test('the approach asks the expansion owner only about first steps the local-scene owner lists, and carries the first step status (F3)',
  async () => {
    let asked = null;
    const localScene = { listLocalOptions: async () => [localOption('edge:1', 'occupied'),
      localOption('edge:2')], prepareLocalMovement: async () => null };
    const commandList = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async (input) => {
          asked = input;
          return [{ directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' }]; } },
      spatialLocalSceneRuntime: localScene });
    assert.deepEqual(asked.firstStepEdgeIds, ['edge:1', 'edge:2']);
    const [approach] = commandList;
    assert.deepEqual(approach.semantic_grounding, { destination_status: 'occupied' });
    assert.match(approach.label, /\(проход занят\)$/);
    assert.match(approach.semantic_binding.operation_dto.description, /\(проход занят\)$/);
  });

test('an approach whose first step the local-scene owner does not list is a typed gap, not a command (F3)',
  async () => {
    await assert.rejects(createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [{ directional_exit_id: 'exit:channel', edge_id: 'edge:ghost',
          display_label: 'к руслу' }] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        prepareLocalMovement: async () => null } }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  });

test('a reachable-but-not-yet-at-departure exit offers its approach through the local-scene owner, not a second one (A-B1-06)',
  async () => {
    const approach = { directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' };
    let prepared = null;
    const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
    const [command] = await createTraceExpansionCommands({ state,
      requestId: 'request:walk', inputDigest: 'input:digest',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [approach] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        async prepareLocalMovement(input) { prepared = input; return consequence; } } });
    assert.equal(command.label, 'к руслу — подход к переправе');
    assert.equal(command.target_id, 'edge:1');
    const operation = command.semantic_binding.operation_dto;
    assert.equal(operation.movement_kind, 'local');
    assert.equal(operation.target_ref, 'edge:1');
    const result = await command.consequence({ retrievedState: state, playerInput: 'иду к руслу' });
    assert.equal(result, consequence);
    assert.equal(prepared.edgeId, 'edge:1');
    assert.equal(prepared.partyId, state.party_id);
    assert.equal(prepared.actorId, state.actor_id);
  });

test('the approach and the plain local command for the same edge never both claim one operation', async () => {
  const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
  const localScene = { async listLocalOptions() { return [{ edge_id: 'edge:1', display_label: 'Проход 1',
    action_units: 1, destination_status: 'open' }]; }, prepareLocalMovement: async () => consequence };
  const [approach] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [{ directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' }] },
    spatialLocalSceneRuntime: localScene });
  const [plain] = await createTraceLocalSceneCommands({ state, inputDigest: 'd', spatialLocalSceneRuntime: localScene });
  const bindings = [approach, plain].map((command) => command.semantic_binding);
  for (const own of bindings) {
    const claiming = bindings.filter((binding) => binding.matches({ operation: own.operation_dto }));
    assert.equal(claiming.length, 1, 'exactly one binding must claim each operation');
    assert.equal(claiming[0], own);
  }
});

test('a candidate crossing is not offered while only an approach is reachable', async () => {
  const approach = { directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' };
  const commandList = await createTraceExpansionCommands({ state,
    requestId: 'request:walk', inputDigest: 'input:digest',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [approach] },
    spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
      prepareLocalMovement: async () => packageBase({
        inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }) } });
  assert.equal(commandList.length, 1);
  assert.equal(commandList[0].command_id, 'live_world.approach_directional_exit:exit:channel');
});

test('approved exit is a selectable exact server operation; topology input is IDs only',
  async () => {
    const calls = [];
    const consequence = packageBase({ inputDigest: 'a'.repeat(64),
      duration: 1, kind: 'movement' });
    const runtime = {
      async listExpansionOptions(input) {
        assert.deepEqual(input, { partyId: state.party_id, actorId: state.actor_id });
        return [candidate, { directional_exit_id: 'exit:meadow',
          display_label: 'Пройти к открытому лугу.' }];
      },
      async prepareExpansion(input) {
        calls.push(['expansion', input]);
        return { ok: true, site_connection_id: 'connection:generated' };
      },
      async prepareTraversal(input) {
        calls.push(['traversal', input]);
        return consequence;
      }
    };
    const definitions = await commands(runtime);
    const registry = createTurnCommandRegistry(definitions);
    const actions = await createTurnAvailableActionSet({ registry,
      committedState: state, actorId: state.actor_id, policyPins: [] });
    assert.equal(actions.options.length, 2);
    const choices = turnStepOperationChoices({ available_domain_operations:
      definitions.map(({ semantic_binding: binding }) => binding.operation_dto) });
    const selected = selectedTurnStepOperation({
      operation_choice: choices[0].choice_id, operation_family: 'request_movement'
    }, choices);
    const command = definitions[0];
    assert.deepEqual(command.writeTargets(), []);
    assert.equal(command.semantic_binding.matches(selected), true);
    assert.equal(command.semantic_binding.matches({ operation: {
      ...selected.operation, description: 'Иду по лесной тропе' } }), true);
    assert.equal(command.matches({ raw_text: candidate.display_label }), false);
    const playerInput = { request_id: 'request:walk',
      topology_payload: { forged: true }, directional_exit_id: 'exit:forged' };
    assert.equal(await command.consequence({ retrievedState: state, playerInput }),
      consequence);
    assert.deepEqual(calls[0], ['expansion', { partyId: state.party_id,
      actorId: state.actor_id, directionalExitId: candidate.directional_exit_id,
      requestId: 'request:walk' }]);
    assert.equal(calls[1][0], 'traversal');
    assert.equal(calls[1][1].expansion.site_connection_id, 'connection:generated');
    assert.equal(calls[1][1].inputDigest, 'input:digest');
    for (const changed of [
      { target_ref: 'exit:forged' }, { route_ref: 'exit:forged' },
      { actor_ref: 'actor:other' }, { topology_payload: {} }
    ]) assert.equal(command.semantic_binding.matches({ operation: {
      ...selected.operation, ...changed } }), false);
  });

test('missing traversal owner rejects before topology mutation', async () => {
  let prepared = 0;
  const [command] = await commands({ listExpansionOptions: async () => [candidate],
    prepareExpansion: async () => { prepared += 1; return { ok: true }; } });
  await assert.rejects(command.consequence({ retrievedState: state }),
    { code: 'LIVE_WORLD_TRAVERSAL_OWNER_MISSING' });
  assert.equal(prepared, 0);
});

test('stale source and rejected expansion never reach traversal', async () => {
  let prepared = 0, traversed = 0;
  const [command] = await commands({ listExpansionOptions: async () => [candidate],
    prepareExpansion: async () => { prepared += 1; return { ok: false }; },
    prepareTraversal: async () => { traversed += 1; } });
  for (const stale of [
    { ...state, party_state: { state_version: 5 } },
    { ...state, position: { ...state.position, g5_anchor_id: 'site:other' } },
    { ...state, actor_id: 'actor:other' }
  ]) {
    assert.equal(command.availability({ committed_state: stale }).can_attempt, false);
    await assert.rejects(command.consequence({ retrievedState: stale }),
      { code: 'LIVE_WORLD_EXPANSION_SOURCE_STALE' });
  }
  assert.equal(prepared, 0);
  await assert.rejects(command.consequence({ retrievedState: state }),
    { code: 'LIVE_WORLD_EXPANSION_PREPARATION_FAILED' });
  assert.equal(prepared, 1);
  assert.equal(traversed, 0);
});

test('rejected expansion keeps its public code but carries the adapter reason server-side',
  async () => {
    const [command] = await commands({ listExpansionOptions: async () => [candidate],
      prepareExpansion: async () => ({ ok: false, error: {
        code: 'authoring_dependency_pin_missing',
        subject_ref: { entity_kind: 'world_revision', entity_id: 'secret-world-revision' },
        dependency_pins: { pins: [{ entity_ref: {
          entity_kind: 'expansion_slot', entity_id: 'secret-slot-42' } }] },
        diagnostics: { reason: 'exact_expansion_request_required' } } }),
      prepareTraversal: async () => { throw new Error('must not reach traversal'); } });
    await assert.rejects(command.consequence({ retrievedState: state }), (error) => {
      assert.equal(error.code, 'LIVE_WORLD_EXPANSION_PREPARATION_FAILED');
      assert.equal(error.details.diagnostics.reason, 'exact_expansion_request_required');
      const publicError = errorEnvelope(error);
      assert.equal(publicError.status, 409);
      assert.deepEqual(Object.keys(publicError.body.error), ['code', 'message']);
      assert.equal(JSON.stringify(publicError.body).includes('secret-'), false);
      return true;
    });
  });

test('different adapter reasons surface as distinct server-side diagnostics under the same public code',
  async () => {
    for (const reason of ['exact_expansion_request_required', 'committed_source_baseline_required']) {
      const [command] = await commands({ listExpansionOptions: async () => [candidate],
        prepareExpansion: async () => ({ ok: false, error: {
          code: 'spatial_candidate_gap', diagnostics: { reason } } }),
        prepareTraversal: async () => { throw new Error('must not reach traversal'); } });
      await assert.rejects(command.consequence({ retrievedState: state }), (error) => {
        assert.equal(error.code, 'LIVE_WORLD_EXPANSION_PREPARATION_FAILED');
        assert.equal(error.details.diagnostics.reason, reason);
        return true;
      });
    }
  });

test('missing or ambiguous approved exit identity is a typed data gap', async () => {
  for (const options of [null, [{}], [{ ...candidate, display_label: '' }],
    [candidate, candidate]]) {
    await assert.rejects(commands({ listExpansionOptions: async () => options }),
      { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  }
  assert.deepEqual(await commands({ listExpansionOptions: async () => [] }), []);
  assert.deepEqual(await commands(null), []);
});

for (const status of ['restrained', 'incapacitated']) test(
  `exit while ${status} has blocked command availability`, async () => {
    const current = { ...state, combat_sessions: [{ status: 'paused_for_player',
      participant_states: [{ actor_ref: { entity_kind: 'player_character',
        entity_id: state.actor_id }, combat_status: status }] }] };
    const [command] = await commands({ listExpansionOptions: async () => [candidate] }, current);
    assert.deepEqual(command.availability({ committed_state: current }), {
      version: 1, schema: 'turn_availability_decision', status: 'blocked',
      can_attempt: false, reasons: ['actor_movement_blocked'], check_requests: [] });
  });

test('restrained free-text movement commits a blocked zero-minute turn', async () => {
  const bundle = await loadScenarioBundle(13);
  const seed = fixture({ scenarioBundle: bundle, materializationBundle: bundle });
  const current = structuredClone(seed.state);
  current.scenario_id = 'authored:unseen-woodland';
  current.combat_sessions = [{ combat_id: 'combat:restrained',
    status: 'paused_for_player', scope_ref: { entity_kind: 'location',
      entity_id: current.position.location_ref },
    participant_refs: [{ entity_kind: 'player_character',
      entity_id: current.actor_id }], exchange_ordinal: 0,
    player_response_required: true,
    participant_states: [{ actor_ref: { entity_kind: 'player_character',
      entity_id: current.actor_id }, combat_status: 'restrained' }] }];
  const f = fixture({ committedState: current,
    authoredTurnProfile: { profile: LIVE_WORLD_TURN_PROFILE, pin: {
      artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
      revision: LIVE_WORLD_TURN_PROFILE.revision,
      digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
    } },
    spatialExpansionRuntime: { listExpansionOptions: async () => [candidate], listApproachOptions: async () => [] },
    turnStepModel(request) {
      return { schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: 'Иду по тропе',
          grounded_attempt: 'Иду по тропе', adaptation: 'literal' },
        resolution: 'direct', goal_result: 'not_achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        operations: [], check: null, continuation: null, clarification: null,
        direct_result_kind: null, reason_code: 'actor_movement_blocked',
        reason: 'Actor cannot move while restrained.' };
    }
  });
  const beforeClock = structuredClone(f.state.clock);
  const beforePosition = structuredClone(f.state.position);
  await f.runtime.submitTurn({ partyId: f.partyId,
    input: { request_id: 'restrained:walk', raw_text: 'Иду по тропе.' } });
  const consequence = f.lastWritePlan().turn_step_commit.consequence;
  assert.equal(consequence.status, 'blocked');
  assert.equal(consequence.duration_minutes, 0);
  assert.deepEqual(consequence.state_changes, []);
  assert.equal(f.state.last_turn.consequence.status, 'blocked');
  assert.deepEqual(f.narratorInput().context.outcome, { movement_blocked: true });
  assert.deepEqual(f.state.clock, beforeClock);
  assert.deepEqual(f.state.position, beforePosition);
});

test('official exit action reports known movement denial without moving or advancing time',
  async () => {
    const bundle = await loadScenarioBundle(13);
    const seed = fixture({ scenarioBundle: bundle, materializationBundle: bundle });
    const current = structuredClone(seed.state);
    current.scenario_id = 'authored:unseen-woodland';
    const f = fixture({ committedState: current,
      authoredTurnProfile: { profile: LIVE_WORLD_TURN_PROFILE, pin: {
        artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
        revision: LIVE_WORLD_TURN_PROFILE.revision,
        digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
      } },
      spatialExpansionRuntime: {
        listApproachOptions: async () => [],
        listExpansionOptions: async () => [candidate],
        prepareExpansion: async () => ({ ok: true }),
        prepareTraversal: async () => { throw Object.assign(
          new Error('Персонаж сейчас не может двигаться.'),
          { code: 'SPATIAL_V3_MOVEMENT_DENIED', status: 409 }); }
      },
      turnStepModel(request) {
        const selected = request.available_domain_operations.find((operation) =>
          operation.route_ref === candidate.directional_exit_id);
        return { schema: 'turn_step_plan_v1', request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision, step_index: request.step_index,
          interpretation: { player_goal: 'пройти по лесной тропе',
            grounded_attempt: 'пройти по видимому выходу', adaptation: 'literal' },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [selected], check: null, continuation: null,
          clarification: null, direct_result_kind: null,
          reason_code: 'approved_exit', reason: 'Follow the supplied visible exit.' };
      }
    });
    const beforePosition = structuredClone(f.state.position);
    const beforeClock = structuredClone(f.state.clock);
    await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
      request_id: 'expansion:denied', raw_text: 'Иду дальше по лесной тропе.'
    } }), (error) => {
      assert.equal(error.code, 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED');
      assert.equal(error.cause.code, 'SPATIAL_V3_MOVEMENT_DENIED');
      const publicError = errorEnvelope(error);
      assert.equal(publicError.status, 409);
      assert.equal(publicError.body.error.movement_status, 'movement_denied');
      assert.equal(publicError.body.error.turn_commit_status, 'topology_committed');
      assert.equal(publicError.body.error.actor_moved, false);
      assert.equal(publicError.body.error.time_advanced, false);
      return true;
    });
    assert.deepEqual(f.state.position, beforePosition);
    assert.deepEqual(f.state.clock, beforeClock);
  });

for (const topologyCommitted of [false, true]) test(topologyCommitted
  ? 'public traversal refusal preserves committed topology without moving actor or advancing time'
  : 'public authored turn exposes the approved exit and rejects an unwired traversal without commit',
  async () => {
    const bundle = await loadScenarioBundle(13);
    const seed = fixture({ scenarioBundle: bundle, materializationBundle: bundle });
    const current = structuredClone(seed.state);
    current.scenario_id = 'authored:unseen-woodland';
    let prepared = 0;
    const f = fixture({ committedState: current,
      authoredTurnProfile: { profile: LIVE_WORLD_TURN_PROFILE, pin: {
        artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
        revision: LIVE_WORLD_TURN_PROFILE.revision,
        digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
      } },
      spatialExpansionRuntime: {
        listApproachOptions: async () => [],
        listExpansionOptions: async () => [candidate],
        prepareExpansion: async () => { prepared += 1; return { ok: true }; },
        ...(topologyCommitted ? { prepareTraversal: async () => {
          throw Object.assign(new Error('Private route admission evidence.'),
            { code: 'ROUTE_CAPACITY_UNAVAILABLE' });
        } } : {})
      },
      turnStepModel(request) {
        const selected = request.available_domain_operations.find((operation) =>
          operation.route_ref === candidate.directional_exit_id);
        assert.ok(selected);
        return { schema: 'turn_step_plan_v1', request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision, step_index: request.step_index,
          interpretation: { player_goal: 'пройти по лесной тропе',
            grounded_attempt: 'пройти по видимому выходу', adaptation: 'literal' },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [selected], check: null, continuation: null,
          clarification: null, direct_result_kind: null,
          reason_code: 'approved_exit', reason: 'Follow the supplied visible exit.' };
      }
    });
    const beforePosition = structuredClone(f.state.position);
    const beforeClock = structuredClone(f.state.clock);
    await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
      request_id: 'expansion:public', raw_text: 'Иду дальше по лесной тропе.'
    } }), (error) => {
      assert.equal(error.code, topologyCommitted
        ? 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED'
        : 'LIVE_WORLD_TRAVERSAL_OWNER_MISSING');
      const response = errorEnvelope(error).body.error;
      assert.equal(error.turn_commit_status,
        topologyCommitted ? 'topology_committed' : 'not_started');
      assert.equal(response.turn_commit_status,
        topologyCommitted ? 'topology_committed' : 'not_started');
      assert.equal(response.topology_status,
        topologyCommitted ? 'topology_committed' : undefined);
      assert.equal(response.movement_status,
        topologyCommitted ? 'movement_denied' : undefined);
      if (topologyCommitted) {
        assert.equal(response.actor_moved, false);
        assert.equal(response.time_advanced, false);
        assert.equal(error.cause.code, 'ROUTE_CAPACITY_UNAVAILABLE');
        assert.equal(error.details.reason_code, 'ROUTE_CAPACITY_UNAVAILABLE');
        assert.equal(JSON.stringify(response).includes('Private route'), false);
      }
      return true;
    });
    assert.equal(f.turnStepCount(), 1);
    assert.equal(prepared, topologyCommitted ? 1 : 0);
    assert.equal(f.commitCount(), 0);
    assert.deepEqual(f.state.position, beforePosition);
    assert.deepEqual(f.state.clock, beforeClock);
  });
