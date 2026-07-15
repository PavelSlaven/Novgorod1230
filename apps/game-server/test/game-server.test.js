import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeStage26ScreenDigest } from '@rus/contracts';
import { buildTravelPersistencePlan, persistTravelChangeSet } from '../src/infrastructure/postgres/party-store-turn.js';
import { loadRuntimeBindings } from '../src/runtime/load-bindings.js';
import { validateTravelRuntimePorts } from '../src/runtime/travel-ports.js';
import {
  createGameCompositionRoot,
  createGameHttpServer,
  createInMemorySessionStore,
  createStaticAssetResolver,
  listen,
  matchApiRoute
} from '../src/index.js';

function stage26Fixture() {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Перед тобой открывается дорога к Новгороду.',
    action_panel: { suggested_actions: [{ option_id: 'look', label: 'Осмотреться' }] },
    position_panel: { position_ref: { g1_id: 'g1-1', g2_id: 'g2-1' } },
    delivery_state: { message_id: 'message-1' }
  };
  return {
    version: 1,
    schema: 'stage26_first_game_screen_result',
    pass: true,
    request_id: 'request-1',
    party_id: 'party-1',
    transaction_id: 'tx-1',
    first_game_screen: screen,
    screen_digest: computeStage26ScreenDigest(screen),
    visible_context_package_digest: 'sha256:visible',
    narrator_output_digest: 'sha256:narrator',
    delivery_permission: {
      can_create_delivery_attempt: true,
      can_show_screen: true,
      can_accept_first_turn_intent: true
    }
  };
}

function turnResult() {
  return {
    version: 1,
    schema: 'turn_result',
    party_id: 'party-1',
    turn_id: 'turn-1',
    turn_number: 1,
    status: 'resolved',
    mode: 'attention',
    summary: { outcome: 'observed' },
    commit: { status: 'committed' },
    screen: {
      version: 1,
      schema: 'turn_screen',
      screen_status: 'ready',
      party_id: 'party-1',
      turn_id: 'turn-1',
      turn_number: 1,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: { current_position: { g1_id: 'g1-1' } },
      input_panel: { input_contract: 'intent_not_fact' },
      action_panel: { suggested_actions: [] },
      panels: {}
    }
  };
}

function createRoot() {
  return createGameCompositionRoot({
    newGameWorkflow: { run: async () => ({ status: 'approved', artifact: stage26Fixture() }) },
    turnWorkflow: { run: async () => turnResult() },
    sessionStore: createInMemorySessionStore(),
    now: () => '2026-07-12T10:00:00.000Z'
  });
}

test('composition root starts game, requires acknowledgement, and returns versioned screens', async () => {
  const root = createRoot();
  const started = await root.startNewGame({ start_text: 'Начать в Новгороде', request_id: 'request-1' });
  assert.equal(started.screen.schema, 'first_game_screen');
  await assert.rejects(() => root.submitTurn('party-1', { raw_text: 'Осматриваюсь' }), { code: 'OPENING_ACK_REQUIRED' });
  const ack = await root.acknowledgeOpening('party-1', { client_ack_id: 'ack-1' });
  assert.equal(ack.delivery_status, 'acknowledged');
  const turn = await root.submitTurn('party-1', { raw_text: 'Осматриваюсь' });
  assert.equal(turn.screen.schema, 'turn_screen');
  assert.equal(turn.turn.turn_number, 1);
});

test('HTTP server publishes only versioned /api/v1 envelopes', async (t) => {
  const server = createGameHttpServer({ root: createRoot(), maxBodyBytes: 64_000 });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.schema, 'rus_api_success');
  assert.equal(body.data.service, '@rus/game-server');
});

test('API route matcher is declarative and bounded', () => {
  assert.deepEqual(matchApiRoute('POST', '/api/v1/new-games'), { id: 'new_game', status: 201 });
  assert.equal(matchApiRoute('DELETE', '/api/v1/new-games'), null);
  assert.equal(matchApiRoute('GET', '/api/v2/health'), null);
});

