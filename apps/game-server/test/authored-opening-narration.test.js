import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisibleContextAuditApproval,
  computeVisibleContextPackageDigest } from '@rus/contracts';
import { buildAuthoredOpeningVisibleContext,
  auditAuthoredOpeningContext, auditOpeningReaderAssessments, buildLowerDvinaTraceOpeningScreen } from
  '../src/runtime/lower-dvina-trace-opening.js';
import { createAuthoredOpeningNarrationService } from
  '../src/runtime/authored-opening-narration.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { startLowerDvinaTrace } from '../src/runtime/lower-dvina-trace-public-start.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { buildCanonicalOpeningVisibleContext } from '../src/runtime/canonical-opening-context.js';
import { projectG4NaturalPerception } from '../src/runtime/g4-natural-perception.js';

const checks = ['schema_and_structure', 'visible_context_compliance',
  'new_fact_check', 'npc_check', 'item_check', 'container_check',
  'door_exit_route_check', 'time_light_weather_check', 'position_check',
  'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
  'rumor_uncertainty_check', 'action_options_check', 'technical_text_check',
  'literary_composition_check', 'must_include_check',
  'must_not_include_check', 'commit_readiness'];

test('authored opening package answers all reader controls from persisted refs', () => {
  const pkg = openingPackage();
  assert.equal(pkg.opening_reader_control.pass, true);
  assert.deepEqual(Object.values(pkg.opening_reader_control.checks),
    Array(8).fill(true));
  assert.equal(pkg.visible_npcs.length, 2);
  assert.equal(pkg.visible_items[0].label, 'верёвка');
  assert.equal(pkg.visible_exits.length, 2);
  assert.equal(JSON.stringify(pkg).includes('hidden'), true,
    'explicit do-not-include boundary remains present');
  assert.equal(JSON.stringify(pkg).includes('Тайный'), false);
});

test('opening reader control fails without a persisted immediate interaction', () => {
  assert.equal(auditAuthoredOpeningContext({
    mustInclude: ['identity', 'preceding_context', 'people', 'current_event',
      'goal_stake', 'surroundings', 'body', 'directions_interactions']
      .map((category) => ({ category, text: category })),
    visibleNpcs: [{}], visibleItems: [], localStructure: {
      interior_position_ref: 'position:inside'
    }, knownFacts: ['one', 'two']
  }).pass, false);
});

test('rich environment remains prose evidence without violating screen vocabulary', () => {
  const visible = { party_id: 'party:1', player: { name: 'Любава',
    social_status: { display_name: 'рыбачка' } }, position: { g4_id: 'g4',
    g5_node_id: 'g5', g5_anchor_id: 'anchor' },
    timestamp: { whole_minutes: '1' },
    body: { health: 92, energy: 71, satiety: 66 }, environment: {
      environment_profile_id: 'env.local_variable',
      facts: ['Светлое позднелетнее утро.',
        'Слышны течение и работа на берегу.'] } };
  const screen = buildLowerDvinaTraceOpeningScreen({ visible,
    approvedProjection: { scenario_id: 'vikhtuy_fishing_camp_v1',
      opening_projection: { version: 1, schema: 'first_game_screen',
        visible_field_allowlist: ['party_id', 'player.name',
          'player.social_status', 'position', 'timestamp', 'body',
          'environment'], place_label: 'стан', calendar_label: 'дата',
        opening_prose: 'hint' } },
    openingProse: 'Любава готовит рыбацкий стан к работе.' });
  assert.deepEqual(screen.visible_context.environment.facts, []);
});

