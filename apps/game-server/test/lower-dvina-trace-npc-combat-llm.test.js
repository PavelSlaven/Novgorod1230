import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateNpcCombatIntentPlan } from '@rus/npc-runtime';
import { createLowerDvinaTraceNpcCombatModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { assembleNpcCombatPlan } from
  '../src/runtime/lower-dvina-trace-combat-llm.js';
import { projectTraceCombatSubjectiveState } from
  '../src/runtime/lower-dvina-trace-combat-subjective.js';
import { projectNpcs } from
  '../src/runtime/lower-dvina-trace-player-safe-entities.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createCombatMinD65ProbeData, loadCombatMinDataPackage,
  loadCombatMinScopedBodyProfile } from
  '../src/runtime/combat-min-data.js';
import { resolveLlmExecutionConfig } from
  '../../../packages/llm-runtime/src/provider-config.js';
import { buildProviderRequestPayload } from
  '../../../packages/llm-runtime/src/provider-request.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const COMBAT_DATA = 'data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1';

async function copyCombatDataFixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'combat-min-scoped-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = resolve(root, COMBAT_DATA);
  await mkdir(directory, { recursive: true });
  for (const name of ['minimal-combat-bundle.candidate.json',
    'combat-data-approval.json', 'body-bands-production-approval-7.json']) {
    await copyFile(resolve(ROOT, COMBAT_DATA, name), resolve(directory, name));
  }
  return { root, directory };
}

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
  request.current_intent = { intent_kind: 'engage',
    target_refs: [ref('player_character', 'private-target-77')],
    status: 'active' };
  request.perceived_combat_state = {
    scope: ref('location', 'private-scope-3'),
    visible_opponents: [ref('player_character', 'private-target-77')],
    known_exits: [ref('location', 'private-exit-5')],
    visible_context: 'Воин стоит напротив.'
  };
  request.npc_subjective_state = { social_role: {}, mood: {},
    combat_experience: 'limited' };
  request.operation_contract.reachable_destination_refs = [
    ref('location', 'private-exit-5')];
  request.operation_contract.allowed_intent_kinds.push('reach');
  for (const context of [undefined, { repair: {
    original_output: { request_id: 'combat-request-1', force_limit: 'ordinary',
      operation: { target_refs: [ref('player_character', 'private-target-77')] },
      decision: { intent_summary: 'Продолжить бой.',
        grounded_goal: 'Сдержать угрозу.', adaptation: 'literal' },
      operation_choice: 'force_1', force_choice: 'operation_1',
      risk_choice: 'risk_1', reason: 'Угроза.' },
    validation_errors: ['operation_choice invalid for request combat-request-1']
  } }]) {
    const plan = await model(request, context);
    assert.equal(validateNpcCombatIntentPlan(plan, request), true);
    assert.equal(plan.request_id, request.request_id);
    assert.deepEqual(plan.npc_ref, request.npc_ref);
    assert.deepEqual(plan.operation.target_refs,
      request.operation_contract.engageable_actor_refs);
    assert.equal(plan.operation.force_limit, 'ordinary');
    assert.equal(plan.operation.risk_posture, 'ordinary');
  }
  assert.equal(calls[0].role_id, 'npc_combat_decider');
  assert.equal(calls[1].role_id, 'npc_combat_decider_format_repair');
  for (const call of calls) {
    const prompt = call.messages[0].content;
    assert.match(prompt, /Return only the NPC combat choice/u);
    assert.doesNotMatch(prompt,
      /server assembles|request identity, npc_ref|set_combat_intent operation/u);
    assert.match(prompt,
      /Choose one action, one way to use force, and one risk level from the lists\. Copy each selected key exactly as shown\./u);
    assert.doesNotMatch(prompt,
      /opaque code-owned choices|exact closed values or refs|intent_kind to refs with the required cardinality|operation contract/iu);
    assert.match(prompt, /"choice_id":"operation_1"/u);
    assert.match(prompt, /"destination_choice":"ref_2"/u);
    assert.match(prompt, /сразиться с указанным противником/u);
    assert.match(prompt, /действовать с обычной силой/u);
    assert.match(prompt, /принимать обычный риск/u);
    assert.match(prompt, /ref_1/u);
    assert.doesNotMatch(prompt, /\[\]/u);
    assert.doesNotMatch(prompt, /Copy request_id/u);
    const userMessage = call.messages.find(({ role }) => role === 'user').content;
    assert.doesNotMatch(userMessage, /\[\]/u);
    assert.match(userMessage, /Воин стоит напротив/u);
    assert.match(userMessage,
      /Доступный выход; описание пути и места неизвестно/u);
    const user = JSON.parse(userMessage);
    const projectedRequest = user.request ?? user;
    assert.equal(Object.hasOwn(projectedRequest, 'combat_situation'), false);
    assert.equal(Object.hasOwn(projectedRequest.npc_subjective_state,
      'social_role'), false);
    assert.equal(Object.hasOwn(projectedRequest.npc_subjective_state,
      'mood'), false);
    assert.equal(projectedRequest.npc_subjective_state.combat_experience,
      'боевой опыт небольшой');
    assert.equal(Object.hasOwn(projectedRequest.perceived_combat_state,
      'scope'), false);
    assert.deepEqual(projectedRequest.decision_reasons.perceived_changes,
      ['Угроза приблизилась.']);
    assert.doesNotMatch(userMessage,
      /combat-request-1|boundary-1|combat-1|npc-1|private-target-77|private-scope-3|private-exit-5|"ordinary"|force_limit|risk_posture|state_version|exchange_ordinal|decided_at|npc_ref|signal-1/u);
    if (call.role_id === 'npc_combat_decider_format_repair') {
      assert.match(userMessage, /invalid_structure/u);
      const repairInput = JSON.parse(userMessage);
      assert.equal(Object.hasOwn(repairInput.original_output,
        'operation_choice'), false);
      assert.equal(Object.hasOwn(repairInput.original_output,
        'force_choice'), false);
      assert.equal(repairInput.original_output.risk_choice, 'risk_1');
      assert.equal(repairInput.request.perceived_combat_state.known_exits[0]
        .choice_id, 'ref_2');
      assert.equal(Object.hasOwn(repairInput.request.operation_contract,
        'choices'), false);
      assert.doesNotMatch(userMessage,
        /request_id|private-target-77|"ordinary"|combat-request-1|validation_errors/u);
    } else {
      assert.doesNotMatch(userMessage,
        /ref_1|operation_1|force_1|risk_1/u);
    }
  }
});

