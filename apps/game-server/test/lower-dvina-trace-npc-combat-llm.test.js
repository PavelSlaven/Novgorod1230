import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcCombatIntentPlan } from '@rus/npc-runtime';
import { createLowerDvinaTraceNpcCombatModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { assembleNpcCombatPlan } from
  '../src/runtime/lower-dvina-trace-combat-llm.js';
import { projectTraceCombatSubjectiveState } from
  '../src/runtime/lower-dvina-trace-combat-subjective.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createCombatMinD65ProbeData, loadCombatMinDataPackage } from
  '../src/runtime/combat-min-data.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function combatRequest() {
  return {
    schema: 'npc_combat_decision_request_v1', request_id: 'combat-request-1',
    boundary_id: 'boundary-1', state_version: '2', combat_id: 'combat-1',
    exchange_ordinal: 0,
    decided_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['self'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Угроза приблизилась.'] },
    current_intent: null, npc_subjective_state: {}, perceived_combat_state: {},
    relevant_memory: [], operation_contract: {
      allowed_intent_kinds: ['engage'],
      engageable_actor_refs: [ref('player_character', 'player-1')],
      controllable_actor_refs: [], protectable_refs: [], holdable_scope_refs: [],
      reachable_destination_refs: [], break_contact_destination_refs: [],
      allowed_force_limits: ['ordinary'], allowed_risk_postures: ['ordinary'],
      surrender_available: false, cease_hostility_available: false,
      combat_statement_available: false
    }
  };
}

test('combat model assembles code-owned intent DTO for primary and repair', async () => {
  const calls = [];
  const output = { decision: { intent_summary: 'Сдержать противника.',
    grounded_goal: 'Не дать ему приблизиться.', adaptation: 'literal' },
  operation_choice: 'operation_1',
  force_choice: 'force_1', risk_choice: 'risk_1',
  combat_statement: null, reason: 'Он представляет угрозу.' };
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner: {
    run: async (request) => { calls.push(request); return { output }; }
  } });
  const request = combatRequest();
  for (const context of [undefined, { repair: { original_output: {},
    validation_errors: ['invalid'] } }]) {
    const plan = await model(request, context);
    assert.equal(validateNpcCombatIntentPlan(plan, request), true);
    assert.equal(plan.request_id, request.request_id);
    assert.deepEqual(plan.npc_ref, request.npc_ref);
    assert.deepEqual(plan.operation.target_refs,
      request.operation_contract.engageable_actor_refs);
  }
  assert.equal(calls[0].role_id, 'npc_combat_decider');
  assert.equal(calls[1].role_id, 'npc_combat_decider_format_repair');
  for (const call of calls) {
    const prompt = call.messages[0].content;
    assert.match(prompt, /Return only the semantic NPC combat choice/u);
    assert.match(prompt, /"choice_id":"operation_1"/u);
    assert.doesNotMatch(prompt, /Copy request_id/u);
  }
});

test('NPC combat model receives qualitative own body, not numeric profile metadata', async () => {
  const calls = [];
  const output = { decision: { intent_summary: 'Удержать противника.',
    grounded_goal: 'Защитить себя.', adaptation: 'literal' },
  operation_choice: 'operation_1', force_choice: 'force_1', risk_choice: 'risk_1',
  combat_statement: null, reason: 'Угроза.' };
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner: {
    run: async (request) => { calls.push(request); return { output }; }
  } });
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'старое описание', pain: 'умеренная', mobility: 'ограничена',
    usable_hands: 1, active_conditions: ['injury-id:closed-wound'], health: 73, satiety: 62,
    energy: 41, calibration_marker: 'internal-calibration-only',
    body_state_profile: { status: 'approved', private_id: 'profile-secret' }
  } }], actor_states: { 'npc:npc-1': { body_state: {
    condition_summary: 'свежее описание', pain: 'умеренная',
    mobility: 'ограничена', usable_hands: 1,
    health: 73, satiety: 62, energy: 41,
    calibration_marker: 'internal-calibration-only'
  } } } };
  const request = combatRequest();
  request.npc_subjective_state = projectTraceCombatSubjectiveState(
    request.npc_ref, state);
  for (const context of [undefined, { repair: { original_output: {},
    validation_errors: ['invalid'] } }]) {
    await model(request, context);
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    const userMessage = call.messages.find(({ role }) => role === 'user').content;
    assert.match(userMessage, /свежее описание/u);
    assert.doesNotMatch(userMessage, /старое описание/u);
    assert.match(userMessage, /умеренная/u);
    assert.match(userMessage, /ограничена/u);
    assert.match(userMessage, /usable_hands/u);
    assert.doesNotMatch(userMessage,
      /"health"|"satiety"|"energy"|internal-calibration-only|profile-secret|body_state_profile/u);
    assert.doesNotMatch(userMessage, /injury-id:closed-wound/u);
  }
});