test('authored opening uses Stage 22 writer and Stage 23 auditor', async () => {
  const pkg = openingPackage();
  const digest = computeVisibleContextPackageDigest(pkg);
  const approval = buildVisibleContextAuditApproval({ request_id: 'opening:1',
    pass: true, visible_context_package_digest: digest,
    visible_context_audit: { request_id: 'opening:1', pass: true,
      visible_context_package_digest: digest },
    commit_permission: { can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true } });
  const roles = [];
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      roles.push(call.role_id);
      if (call.role_id === 'gameplay_narrator') return { output: {
        version: 1, schema: 'narrator_starting_prose',
        request_id: 'opening:1', prose_status: 'drafted',
        prose: 'Любава, рыбачка, с рассвета готовит стан вместе с братом.\n\nПеред ней берег, навес и работа до вечера.',
        action_options: [], used_visible_context_refs: [], block_reason: null,
        self_constraints_check: Object.fromEntries([
          'used_only_visible_context', 'did_not_add_new_world_facts',
          'did_not_reveal_hidden_state', 'preserved_time_weather_light',
          'preserved_position', 'rumors_remain_rumors',
          'uncertainty_remains_uncertain'
        ].map((key) => [key, true]))
      } };
      if (call.role_id === 'gameplay_narrator_auditor') return { output: {
        version: 1, schema: 'narrator_prose_audit', request_id: 'opening:1',
        pass: true,
        checks: Object.fromEntries(checks.map((key) => [key, { pass: true }])),
        concerns: [], evidence: ['Every required opening source is grounded.'],
        repair_route: null, commit_permission: { can_show_to_player: true,
          can_write_player_visible_message: true,
          can_mark_opening_scene_presented: true }
      } };
      throw new Error(`unexpected role ${call.role_id}`);
    }
  } });
  const result = await service.run({ requestId: 'opening:1',
    visibleContextPackage: pkg, visibleContextApproval: approval });
  assert.match(result.prose, /Любава/u);
  assert.equal(result.flow.status, 'approved');
  assert.equal(result.stage23_result.pass, true);
  assert.equal(result.original_stage23_audit.pass, true);
  assert.deepEqual(roles, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});