test('ordinary and authored combat actors produce identical provider payloads', async () => {
  const fixtures = [
    { visible: 'Противник без оружия приближается.', goal: 'Защитить себя.' },
    { visible: 'У противника в руке нож.', goal: 'Не дать себя ранить.',
      equipment: [{ kind: 'weapon', condition: 'повреждён' }] },
    { visible: 'Противник поднял копьё.', goal: 'Остаться в живых.',
      currentIntent: true },
    { visible: 'Противник отступил к двери.', goal: 'Не потерять выход.',
      reachable: true },
    { visible: 'Противник опустил оружие.', goal: 'Прекратить угрозу.',
      surrender: true },
    { visible: 'Противник заслоняет проход.', goal: 'Выйти из опасности.',
      exit: true }
  ];
  const payloads = [];
  const roleRunner = { run: async (call) => {
    const resolved = resolveLlmExecutionConfig({ scope: call.scope,
      roleId: call.role_id, env: {
        LLM_API_KEY: 'offline-parity-test',
        LLM_BASE_URL: 'https://fixture.invalid'
      },
      overrides: call.overrides });
    assert.equal(resolved.enabled, true);
    payloads.push({ role: call.role_id,
      body: JSON.stringify(buildProviderRequestPayload(resolved.config,
        call.messages)) });
    return { output: { decision: { intent_summary: 'Продолжить решение.',
      grounded_goal: 'Справиться с угрозой.', adaptation: 'literal' },
    operation_choice: 'operation_1', force_choice: 'force_1',
    risk_choice: 'risk_1', combat_statement: null,
    reason: 'Угроза требует решения.' } };
  } };
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner });
  const repair = { repair: { original_output: {
    profile_ref: { entity_id: 'combat-min-materialized-npc-default-v1' },
    calibration: 'D71-private-calibration',
    reason: 'D71-private-calibration combat-min-materialized-npc-default-v1' },
    validation_errors: ['operation_choice: invalid_structure'] } };

  for (const [index, fixture] of fixtures.entries()) {
    const pair = [];
    for (const source of ['ordinary', 'authored']) {
      const request = combatRequest();
      request.request_id = `combat-${source}-${index}`;
      request.boundary_id = `boundary-${source}-${index}`;
      request.npc_ref = ref('npc', `${source}-actor-${index}`);
      request.actor_source_class = source;
      request.decision_reasons.perceived_changes = [fixture.visible];
      request.npc_subjective_state = {
        identity: { name_or_label: 'Воин' },
        goals: [fixture.goal],
        equipment: fixture.equipment ?? [],
        body_state_initialization_profile: {
          profile_ref: { entity_id: 'combat-min-materialized-npc-default-v1' },
          calibration: 'D71-private-calibration'
        }
      };
      request.perceived_combat_state = {
        visible_opponents: [ref('player_character', 'opponent-1')],
        visible_allies: [], visible_neutral_actors: [],
        known_positions: [], known_exits: [], visible_context: fixture.visible
      };
      if (fixture.currentIntent) request.current_intent = {
        intent_kind: 'engage',
        target_refs: [ref('player_character', 'opponent-1')], status: 'active'
      };
      if (fixture.reachable) {
        request.operation_contract.allowed_intent_kinds.push('reach');
        request.operation_contract.reachable_destination_refs = [
          ref('location', 'nearby-exit')];
      }
      if (fixture.surrender) {
        request.operation_contract.allowed_intent_kinds.push('surrender');
        request.operation_contract.surrender_available = true;
      }
      if (fixture.exit) {
        request.operation_contract.allowed_intent_kinds.push('break_contact');
        request.operation_contract.break_contact_destination_refs = [
          ref('location', 'known-exit')];
      }

      const before = payloads.length;
      await model(request);
      await model(request, repair);
      pair.push(payloads.slice(before));
    }
    assert.deepEqual(pair[0].map(({ role }) => role), [
      'npc_combat_decider', 'npc_combat_decider_format_repair'
    ]);
    assert.deepEqual(pair[0].map(({ body }) => body),
      pair[1].map(({ body }) => body),
      `provider payload differs by ordinary/authored source for fixture ${index + 1}`);
    for (const { body } of pair.flat()) {
      assert.doesNotMatch(body,
        /combat-min-materialized-npc-default-v1|D71-private-calibration|body_state_initialization_profile|calibration/u);
    }
  }
});