test('static asset resolver serves only allowlisted web paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rus-web-'));
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'public', 'index.html'), '<h1>RUS</h1>');
  await writeFile(join(root, 'src', 'main.js'), 'export {};');
  const resolver = createStaticAssetResolver({ webRoot: root });
  assert.match((await resolver.read('/')).body.toString(), /RUS/u);
  assert.equal(await resolver.read('/../package.json'), null);
  assert.equal(await resolver.read('/secret.txt'), null);
});

test('hidden fields are blocked at the HTTP success boundary', async () => {
  const root = {
    health: () => ({ hidden_state: { secret: true } }),
    startNewGame() {}, acknowledgeOpening() {}, submitTurn() {}, getPartyScreen() {}
  };
  const server = createGameHttpServer({ root });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  server.close();
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'PUBLIC_PAYLOAD_HIDDEN_LEAK');
});

test('infrastructure adapters require explicit provider and database ports', async () => {
  const { createLlmRoleRunnerAdapter, createWorldBaseAdapter, createPartyStoreAdapter } = await import('../src/index.js');
  assert.throws(() => createWorldBaseAdapter(), /query function/u);
  assert.throws(() => createPartyStoreAdapter(), /transact function/u);
  const world = createWorldBaseAdapter({ query: async (sql, params) => ({ sql, params }) });
  await assert.rejects(() => world.read('DELETE FROM world_base', []), /read-only/u);
  const llm = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'ok', parsed_json: { approved: true }, provider: 'fixture', model: 'fixture', scope: 'turn_runtime', role_id: 'test', tier_id: 'test', durationMs: 1, config_hash: 'hash' }) });
  assert.deepEqual((await llm.run({ scope: 'turn_runtime', role_id: 'test' })).output, { approved: true });
});

test('production travel ports are explicit and fail closed', async () => {
  const ports = {
    travelContextReader: { read: async () => ({}) },
    travelRulesBundleReader: { read: async () => ({}) },
    environmentBundleReader: { read: async () => ({}) },
    journeyRepository: { read: async () => ({}) },
    environmentRepository: { read: async () => ({}) },
    routeGraphReader: { read: async () => ({}) },
    clock: { read: async () => ({}) },
    randomSourceFactory: { create: () => ({ next: () => 0 }) },
    partyStore: { commit: async () => ({}) }
  };
  assert.equal(validateTravelRuntimePorts(ports).routeGraphReader, ports.routeGraphReader);
  const missing = { ...ports };
  delete missing.routeGraphReader;
  assert.throws(() => validateTravelRuntimePorts(missing), { code: 'TRAVEL_RUNTIME_PORTS_INVALID' });

  const root = await mkdtemp(join(tmpdir(), 'rus-bindings-'));
  const modulePath = join(root, 'missing-travel-ports.mjs');
  await writeFile(modulePath, `export default async () => ({ newGameOptionsFactory: async () => ({}), turnServicesFactory: async () => ({}), stage25PostcommitProjector: async () => ({}) });`);
  await assert.rejects(() => loadRuntimeBindings(modulePath), { code: 'RUNTIME_BINDINGS_INVALID' });
});

