import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnAvailableActionSet, createTurnCommandRegistry } from '@rus/turn';
import { createTraceExpansionCommands } from
  '../src/runtime/lower-dvina-trace-expansion-commands.js';
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
    spatialExpansionRuntime: runtime });
}

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
    spatialExpansionRuntime: { listExpansionOptions: async () => [candidate] },
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