test('combat model emits a repeated visible fact only once', async () => {
  let captured;
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner: {
    run: async (request) => {
      captured = request;
      return { output: { decision: { intent_summary: 'Оценить угрозу.',
        grounded_goal: 'Защитить себя.', adaptation: 'literal' },
      operation_choice: 'operation_1', force_choice: 'force_1',
      risk_choice: 'risk_1', combat_statement: null, reason: 'Угроза.' } };
    }
  } });
  const request = combatRequest();
  request.decision_reasons.perceived_changes = ['Воин стоит напротив.'];
  request.perceived_combat_state = { visible_context: 'Воин стоит напротив.' };
  await model(request);
  const user = JSON.parse(captured.messages.find(({ role }) =>
    role === 'user').content);
  assert.equal(user.perceived_combat_state.visible_context,
    'Воин стоит напротив.');
  assert.equal(Object.hasOwn(user.decision_reasons, 'perceived_changes'), false);
});

test('NPC combat model omits stale body prose and reports unavailable metric gaps', async () => {
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
    body_state_profile: { status: 'approved', private_id: 'profile-secret' },
    body_state_initialization_profile: { schema: 'rus.body_state.initialization_profile.v1',
      profile_ref: { entity_ref: { entity_id: 'combat-min-materialized-npc-default-v1' } },
      initial_state: { health: 100, satiety: 70, energy: 80 },
      calibration: { label_internal_only: 'D71-private-calibration' } }
  } }], actor_states: { 'npc:npc-1': { body_state: {
    condition_summary: 'свежее описание', pain: 'умеренная',
    mobility: 'ограничена', usable_hands: 1,
    health: 73, satiety: 62, energy: 41,
    calibration_marker: 'internal-calibration-only'
  } } } };
  const request = combatRequest();
  request.npc_subjective_state = projectTraceCombatSubjectiveState(
    request.npc_ref, state);
  for (const context of [undefined, { repair: { original_output: {
    profile_ref: { entity_id: 'combat-min-materialized-npc-default-v1' },
    calibration: 'D71-private-calibration' },
    validation_errors: ['invalid'] } }]) {
    await model(request, context);
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    const userMessage = call.messages.find(({ role }) => role === 'user').content;
    assert.match(userMessage, /body_state_gaps/u);
    assert.match(userMessage, /Качественное описание здоровья недоступно/u);
    assert.doesNotMatch(userMessage,
      /старое описание|свежее описание|умеренная|ограничена|usable_hands/u);
    assert.doesNotMatch(userMessage,
      /"health"|"satiety"|"energy"|body_state_qualitative_metric_gap|internal-calibration-only|profile-secret|body_state_profile|combat-min-materialized-npc-default-v1|D71-private-calibration/u);
    assert.doesNotMatch(userMessage, /injury-id:closed-wound/u);
  }
});