test('travel persistence accepts one normalized journey, leg and position change set only', () => {
  const position = { position_kind: 'edge_progress', journey_id: 'journey:1', journey_leg_id: 'leg:1', edge_id: 'edge:1', from_g4_id: 'g4:a', to_g4_id: 'g4:b', progress_permille: 250, last_confirmed_g4_id: 'g4:a', g4_id: null, g5_node_id: null, g5_anchor_id: null, last_route_id: null };
  const legs = [{ leg_id: 'leg:1', sequence: 1, edge_id: 'edge:1', from_g4_id: 'g4:a', to_g4_id: 'g4:b', status: 'active', base_gu: 1, base_time_minutes: 60, route_profile_id: 'route:1', progress_permille: 250, elapsed_minutes: 15, started_at: '1230-01-01T09:00:00Z', completed_at: null, interruption_id: null }];
  const journey = { journey_id: 'journey:1', party_id: 'party:1', actor_id: 'actor:1', status: 'active', mode: 'route', origin_g4_id: 'g4:a', target_ref: { kind: 'g4', id: 'g4:b' }, intended_direction: null, pace_profile_id: 'pace:normal', movement_method: 'on_foot', current_leg_id: 'leg:1', elapsed_minutes: 15, actual_position: position, perceived_position: position, orientation_confidence: 'high', deviation_level: 'none', started_at: '1230-01-01T09:00:00Z', updated_at: '1230-01-01T09:15:00Z', world_revision_id: 'world:1', region_id: 'region:1', historical_period_id: 'period:1', travel_rules_digest: 't'.repeat(64), environment_catalog_digest: 'e'.repeat(64), algorithm_version: 'travel.v1', rng_version: 'rng:1', state_version: 4, idempotency_key: 'journey:start:1', legs };
  const plan = buildTravelPersistencePlan([
    { target: 'party_journeys', value: journey },
    { target: 'party_journey_legs', value: legs },
    { target: 'party_current_position', value: position }
  ], { party_id: 'party:1', base_state_version: 4 });
  assert.equal(plan.next_state_version, 5);
  assert.equal(plan.position.edge_id, 'edge:1');
  assert.throws(() => buildTravelPersistencePlan([{ target: 'party_journeys', value: journey }], { party_id: 'party:1', base_state_version: 4 }), { code: 'TRAVEL_WRITE_SET_INCOMPLETE' });
});

test('travel SQL writer persists journey, legs and position in one transaction scope', async () => {
  const position = { position_kind: 'edge_progress', journey_id: 'journey:1', journey_leg_id: 'leg:1', edge_id: 'edge:1', from_g4_id: 'g4:a', to_g4_id: 'g4:b', progress_permille: 250, last_confirmed_g4_id: 'g4:a', g4_id: null, g5_node_id: null, g5_anchor_id: null, last_route_id: null };
  const legs = [{ leg_id: 'leg:1', sequence: 1, edge_id: 'edge:1', from_g4_id: 'g4:a', to_g4_id: 'g4:b', status: 'active', base_gu: 1, base_time_minutes: 60, route_profile_id: 'route:1', progress_permille: 250, elapsed_minutes: 15, started_at: '1230-01-01T09:00:00Z', completed_at: null, interruption_id: null }];
  const journey = { journey_id: 'journey:1', party_id: 'party:1', actor_id: 'actor:1', status: 'active', mode: 'route', origin_g4_id: 'g4:a', target_ref: { kind: 'g4', id: 'g4:b' }, intended_direction: null, pace_profile_id: 'pace:normal', movement_method: 'on_foot', current_leg_id: 'leg:1', elapsed_minutes: 15, actual_position: position, perceived_position: position, orientation_confidence: 'high', deviation_level: 'none', started_at: '1230-01-01T09:00:00Z', updated_at: '1230-01-01T09:15:00Z', world_revision_id: 'world:1', region_id: 'region:1', historical_period_id: 'period:1', travel_rules_digest: 't'.repeat(64), environment_catalog_digest: 'e'.repeat(64), algorithm_version: 'travel.v1', rng_version: 'rng:1', state_version: 4, idempotency_key: 'journey:start:1', legs };
  const plan = buildTravelPersistencePlan([{ target: 'party_journeys', value: journey }, { target: 'party_journey_legs', value: legs }, { target: 'party_current_position', value: position }], { party_id: 'party:1', base_state_version: 4 });
  const queries = [];
  await persistTravelChangeSet({ query: async (sql, params) => { queries.push({ sql, params }); return { rowCount: 1 }; } }, plan);
  assert.equal(queries.length, 3);
  assert.match(queries[0].sql, /INSERT INTO party_runtime\.party_journeys/u);
  assert.match(queries[1].sql, /INSERT INTO party_runtime\.party_journey_legs/u);
  assert.match(queries[2].sql, /INSERT INTO party_runtime\.party_positions/u);
  assert.equal(queries[0].params[23], 5);
});