test('missing qualitative body bands return NPC-scoped typed gap', () => {
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'устаревшее описание', pain: 'прежняя боль'
  } }], actor_states: { 'npc:npc-1': { body_state: {
    health: 73, energy: 41, satiety: 62
  } } } };
  const request = combatRequest();
  assert.throws(() => projectTraceCombatSubjectiveState(request.npc_ref, state),
    (error) => error.code === 'TRACE_COMBAT_SUBJECTIVE_BODY_GAP'
      && error.details.actor_ref.entity_id === 'npc-1');
});

test('D65 body handoff uses candidate package bands and excludes stale prose', async () => {
  const packageData = await loadCombatMinDataPackage(ROOT);
  const probe = createCombatMinD65ProbeData(packageData);
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'устаревшая проза с числом 17', pain: 'старое'
  } }], actor_states: { 'npc:npc-1': { body_state: {
    health: 29, energy: 70, satiety: 100, calibration: 'private-D71'
  } } } };
  const body = projectTraceCombatSubjectiveState(ref('npc', 'npc-1'), state,
    { combatDataProbe: probe }).body;
  assert.deepEqual(body, { body_state_descriptions: [
    { metric: 'health', npc_description: 'Здоровье низкое.' },
    { metric: 'energy', npc_description: 'Запас энергии высокий.' },
    { metric: 'satiety', npc_description: 'Сытость высокая.' }
  ] });
  const serialized = JSON.stringify(body);
  for (const forbidden of ['29', '70', '100', '17', 'private-D71',
    'band_id', 'thresholds', 'calibration']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('D65 body handoff fails closed without current body and ignores stale prose', async () => {
  const packageData = await loadCombatMinDataPackage(ROOT);
  const probe = createCombatMinD65ProbeData(packageData);
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'устаревшая проза' } }] };
  assert.throws(() => projectTraceCombatSubjectiveState(ref('npc', 'npc-1'),
    state, { combatDataProbe: probe }),
  (error) => error.code === 'TRACE_COMBAT_SUBJECTIVE_BODY_GAP');
});

test('combat data package stays off in runtime and body init uses only test DTO', async () => {
  const packageData = await loadCombatMinDataPackage(ROOT);
  assert.deepEqual(packageData.production_activation, { enabled: false,
    reason: 'combat_min_production_activation_not_authorized' });
  const probe = createCombatMinD65ProbeData(packageData);
  assert.equal(probe.productionActivationEnabled, false);
  const initialized = await import('@rus/body-state').then(({ initializeBodyState }) =>
    initializeBodyState({ body_state_profile: {
      schema: probe.bodyInitializationProfileFixture.schema,
      status: probe.bodyInitializationProfileFixture.status,
      profile_ref: probe.bodyInitializationProfileFixture.profile_ref,
      initial_state: probe.bodyInitializationProfileFixture.initial_state
    } }));
  assert.equal(initialized.ok, true);
  assert.deepEqual(initialized.body_state, { health: 100, satiety: 70, energy: 80 });
  const bodyInitialization = packageData.bundle.execution.health_transition
    .body_initialization.owner_initialization_profile_adapter;
  assert.equal(bodyInitialization.candidate_emission, null);
});

test('combat assembly does not default omitted semantic operation or statement', () => {
  const request = combatRequest();
  const plan = assembleNpcCombatPlan({ decision: {
    intent_summary: 'Сдержать противника.', grounded_goal: 'Не подпустить.',
    adaptation: 'literal' },
  force_choice: 'force_1', risk_choice: 'risk_1', reason: 'Угроза.' }, request);
  assert.equal(plan.operation, undefined);
  assert.equal(plan.combat_statement, undefined);
  assert.notEqual(validateNpcCombatIntentPlan(plan, request), true);
});

test('combat operation choice binds exactly one admitted target', () => {
  const request = combatRequest();
  request.operation_contract.engageable_actor_refs.push(
    ref('npc', 'npc-2'));
  const plan = assembleNpcCombatPlan({ decision: {
    intent_summary: 'Сдержать второго противника.',
    grounded_goal: 'Не дать ему приблизиться.', adaptation: 'literal' },
  operation_choice: 'operation_2', force_choice: 'force_1',
  risk_choice: 'risk_1', combat_statement: null, reason: 'Он ближе.' }, request);
  assert.deepEqual(plan.operation.target_refs, [ref('npc', 'npc-2')]);
  assert.equal(validateNpcCombatIntentPlan(plan, request), true);
});