test('opening bounds one semantic repair and final audit inside aggregate deadline',
  async () => {
    const pkg = openingPackage(), approval = openingApproval(pkg);
    const calls = [];
    let now = 0, audits = 0;
    const turnBudget = createLlmTurnBudget({ now: () => now });
    const diagnostics = createLlmDiagnostics({ turnBudget, now: () => now });
    const service = createAuthoredOpeningNarrationService({
      llmDiagnostics: diagnostics, roleRunner: { async run(call) {
        calls.push(call.role_id); now += 80_000;
        if (call.role_id === 'gameplay_narrator') return {
          output: { prose: 'Первый неполный вариант.' } };
        if (call.role_id === 'gameplay_narrator_semantic_repair') return {
          output: { prose: 'Любава готовит стан с братом.\n\nПеред ней берег, навес и работа до вечера.' } };
        audits += 1;
        return { output: audits === 1 ? { pass: false,
          failed_checks: ['must_include_check'], concerns: [{
            code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING',
            severity: 'repairable', message: 'Missing opening sources.'
          }], evidence: ['Identity and surroundings are omitted.'] }
        : { pass: true, failed_checks: [], concerns: [],
          evidence: ['All required opening sources are grounded.'] } };
      } } });
    const result = await service.run({ partyId: 'party:1',
      requestId: 'opening:1', visibleContextPackage: pkg,
      visibleContextApproval: approval });
    assert.deepEqual(calls, ['gameplay_narrator',
      'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair',
      'gameplay_narrator_auditor']);
    assert.equal(result.original_stage23_audit.pass, false);
    assert.equal(result.flow.status, 'approved');

    now = 0; audits = 0; calls.length = 0;
    const slowBudget = createLlmTurnBudget({ now: () => now });
    const slowDiagnostics = createLlmDiagnostics({ turnBudget: slowBudget,
      now: () => now });
    const slow = createAuthoredOpeningNarrationService({
      llmDiagnostics: slowDiagnostics, roleRunner: { async run(call) {
        now += 100_000;
        if (call.role_id === 'gameplay_narrator') return {
          output: { prose: 'Первый вариант.' } };
        if (call.role_id === 'gameplay_narrator_semantic_repair') return {
          output: { prose: 'Исправленный вариант.' } };
        audits += 1;
        return { output: { pass: false,
          failed_checks: ['must_include_check'], concerns: [{
            code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING',
            severity: 'repairable', message: 'Missing sources.'
          }], evidence: ['Missing.'] } };
      } } });
    await assert.rejects(slow.run({ partyId: 'party:slow',
      requestId: 'opening:slow', visibleContextPackage: {
        ...pkg, request_id: 'opening:slow' },
      visibleContextApproval: openingApproval({
        ...pkg, request_id: 'opening:slow' }) }),
    { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
    assert.ok(now < 1_200_000);
  });

function openingPackage({ raw = false } = {}) {
  const visible = { party_id: 'party:1', player: { name: 'Любава',
    social_status: { display_name: 'рыбачка' } }, position: { g4_id: 'g4',
    g5_node_id: 'g5', g5_anchor_id: 'anchor:start' },
    timestamp: { whole_minutes: '1' },
    body: { health: 92, energy: 71, satiety: 66 },
    environment: { environment_profile_id: 'env', facts: [
      'Светлое позднелетнее утро.', 'Слышны течение и работа на берегу.'
    ] } };
  const internal = { player: { instance_id: 'player:1', dossier: {
    identity: { name: 'Любава' }, social_status: { display_name: 'рыбачка' },
    knowledge: { known_facts: ['До вечера проверить снасти.',
      'С рассвета Любава работает вместе с братом.'] },
    opening_context: { schema: 'rus.authored_start_opening_context.v1',
      source_hint: 'hint', foreground: { text: 'Берег и настил.',
        anchor_ref: 'anchor:start' },
      far_orientation: [{ text: 'Выше по берегу сушильня.',
        anchor_ref: 'anchor:far' }],
      local_structure: { name: 'навес', description: 'Открытый рабочий навес.',
        g6_instance_ref: 'g6:inside', interior_position_ref: 'position:inside',
        movement_edge_refs: ['edge:out', 'edge:back'] },
      uncertainty: 'Снасти ещё не проверены.' }
  } }, position: visible.position,
  npcs: [{ instance_id: 'npc:brother', anchor_id: 'anchor:start',
    identity_state: { canonical_name: 'Милослав', public_role_label: 'лодочник' },
    machine_state: {}, relationships: [{ target_actor_id: 'player:1',
      kind: 'older_brother', standing: 'trusted' }] },
  { instance_id: 'npc:fisher', anchor_id: 'anchor:start',
    identity_state: { canonical_name: 'Твердята',
      public_role_label: 'незнакомый рыбак' }, relationships: [],
    machine_state: { current_activity: { summary: 'Чинит снасти.' } } }],
  items: [{ instance_id: 'item:rope', placement: {
    holder_character_id: 'player:1' },
    state: { display_name: 'верёвка' }, condition_state: 'serviceable' }] };
  const input = { requestId: 'opening:1', visible,
    internal, approvedProjection: { scenario_id: 'scenario',
      opening_projection: { place_label: 'рыбацкий стан',
        opening_prose: 'hint', visible_field_allowlist: ['party_id',
          'player.name', 'player.social_status', 'position', 'timestamp',
          'body', 'environment'] } } };
  return raw ? input : buildAuthoredOpeningVisibleContext(input);
}

test('first screen receives natural perception after committed rehydrate without a gameplay turn', async () => {
  for (const canonical of [false, true]) {
  for (const lighting of ['clear', 'none']) {
    const { visible, internal, approvedProjection } = openingPackage({ raw: true });
    internal.body = visible.body; internal.timestamp = visible.timestamp;
    internal.position = { ...internal.position, position_id: 'position:inside' };
    Object.assign(approvedProjection.opening_projection, { version: 1, schema: 'first_game_screen', calendar_label: 'Лето' });
    const { perception, initialRule } = await approvedNaturalPerceptionFixture({ canonical });
    if (canonical) {
      internal.player.dossier.knowledge.known_facts = [];
      delete internal.player.dossier.opening_context;
      internal.position.position_id = 'position:shore';
      internal.position.g6_instance_id = 'g6:inside';
      internal.environment_snapshot = { schema: 'rus.approved_initial_environment.v1',
        calendar_date: initialRule.initial_environment_inputs.calendar_date,
        season: 'summer', light_state: 'daylight' };
      approvedProjection.scenario_id = initialRule.scenario_id;
    }
    for (const observation of perception.observations) {
      if (observation.visual_conditions) observation.visual_conditions.lighting = lighting;
    }
    const surfaceText = perception.presentation_profile.layers.find((row) => row.layer === 'surface').clear_text;
    let committed = false, session, narratorInput;
    const order = [];
    const result = await startLowerDvinaTrace({ requestId: 'opening:1', partyId: 'party:1',
      creationIdentity: { scenario_id: 'scenario' },
      release: { world_revision_id: 'world', world_catalog_digest: 'world-digest' },
      publicationLoader: async () => ({ manifest_digest: 'manifest', public_projection: approvedProjection,
        binding: { scenario_id: 'scenario', runtime_binding: { revision: 5 }, binding_id: 'binding', revision: 1,
          binding_digest: 'binding-digest', materializer_binding_id: 'materializer',
          world_compatibility: { production_world_revision_id: 'world', production_world_catalog_digest: 'world-digest' },
          scenario_definition_ref: { revision: 1, digest: 'scenario-digest' },
          phase_1a_manifest_ref: { digest: 'manifest' }, execution_identity: {
            materializer_version: '1', rng_algorithm_id: 'test', seed_context: 'context', trigger: 'start', occurrence: 0 } } }),
      traceStartAdapter: {
        assertExecutionSupport() {},
        async loadInternal() { if (committed) order.push('rehydrate'); return committed ? internal : null; },
        async materialize(request) { internal.request_identity = request; committed = true; order.push('commit'); return { status: 'committed' }; },
        async loadVisible() { return visible; },
        async provisionInitialOrdinary() { order.push('provision'); },
        async loadNaturalScenePerceptionInput() { order.push('perception'); return perception; }
      },
      authoredOpeningNarration: { async run(input) {
        order.push('narrate'); narratorInput = input.visibleContextPackage;
        const descriptions = narratorInput.visible_scene_facts.filter(({ fact_id }) => fact_id.startsWith('opening:natural:'));
        return { prose: `Вы стоите у берега. ${descriptions.map(({ text }) => text).join(' ')}`,
          flow: {}, original_stage23_audit: {} };
      } },
      traceOpeningProjector: buildLowerDvinaTraceOpeningScreen,
      repository: {
        async attachCommittedOpeningSession(input) { session = { screen: input.screen, delivery_attempt: input.deliveryAttempt }; },
        async loadSession() { return session; }
      }, validateSession: async () => {}
    });
    assert.ok(order.indexOf('commit') < order.indexOf('perception'));
    assert.ok(order.lastIndexOf('rehydrate') < order.indexOf('perception'));
    assert.ok(order.indexOf('perception') < order.indexOf('narrate'));
    assert.equal(result.screen.main_prose.includes(surfaceText), lighting === 'clear');
    assert.equal(result.screen.main_prose.includes('Доносится неясный шум.'), !canonical);
    if (canonical) {
      assert.deepEqual(narratorInput.visible_npcs, []);
      assert.equal(narratorInput.opening_reader_control.pass, true);
      assert.equal(narratorInput.opening_reader_control.assessments.length, 8);
      assert.deepEqual(narratorInput.opening_reader_control.assessments
        .find(({ question }) => question === 'goal_stake'), { question: 'goal_stake',
        status: 'unknown', answered: false, fact_refs: [], reason: 'No player-known goal or obligation is supplied.' });
      assert.deepEqual(narratorInput.visible_exits, []);
      assert.equal(narratorInput.visible_scene_dossier.must_include.some(({ category }) =>
        ['preceding_context', 'goal_stake', 'people'].includes(category)), false);
      assert.equal(JSON.stringify(narratorInput).includes('навес'), false);
      assert.equal(JSON.stringify(narratorInput).includes('Милослав'), false);
      assert.match(JSON.stringify(narratorInput.known_context), /верёвка/u);
    }
    assert.equal(JSON.stringify(narratorInput).includes('machine-only'), false);
    assert.equal(JSON.stringify(result.screen).includes('payload_digest'), false);
  }
  }
});

function openingApproval(pkg) {
  const digest = computeVisibleContextPackageDigest(pkg);
  return buildVisibleContextAuditApproval({ request_id: pkg.request_id,
    pass: true, visible_context_package_digest: digest,
    visible_context_audit: { request_id: pkg.request_id, pass: true,
      visible_context_package_digest: digest },
    commit_permission: { can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true } });
}

test('canonical empty-history package passes Stage 22/23 and rejects mismatched proof', async () => {
  const { perception, initialRule } = await approvedNaturalPerceptionFixture({ canonical: true });
  const input = openingPackage({ raw: true });
  input.internal.player.dossier.knowledge.known_facts = [];
  delete input.internal.player.dossier.opening_context;
  input.internal.position = { ...input.visible.position, position_id: 'position:shore', g6_instance_id: 'g6:inside' };
  input.internal.environment_snapshot = { schema: 'rus.approved_initial_environment.v1',
    calendar_date: initialRule.initial_environment_inputs.calendar_date, season: 'summer', light_state: 'daylight' };
  input.approvedProjection.scenario_id = initialRule.scenario_id;
  input.canonicalSourceBinding = perception.canonical_source_binding;
  input.naturalScenePerception = projectG4NaturalPerception({ input: perception,
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:shore' });
  input.internal.items.push({ instance_id: 'item:hidden', placement: { holder_character_id: 'player:1' },
    visibility_state: 'concealed', state: { display_name: 'невидимый предмет' } });
  const pkg = buildCanonicalOpeningVisibleContext(input);
  const { assessments } = pkg.opening_reader_control;
  assert.equal(auditOpeningReaderAssessments({ assessments, facts: pkg.visible_scene_facts }).pass, true);
  assert.equal(auditOpeningReaderAssessments({ assessments: assessments.slice(1), facts: pkg.visible_scene_facts }).pass, false);
  for (const replacement of [
    { ...assessments[1], status: 'supported' },
    { ...assessments[1], fact_refs: ['opening:identity'] },
    { ...assessments[0], fact_refs: ['invented-source'] },
    { ...assessments[1], status: 'not_applicable', reason: '' }
  ]) {
    const invalid = assessments.map((entry) => entry.question === replacement.question ? replacement : entry);
    assert.equal(auditOpeningReaderAssessments({ assessments: invalid, facts: pkg.visible_scene_facts }).pass, false);
  }
  assert.equal(JSON.stringify(pkg).includes('невидимый предмет'), false);
  assert.equal(JSON.stringify(pkg).includes('canonical_source_binding'), false);
  for (const key of ['party_id', 'actor_id', 'position_id', 'scenario_id']) {
    assert.throws(() => buildCanonicalOpeningVisibleContext({ ...input,
      canonicalSourceBinding: { ...input.canonicalSourceBinding, [key]: 'wrong' } }),
    { code: 'CANONICAL_OPENING_CONTEXT_INVALID' });
  }
  const roles = [];
  const service = createAuthoredOpeningNarrationService({ roleRunner: { async run(call) {
    roles.push(call.role_id);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /Cover every supplied must_include entry/u);
      return { output: { prose: 'Вы — Любава, рыбачка. Тело готово к работе.\n\nПри вас верёвка.' } };
    }
    return { output: { pass: true, failed_checks: [], concerns: [], evidence: ['Supplied facts only.'] } };
  } } });
  const result = await service.run({ requestId: input.requestId,
    visibleContextPackage: pkg, visibleContextApproval: openingApproval(pkg) });
  assert.equal(result.stage23_result.pass, true);
  assert.deepEqual(roles, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});
