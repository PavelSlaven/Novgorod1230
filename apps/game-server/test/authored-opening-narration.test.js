import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisibleContextAuditApproval,
  computeVisibleContextPackageDigest } from '@rus/contracts';
import { buildAuthoredOpeningVisibleContext,
  auditAuthoredOpeningContext, buildLowerDvinaTraceOpeningScreen } from
  '../src/runtime/lower-dvina-trace-opening.js';
import { createAuthoredOpeningNarrationService } from
  '../src/runtime/authored-opening-narration.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';

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

function openingPackage() {
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
  return buildAuthoredOpeningVisibleContext({ requestId: 'opening:1', visible,
    internal, approvedProjection: { scenario_id: 'scenario',
      opening_projection: { place_label: 'рыбацкий стан',
        opening_prose: 'hint', visible_field_allowlist: ['party_id',
          'player.name', 'player.social_status', 'position', 'timestamp',
          'body', 'environment'] } } });
}

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