test('player-safe NPC projection excludes init profile refs and calibration', () => {
  const projected = projectNpcs([{ instance_id: 'npc-1',
    scene_readback_present: true, profile_ref: {
      entity_id: 'combat-min-materialized-npc-default-v1' },
    body_state_initialization_profile: { profile_ref: {
      entity_id: 'combat-min-materialized-npc-default-v1' },
    calibration: 'D71-private-calibration' }, body_state: {
      health: 100, satiety: 70, energy: 80 } }], { explicitlyVisible: true });
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized,
    /combat-min-materialized-npc-default-v1|D71-private-calibration|body_state_initialization_profile|profile_ref|calibration/u);
});

test('missing qualitative body bands return per-metric typed gaps', () => {
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'устаревшее описание', pain: 'прежняя боль'
  } }], actor_states: { 'npc:npc-1': { body_state: {
    health: 73, energy: 41, satiety: 62
  } } } };
  const request = combatRequest();
  assert.deepEqual(projectTraceCombatSubjectiveState(request.npc_ref, state).body,
    { body_state_descriptions: [], body_state_gaps: [
      'health', 'energy', 'satiety'
    ].map((metric) => ({ metric,
      code: 'body_state_qualitative_metric_gap' })) });
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
  ], body_state_gaps: [] });
  const serialized = JSON.stringify(body);
  for (const forbidden of ['29', '70', '100', '17', 'private-D71',
    'band_id', 'thresholds', 'calibration']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('D65 body handoff gaps missing metrics and ignores stale prose', async () => {
  const packageData = await loadCombatMinDataPackage(ROOT);
  const probe = createCombatMinD65ProbeData(packageData);
  const state = { npcs: [{ instance_id: 'npc-1', subjective_body_state: {
    condition_summary: 'устаревшая проза' } }] };
  assert.deepEqual(projectTraceCombatSubjectiveState(ref('npc', 'npc-1'),
    state, { combatDataProbe: probe }).body, {
    body_state_descriptions: [],
    body_state_gaps: ['health', 'energy', 'satiety'].map((metric) => ({
      metric, code: 'body_state_qualitative_metric_gap'
    }))
  });
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

test('scoped body profile loader returns only the exactly approved profile', async () => {
  const loaded = await loadCombatMinScopedBodyProfile(ROOT);
  assert.equal(loaded.mode, 'runtime');
  assert.deepEqual(Object.keys(loaded).sort(), [
    'mode', 'qualitativeProfile', 'scopedProductionApproval'
  ]);
  assert.equal(loaded.qualitativeProfile.profile_id,
    'candidate.npc-body-state-description.v1');
  assert.equal(loaded.qualitativeProfile.version, 1);
  assert.equal(loaded.qualitativeProfile.status, 'candidate_not_approved');
  assert.equal(loaded.scopedProductionApproval.import_authorized, false);
  assert.equal(loaded.scopedProductionApproval.activation_authorized, false);
  assert.equal(loaded.scopedProductionApproval.bundle_production_authorized, false);
});

test('scoped body profile loader fails closed on changed bytes or approval provenance',
  async (t) => {
    const tampered = await copyCombatDataFixture(t);
    const bundlePath = resolve(tampered.directory,
      'minimal-combat-bundle.candidate.json');
    await writeFile(bundlePath, Buffer.concat([
      await readFile(bundlePath), Buffer.from(' ')
    ]));
    await assert.rejects(loadCombatMinScopedBodyProfile(tampered.root), {
      code: 'combat_min_scoped_body_profile_approval_gap'
    });

    for (const mutate of [
      (approval) => { approval.schema = 'other-schema'; },
      (approval) => { approval.repository = 'other/repository'; },
      (approval) => { approval.branch = 'other-branch'; },
      (approval) => { approval.path = 'other/bundle.json'; },
      (approval) => { approval.json_pointer = '/npc_decision/other'; },
      (approval) => { approval.verdict = 'REJECT'; },
      (approval) => { approval.approval_granted = false; },
      (approval) => { approval.import_authorized = true; },
      (approval) => { approval.activation_authorized = true; },
      (approval) => { approval.bundle_production_authorized = true; },
      (approval) => { approval.profile_id = 'other-profile'; },
      (approval) => { approval.version = 2; },
      (approval) => { approval.commit = '0'.repeat(40); },
      (approval) => { approval.approved_use.actor = 'player'; },
      (approval) => { approval.approved_use.metrics.push('body_condition'); },
      (approval) => { approval.approved_use.numeric_domain = 'any number'; },
      (approval) => { approval.approved_use.intervals[0] = '[0,30]'; },
      (approval) => {
        approval.approved_use.owner_projection_output.push('band_id');
      }
    ]) {
      const mismatched = await copyCombatDataFixture(t);
      const approvalPath = resolve(mismatched.directory,
        'body-bands-production-approval-7.json');
      const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
      mutate(approval);
      await writeFile(approvalPath, JSON.stringify(approval));
      await assert.rejects(loadCombatMinScopedBodyProfile(mismatched.root), {
        code: 'combat_min_scoped_body_profile_approval_gap'
      });
    }
  });

test('runtime body projection uses only persisted owner state and scoped bands',
  async () => {
    const combatBodyBandContext = await loadCombatMinScopedBodyProfile(ROOT);
    const actorRef = ref('npc', 'npc-1');
    const state = {
      npcs: [{ instance_id: 'npc-1', body_state: { health: 99,
        energy: 99, satiety: 99 }, body_state_persisted: false }],
      actor_states: { 'npc:npc-1': { body_state: {
        health: 20, energy: 85, satiety: 75
      }, body_state_persisted: true } }
    };
    const projected = projectTraceCombatSubjectiveState(actorRef, state,
      { combatBodyBandContext });
    assert.deepEqual(projected.body, { body_state_descriptions: [
      { metric: 'health', npc_description: 'Здоровье низкое.' },
      { metric: 'energy', npc_description: 'Запас энергии высокий.' },
      { metric: 'satiety', npc_description: 'Сытость высокая.' }
    ], body_state_gaps: [] });
    assert.equal(JSON.stringify(projected.body).includes('20'), false);

    const unpersisted = projectTraceCombatSubjectiveState(actorRef, {
      npcs: state.npcs,
      actor_states: { 'npc:npc-1': { body_state: {
        health: 20, energy: 85, satiety: 75
      }, body_state_persisted: false } }
    }, { combatBodyBandContext });
    assert.deepEqual(unpersisted.body, { body_state_descriptions: [],
      body_state_gaps: ['health', 'energy', 'satiety'].map((metric) => ({
        metric, code: 'body_state_qualitative_metric_gap'
      })) });
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
