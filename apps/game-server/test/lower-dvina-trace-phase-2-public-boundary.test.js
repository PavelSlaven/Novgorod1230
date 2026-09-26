import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { TurnWorkflowError } from '@rus/turn';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { phase2PublicResult, projectPlayerSafeChecks } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { phase2InitialCurrentVisibleContext } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-current-visible.js';
import { phase4PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection.js';
import { phase5PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-5-writes.js';
import { createGameHttpServer, listen } from '../src/index.js';
import { projectSharedSemanticExchange } from
  '../src/infrastructure/postgres/lower-dvina-trace-conversation-shared-projection.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';
import { createLowerDvinaTracePhase2PostgresRepository } from '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';

test('HTTP error never exposes an internal partial workflow checkpoint', async (t) => {
  const root = { submitTurn: async () => {
    const error = new TurnWorkflowError('TURN_WORKFLOW_STOPPED', 'private workflow', {
      checkpoint: { stages: { load_context: { hidden_state: 'must-not-reach-player' } } }
    });
    error.status = 500;
    throw error;
  } };
  const server = createGameHttpServer({ root, developerMode: true });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/parties/party-1/turns`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_text: 'Осмотреться' })
  });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(body).includes('must-not-reach-player'), false);
  assert.equal(JSON.stringify(body).includes('checkpoint'), false);
});

test('validated opening projection supplies the initial current scene', () => {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Литературная стартовая проза не становится фактом.',
    visible_context: {
      place: 'берег крушения',
      calendar: 'утро',
      environment: {
        profile_id: 'trace_ld_v1_env_cold_wet_shore',
        facts: ['cold', 'wet', 'exposed']
      }
    }
  };
  const current = phase2InitialCurrentVisibleContext({
    screen,
    openingScreenDigest: canonicalDigest(screen)
  });
  assert.deepEqual(current, {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'берег крушения',
    visible_changes: [],
    sensory_details: ['cold', 'wet', 'exposed'],
    visible_npc: [],
    visible_objects: [],
    known_context: ['берег крушения'],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  });
  assert.throws(() => phase2InitialCurrentVisibleContext({
    screen,
    openingScreenDigest: canonicalDigest({ ...screen, party_id: 'other' })
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  const unsafeScreen = { ...screen, private_knowledge: ['must-not-pass'] };
  assert.throws(() => phase2InitialCurrentVisibleContext({
    screen: unsafeScreen,
    openingScreenDigest: canonicalDigest(unsafeScreen)
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('revision 28 initial scene uses the authored presentation, not environment IDs', () => {
  const screen = {
    version: 1, schema: 'first_game_screen', screen_status: 'ready',
    party_id: 'party-28', main_prose: 'Старт.',
    visible_context: { place: 'берег крушения', calendar: 'утро',
      environment: { facts: ['cold', 'wet', 'exposed'] } }
  };
  const current = phase2InitialCurrentVisibleContext({
    screen, openingScreenDigest: canonicalDigest(screen),
    initialState: { position: { location_ref: 'shore' } },
    scenePresentation: { locations: [{ location_ref: 'shore',
      display_name: 'берег крушения',
      player_visible_physical_facts: ['Мокрый песок и ивняк тянутся вдоль берега реки.'] }] }
  });
  assert.deepEqual(current.sensory_details,
    ['Мокрый песок и ивняк тянутся вдоль берега реки.']);
  assert.equal(JSON.stringify(current).match(/cold|wet|exposed/), null);
});

test('initial scene projects persisted items and NPC appearance/equipment', () => {
  const screen = { version: 1, schema: 'first_game_screen',
    screen_status: 'ready', party_id: 'party-rich', main_prose: 'Старт.',
    visible_context: { place: 'стан', calendar: 'утро',
      environment: { facts: ['wet'] } } };
  const appearance = { build: 'average', skin_tone: 'light',
    face_shape: 'oval', hair: { color: 'dark_brown', length: 'short',
      style: 'straight', facial_hair: 'none' }, eyes: { color: 'gray' } };
  const current = phase2InitialCurrentVisibleContext({ screen,
    openingScreenDigest: canonicalDigest(screen), initialState: {
      actor_id: 'player', position: { g5_anchor_id: 'anchor' },
      environment_snapshot: { schema: 'rus.approved_initial_environment.v1',
        season: 'summer', day_part: 'daylight', light_state: 'daylight',
        weather_state: { weather_state_id: 'clear' } },
      npcs: [{ instance_id: 'npc', anchor_id: 'anchor', profile_level: 'background',
        identity_state: { public_role_label: 'рыбак', sex_category: 'male',
          age_category: 'adult', appearance }, machine_state: {
          current_activity: { summary: 'чинит сеть' } } }],
      items: [{ item_id: 'rope', template_id: 'rope-template',
        condition_state: 'serviceable', state: { display_name: 'верёвка' },
        placement: { holder_character_id: 'player', container_id: null } },
      { item_id: 'shirt', template_id: 'shirt-template',
        condition_state: 'serviceable', state: { display_name: 'рубаха' },
        placement: { holder_npc_id: 'npc', container_id: null,
          physical_position: 'equipped', equipment_slot_category_id: 'base_garment' } }]
    } });
  assert.equal(current.visible_objects[0].entity_ref.entity_id, 'rope');
  assert.deepEqual(current.visible_npc[0].observable_cues.identity.appearance,
    appearance);
  assert.equal(current.visible_npc[0].observable_cues.equipment[0].item_ref,
    'shirt');
  assert.deepEqual(current.visible_changes[0], {
    change_kind: 'environment_state', season: 'summer',
    day_part: 'daylight', light_state: 'daylight',
    weather_state_id: 'clear'
  });
});

test('canonical initial turn uses current P22 without historical scene or raw entity disclosure', async () => {
  const { perception } = await approvedNaturalPerceptionFixture({ canonical: true });
  const screen = { version: 1, schema: 'first_game_screen', screen_status: 'ready',
    party_id: 'party:1', main_prose: 'Старт.', visible_context: {
      place: 'берег крушения', calendar: 'утро', environment: { facts: ['wet'] } } };
  const initialState = { party_id: 'party:1', actor_id: 'player:1',
    scenario_id: perception.canonical_source_binding.scenario_id,
    position: { position_id: 'position:shore', g5_anchor_id: 'anchor', location_ref: 'shore' },
    npcs: [{ instance_id: 'npc:raw', anchor_id: 'anchor', identity_state: { canonical_name: 'PRIVATE_NPC_NAME' } }],
    items: [{ item_id: 'item:raw', placement: { anchor_id: 'anchor' }, state: { display_name: 'PRIVATE_ITEM_NAME' } }],
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', season: 'summer',
      light_state: 'daylight', weather_state: { weather_state_id: 'PRIVATE_WEATHER_STATE' } } };
  const input = { screen, openingScreenDigest: canonicalDigest(screen), initialState,
    canonicalInitialState: true, initialNaturalPerceptionRulePin: { key: 'initial-rule' },
    naturalScenePerceptionInput: { ...perception,
      entity_observations: [{ entity_kind: 'npc', entity_id: 'npc:raw',
        visibility: 'clear', display_label: 'человек', exterior: {
          sex_category: 'male', age_category: 'adult', appearance: { build: 'lean' },
          visible_equipment: [] } }] },
    scenePresentation: { locations: [{ location_ref: 'shore', display_name: 'берег крушения',
      player_visible_physical_facts: ['PRIVATE_LEGACY_SCENE'] }] } };
  const current = phase2InitialCurrentVisibleContext(input);
  assert.equal(current.visible_scene, perception.scene.visible_scene);
  assert.ok(current.sensory_details.length > 0);
  assert.equal(current.visible_npc[0].display_label, 'человек');
  assert.deepEqual(current.visible_npc[0].observable_cues.identity.appearance,
    { build: 'lean' });
  assert.equal(current.visible_npc[0].observable_cues.identity.display_name, undefined);
  assert.equal(current.visible_npc.length, 1);
  assert.deepEqual(current.visible_objects, []);
  assert.deepEqual(current.visible_changes, []);
  assert.equal(/PRIVATE_|крушения|canonical_source_binding|payload_digest/u.test(JSON.stringify(current)), false);
  const dark = structuredClone(perception);
  dark.observer.visual_capability = 'none';
  assert.deepEqual(phase2InitialCurrentVisibleContext({ ...input,
    naturalScenePerceptionInput: { ...dark, entity_observations: [] } }).sensory_details, []);
  assert.throws(() => phase2InitialCurrentVisibleContext({ ...input,
    naturalScenePerceptionInput: null }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  for (const key of ['party_id', 'actor_id', 'position_id', 'scenario_id']) {
    const wrong = structuredClone(perception);
    wrong.canonical_source_binding[key] = 'wrong';
    assert.throws(() => phase2InitialCurrentVisibleContext({ ...input,
      naturalScenePerceptionInput: wrong }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
  const sceneSource = structuredClone(perception);
  sceneSource.canonical_source_binding = { ...sceneSource.canonical_source_binding,
    schema: 'rus.verified_canonical_scene_natural_source.v1',
    g5_site_id: sceneSource.scene.site_id,
    baseline_id: sceneSource.scene.baseline_id, source_slot_key: 'arrival' };
  assert.throws(() => phase2InitialCurrentVisibleContext({ ...input,
    naturalScenePerceptionInput: sceneSource }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
});

test('canonical start without initial rule uses exact verified current scene source', async () => {
  const { input } = await approvedNaturalPerceptionFixture({ canonical: true });
  input.currentFacts.canonical_source_binding = {
    schema: 'rus.verified_canonical_scene_natural_source.v1', verified: true,
    party_id: 'party:1', actor_id: 'player:1', position_id: 'position:shore',
    g5_site_id: 'site', baseline_id: 'baseline', source_slot_key: 'arrival'
  };
  const perception = prepareG4NaturalScenePerceptionInput(input);
  const screen = { version: 1, schema: 'first_game_screen', screen_status: 'ready',
    party_id: 'party:1', main_prose: 'Старт.', visible_context: {
      place: 'старое место', calendar: 'утро', environment: { facts: [] } } };
  const args = { screen, openingScreenDigest: canonicalDigest(screen),
    initialState: { party_id: 'party:1', actor_id: 'player:1',
      position: { position_id: 'position:shore' } },
    canonicalInitialState: true, naturalScenePerceptionInput: { ...perception,
      entity_observations: [] } };
  const current = phase2InitialCurrentVisibleContext(args);
  assert.equal(current.visible_scene, perception.scene.visible_scene);
  assert.equal(JSON.stringify(current).includes('старое место'), false);
  const initialSource = structuredClone(perception);
  initialSource.canonical_source_binding = { ...initialSource.canonical_source_binding,
    schema: 'rus.verified_canonical_initial_natural_source.v1',
    scenario_id: 'scenario:other' };
  assert.throws(() => phase2InitialCurrentVisibleContext({ ...args,
    initialState: { ...args.initialState, scenario_id: 'scenario:other' },
    naturalScenePerceptionInput: initialSource }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  for (const key of ['party_id', 'actor_id', 'position_id', 'g5_site_id',
    'baseline_id', 'source_slot_key']) {
    const wrong = structuredClone(perception);
    wrong.canonical_source_binding[key] = key === 'source_slot_key' ? '' : 'wrong';
    assert.throws(() => phase2InitialCurrentVisibleContext({ ...args,
      naturalScenePerceptionInput: wrong }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
  assert.throws(() => prepareG4NaturalScenePerceptionInput({ ...input,
    currentFacts: { ...input.currentFacts, canonical_source_binding: {
      ...input.currentFacts.canonical_source_binding, source_slot_key: 'wrong' } } }),
  { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
});

test('canonical initial turn cannot fall back when its binding or perception callback is absent', async () => {
  const schema = 'rus.authored_start_initial_party_snapshot.v3';
  const pin = { key: 'initial-natural-rule', revision: 1, digest: 'a'.repeat(64) };
  for (const resolver of [null, () => ({ snapshot_schema: schema }),
    () => ({ snapshot_schema: schema, initial_natural_perception_rule_pin: pin }),
    () => ({ snapshot_schema: schema, initial_natural_perception_rule_pin: { ...pin, revision: 2 } })]) {
    let reads = 0;
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: { async connect() { throw new Error('unexpected fallback'); },
        async query() { reads += 1; return { rowCount: 1, rows: [{
          delivery_ack_result: { pass: true }, party_state_version: 0,
          state_payload: { schema, initial_spatial_v3: { canonical_scene_proposal: {} },
            policy_profile_pins: [pin] }, stage26_result: {} }] }; } },
      committer: { async commit() { throw new Error('unexpected write'); } },
      authoredRuntimeBindingResolver: resolver
    });
    await assert.rejects(repository.loadPhase2State('party:1'), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
    assert.equal(reads, 1);
  }
});

test('public Phase 2 check omits private RNG audit', () => {
  const payload = {
    party_id: 'party-1',
    actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    last_turn: {
      option_id: 'inspect',
      check_result: {
        check_id: 'check-1',
        roll: 10,
        total: 12,
        outcome: { success: true },
        audit: { seed_ref: 'private', algorithm: 'mulberry32_v1' }
      },
      time_update: null,
      body_update: null,
      consequence: {}
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal(Object.hasOwn(result.check, 'audit'), false);
  assert.deepEqual(detectHiddenLeaks(result), []);
});

test('public conversation check omits private RNG audit', () => {
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    conversation_statements: [{
      statement_id: 'statement-1',
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      utterance_text: 'Иди по тропе.'
    }],
    conversation_audiences: [{
      statement_ref: {
        entity_kind: 'conversation_statement', entity_id: 'statement-1'
      },
      received_messages: [{
        listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
        comprehension: 'full', utterance_text: 'Иди по тропе.'
      }]
    }],
    last_turn: {
      option_id: 'talk', check_result: null, time_update: null,
      body_update: null,
      consequence: { conversation: {
        npc_id: 'npc-1', npc_ref: 'eremey_fisher',
        activity_ref: 'trace_ld_v1_activity_first_eremey_talk',
        check_result: { roll: 12, audit: { seed_ref: 'private' } },
        semantic_exchange_projection: {
          factual_status: 'applied', response_kind: 'route_disclosure',
          npc_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
          statement_refs: [{
            entity_kind: 'conversation_statement', entity_id: 'statement-1'
          }],
          route_disclosure: { route_ref: 'route-1' }
        }
      } }
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal(Object.hasOwn(result.conversation.check_result, 'audit'), false);
  assert.equal(result.conversation.npc_id, 'npc-1');
  assert.equal(Object.hasOwn(result.conversation, 'npc_ref'), false);
  assert.equal(Object.hasOwn(result.conversation, 'activity_ref'), false);
  assert.deepEqual(detectHiddenLeaks(result), []);
});

test('player leave lifecycle projects without inventing a statement reference', () => {
  const semantic = projectSharedSemanticExchange({
    exchange: { applied_contribution_count: 1,
      time_budget: { status: 'completed' }, contributions: [{
        conversation_id: 'conversation-1', exchange_id: 'exchange-1',
        speaker_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
        contribution_kind: 'leave_conversation'
      }] }, decision_request: null, decision_boundary: null,
    decision_plan: null, resumed_npc_execution: null, statements: [],
    terminal_npc_outcomes: []
  });
  assert.equal(semantic.player_contribution_kind, 'leave_conversation');
  assert.deepEqual(semantic.statement_refs, []);
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    conversation_statements: [], conversation_audiences: [],
    last_turn: { option_id: 'talk', check_result: null, time_update: null,
      body_update: null, consequence: { conversation: {
        semantic_exchange_projection: semantic
      } } }
  };
  assert.deepEqual(phase2PublicResult({ payload,
    screen: { schema: 'screen' } }).conversation.semantic_exchange, {
    response_kind: 'leave_conversation', npc_utterance: null,
    disclosed_route_ref: null
  });
  for (const mutate of [
    (value) => value.statement_refs.push({
      entity_kind: 'conversation_statement', entity_id: 'forged' }),
    (value) => { value.player_contribution_kind = 'forged'; }
  ]) {
    const forged = structuredClone(payload);
    mutate(forged.last_turn.consequence.conversation
      .semantic_exchange_projection);
    assert.throws(() => phase2PublicResult({ payload: forged,
      screen: { schema: 'screen' } }), TypeError);
  }
});

test('public conversation does not reveal an NPC lie classification', () => {
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    conversation_statements: [{
      statement_id: 'statement-1',
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      utterance_text: 'Не видел я его.'
    }],
    conversation_audiences: [{
      statement_ref: {
        entity_kind: 'conversation_statement', entity_id: 'statement-1'
      },
      received_messages: [{
        listener_ref: {
          entity_kind: 'player_character', entity_id: 'player-1'
        },
        comprehension: 'full', utterance_text: 'Не видел я его.'
      }]
    }],
    last_turn: { option_id: 'talk', check_result: null, time_update: null,
      body_update: null, consequence: { conversation: {
        semantic_exchange_projection: {
          factual_status: 'applied', response_kind: 'lie',
          npc_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
          statement_refs: [{
            entity_kind: 'conversation_statement', entity_id: 'statement-1'
          }], route_disclosure: null
        }
      } } }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.deepEqual(result.conversation.semantic_exchange, {
    response_kind: 'speech', npc_utterance: 'Не видел я его.',
    disclosed_route_ref: null
  });
  assert.doesNotMatch(JSON.stringify(result), /lie/u);
});

test('public time projection never exposes the prepared execution ledger', () => {
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    last_turn: {
      option_id: 'rest', check_result: null, body_update: null,
      time_update: {
        owner: '@rus/time-events-history', schema: 'turn_time_update',
        version: 2,
        clock_before: clock('10'), clock_after: clock('40'),
        exact_elapsed: {
          exact_minutes: { numerator: '30', denominator: '1' }
        },
        boundary_trace: { processed_boundary_ids: [] },
        nearest_boundary: null,
        prepared_effect_ledger: {
          slices: [{ consequence: {
            check_result: { audit: { seed_ref: 'private' } }
          } }]
        }
      },
      consequence: {}
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal('prepared_effect_ledger' in result.time_update, false);
  assert.equal('boundary_trace' in result.time_update, false);
  assert.equal(result.time_update.clock_after.whole_minutes, '40');
  assert.deepEqual(detectHiddenLeaks(result), []);
});

test('screen check projection preserves generic order and excludes NPC combat', () => {
  const result = (checkId, roll) => ({
    check_id: checkId, roll,
    modifiers: { attribute: 2, skill: 1, state: -1, equipment: 0,
      circumstances: 0 }, total: roll + 2, difficulty: 15,
    outcome: { band: roll >= 13 ? 'success' : 'success_with_cost',
      margin: roll - 13, success: roll >= 13, cost_required: roll < 13,
      severe_failure: false, roll_note: null },
    audit: { seed_ref: 'private' }
  });
  const payload = {
    actor_id: 'player-1', player_profile: { identity: { name: 'Микула' } },
    last_turn: { raw_text: 'Пробраться к двери и открыть её.',
      turn_step_commit: { checks: { results: [result('step-1', 12),
        result('step-2', 14)] }, loop_trace: { step_traces: [
        { applied: true, check_binding: { check_id: 'step-1' },
          approved_plan: { interpretation: { grounded_attempt:
            'Тихо пробраться к двери' }, check: {
            attribute_ref: 'dexterity', skill_ref: 'stealth' } } },
        { applied: true, check_binding: { check_id: 'step-2' },
          approved_plan: { interpretation: { grounded_attempt:
            'Открыть тяжёлую дверь' }, check: {
            attribute_ref: 'strength', skill_ref: null } } }
      ] } }, consequence: { combat: {
        check_results: [result('combat-check:player-step', 17),
          result('combat-check:npc-step', 18)],
        exchange: { technical_steps: [{ proposal_id: 'player-step',
          actor_ref: { entity_kind: 'player_character', entity_id: 'player-1' } },
        { proposal_id: 'npc-step',
          actor_ref: { entity_kind: 'npc', entity_id: 'npc-1' } }] }
      } } }
  };
  const checks = projectPlayerSafeChecks(payload);
  assert.deepEqual(checks.map(({ ordinal, action_label: action }) =>
    [ordinal, action]), [[1, 'Тихо пробраться к двери'],
    [2, 'Открыть тяжёлую дверь'],
    [3, 'Пробраться к двери и открыть её.']]);
  assert.deepEqual(checks.map(({ consequence_label }) => consequence_label), [
    'Итог проверки: частичный результат с ценой.',
    'Итог проверки: успех.',
    'Итог проверки: успех.'
  ]);
  assert.equal(checks[0].modifiers[0].label,
    'Характеристика: Ловкость');
  assert.equal(checks[0].modifiers[1].label, 'Навык: Скрытность');
  assert.equal(JSON.stringify(checks).includes('npc-step'), false);
  assert.equal(JSON.stringify(checks).includes('seed_ref'), false);
});

test('screen check projection labels below-DC cost result as partial', () => {
  const checks = projectPlayerSafeChecks({
    actor_id: 'player-1', player_profile: { identity: { name: 'Микула' } },
    last_turn: { raw_text: 'Перепрыгнуть канаву.', consequence: {},
      check_result: {
        check_id: 'check-1', roll: 8, difficulty: 12, total: 10,
        modifiers: { attribute: 2, skill: 1, state: -1, equipment: 0,
          circumstances: 0 },
        outcome: { band: 'success_with_cost', margin: -2, success: false,
          cost_required: true, severe_failure: false, roll_note: null }
      } }
  });
  assert.deepEqual(checks[0].outcome, {
    band: 'success_with_cost', margin: -2, success: false,
    cost_required: true, severe_failure: false, roll_note: null
  });
  assert.equal(checks[0].consequence_label,
    'Итог проверки: частичный результат с ценой.');
});

test('screen check projection includes Phase 4 negotiation and Phase 5 treatment', () => {
  const check = (checkId, band) => ({
    check_id: checkId, roll: 16,
    modifiers: { attribute: 2, skill: 1, state: 0, equipment: 0,
      circumstances: 0 }, total: 19, difficulty: 15,
    outcome: { band, margin: 4, success: true, cost_required: false,
      severe_failure: false, roll_note: null },
    audit: { seed_ref: 'private' }
  });
  const payload = (consequence) => ({
    actor_id: 'player-1', player_profile: { identity: { name: 'Микула' } },
    last_turn: { raw_text: 'Помочь спутнику.', consequence }
  });
  const negotiation = projectPlayerSafeChecks(payload({ negotiation: {
    check_result: check('phase-4-check', 'success')
  } }));
  const treatment = projectPlayerSafeChecks(payload({ treatment: {
    check_result: check('phase-5-check', 'clean_success')
  } }));

  assert.deepEqual(negotiation.map(({ action_label, consequence_label }) =>
    [action_label, consequence_label]), [[
    'Помочь спутнику.', 'Итог проверки: успех.'
  ]]);
  assert.deepEqual(treatment.map(({ action_label, consequence_label }) =>
    [action_label, consequence_label]), [[
    'Помочь спутнику.', 'Итог проверки: чистый успех.'
  ]]);
  const pendingArgs = (state, turnId) => ({
    state: { ...state, opening_identity: { opening_screen_digest: 'opening' } },
    factual: { mode_resolution: { turn_id: turnId } },
    visibleEnvelope: { package_id: `visible:${turnId}`,
      package_digest: 'package', visible_payload: {
        perceived_scene: 'лагерь', perceived_changes: [], sensory_details: [],
        visible_npcs: [], visible_objects: [], known_context: [],
        uncertainties: []
      } },
    turnNumber: 1, nextVersion: 1
  });
  assert.deepEqual(phase4PendingScreen(pendingArgs(payload({ negotiation: {
    check_result: check('phase-4-check', 'success')
  } }), 'phase-4-turn')).checks, negotiation);
  assert.deepEqual(phase5PendingScreen(pendingArgs(payload({ treatment: {
    check_result: check('phase-5-check', 'clean_success')
  } }), 'phase-5-turn')).checks, treatment);
  assert.equal(JSON.stringify([negotiation, treatment]).includes('seed_ref'),
    false);
});

function clock(wholeMinutes) {
  return {
    whole_minutes: wholeMinutes,
    subminute_numerator: '0', subminute_denominator: '1'
  };
}
