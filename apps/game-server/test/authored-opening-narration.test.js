import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisibleContextAuditApproval,
  computeVisibleContextPackageDigest, PORTRAIT_SPEC_V1_ENUMS } from '@rus/contracts';
import { ACTOR_BASE_APPEARANCE_VOCABULARY } from '@rus/actors';
import { STAGE23_CONCERN_CODES } from '@rus/new-game';
import { buildAuthoredOpeningVisibleContext,
  auditAuthoredOpeningContext, auditOpeningReaderAssessments, buildLowerDvinaTraceOpeningScreen } from
  '../src/runtime/lower-dvina-trace-opening.js';
import { createAuthoredOpeningNarrationService } from
  '../src/runtime/authored-opening-narration.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { startLowerDvinaTrace } from '../src/runtime/lower-dvina-trace-public-start.js';
import { errorEnvelope } from '../src/http/contracts.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { buildCanonicalOpeningVisibleContext } from '../src/runtime/canonical-opening-context.js';
import { projectG4NaturalPerception } from '../src/runtime/g4-natural-perception.js';
import { deriveApprovedInitialEnvironment } from '@rus/materialization';

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
      const modelInput = JSON.parse(call.messages[1].content);
      assert.equal(JSON.stringify(modelInput).includes('player:1'), false);
      assert.equal(JSON.stringify(modelInput).includes('visible_context_package_digest'), false);
      assert.equal(JSON.stringify(modelInput).includes('source_refs'), false);
      assert.equal(JSON.stringify(modelInput).includes('source_trace'), false);
      assert.equal(JSON.stringify(modelInput).includes('fact_id'), false);
      assert.equal(JSON.stringify(modelInput).includes('f1'),
        call.role_id === 'gameplay_narrator_auditor');
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
        pass: true, failed_checks: [], concerns: [],
        evidence: ['Every required opening source is grounded.']
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

test('opening repairs unsupported negative prose once and blocks hard findings', async () => {
  const pkg = openingPackage(), approval = openingApproval(pkg);
  const run = (severity) => {
    const roles = [], calls = [];
    const service = createAuthoredOpeningNarrationService({ roleRunner: {
      async run(call) {
        calls.push(call);
        roles.push(call.role_id);
        if (call.role_id === 'gameplay_narrator') return { output: {
          prose: 'На берегу никого нет.' } };
        if (call.role_id === 'gameplay_narrator_semantic_repair') return {
          output: { prose: 'Любава стоит у берега рядом с братом.' } };
        assert.equal(call.role_id, 'gameplay_narrator_auditor');
        assert.match(call.messages[0].content,
          new RegExp(STAGE23_CONCERN_CODES.join(', '), 'u'));
        assert.match(call.messages[0].content,
          /Неподтверждённый отрицательный факт в прозе/u);
        assert.match(call.messages[0].content,
          /Используйте severity repairable/u);
        if (roles.includes('gameplay_narrator_semantic_repair')) return { output: {
          pass: true, failed_checks: [], concerns: [], evidence: ['Grounded.'] } };
        return { output: { pass: false,
          failed_checks: ['must_not_include_check'], concerns: [{
            code: 'NARRATOR_PROSE_MUST_NOT_INCLUDE_VIOLATION', severity,
            message: 'The prose denies a supplied visible person.'
            }], evidence: ['Visible person npc:brother is present.'] } };
      }
    } });
    return { calls, roles, result: service.run({ requestId: 'opening:1',
      visibleContextPackage: pkg, visibleContextApproval: approval }) };
  };
  const repairable = run('repairable');
  const result = await repairable.result;
  assert.equal(result.prose, 'Любава стоит у берега рядом с братом.');
  assert.match(repairable.calls[0].messages[0].content,
    /^Верните только \{"prose":"<полное вступление>"\}/u);
  assert.equal(repairable.calls[2].messages[0].content,
    `${repairable.calls[0].messages[0].content} Исправьте каждое переданное замечание Stage 23.`);
  const repairInput = JSON.parse(repairable.calls[2].messages[1].content);
  assert.deepEqual(repairInput.замечания_проверки, [{
    исправимость: 'исправимо по тем же фактам',
    причина: 'The prose denies a supplied visible person.'
  }], JSON.stringify(repairInput));
  assert.deepEqual(repairInput.свидетельства_проверки,
    ['Visible person f10 is present.']);
  assert.doesNotMatch(repairable.calls[2].messages[0].content,
    /severity|NARRATOR_PROSE/u);
  assert.doesNotMatch(JSON.stringify(repairInput),
    /"code"|"severity"|NARRATOR_PROSE|npc:brother|npc:fisher/u);
  assert.match(repairable.calls[1].messages[0].content,
    /Проверяйте вступление по visible_context_package, а не по правдоподобию/u);
  assert.doesNotMatch(repairable.calls[1].messages[0].content,
    /Каждое утверждение должно опираться на такой факт/u);
  assert.equal(result.original_stage23_audit.pass, false);
  assert.equal(result.stage23_result.pass, true);
  assert.deepEqual(repairable.roles, ['gameplay_narrator',
    'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair',
    'gameplay_narrator_auditor']);

  const blocked = run('hard_block');
  await assert.rejects(blocked.result,
    { code: 'AUTHORED_OPENING_AUDIT_REJECTED' });
  assert.deepEqual(blocked.roles, ['gameplay_narrator',
    'gameplay_narrator_auditor']);
});

test('opening sends one readable Russian fact projection to writer and auditor', async () => {
  const pkg = structuredClone(openingPackage()), calls = [];
  pkg.visible_npcs[0].observable_cues = { identity: { sex_category: 'male',
    age_category: 'young', appearance: { eyes: { color: 'blue' },
      hair: { color: 'auburn', style: 'wavy', length: 'medium' },
      build: 'stocky', skin_tone: 'light', face_shape: 'angular' } },
  equipment: [{ equipment_slot_category_id: 'footwear',
    visual_profile_snapshot: { equipment_slot: 'footwear',
      outer_form: 'low_leather_shoe', visible_fabric: 'leather',
      main_visible_color: 'brown' } }] };
  pkg.frame = { ...pkg.frame, season: 'summer', light_profile: 'daylight',
    weather_state: {} };
  pkg.narrator_scope.style_constraints = ['connected_literary_russian',
    'second_person', 'two_to_four_paragraphs'];
  pkg.weather_light_context = [];
  const approval = openingApproval(pkg);
  const prose = pkg.visible_scene_dossier.must_include.map(({ text }) => text)
    .join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: {
        version: 1, schema: 'narrator_starting_prose', request_id: 'opening:1',
        prose_status: 'drafted', prose, action_options: [],
        used_visible_context_refs: pkg.visible_scene_dossier.must_include
          .map(({ source_ref, ref_id, visible_context_ref }) =>
            source_ref ?? ref_id ?? visible_context_ref).filter(Boolean),
        block_reason: null,
        self_constraints_check: Object.fromEntries([
          'used_only_visible_context', 'did_not_add_new_world_facts',
          'did_not_reveal_hidden_state', 'preserved_time_weather_light',
          'preserved_position', 'rumors_remain_rumors',
          'uncertainty_remains_uncertain'
        ].map((key) => [key, true])) } };
      assert.equal(call.role_id, 'gameplay_narrator_auditor');
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['f1 подтверждает эту фразу.'] } };
    }
  } });
  const result = await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: approval });
  const writerPrompt = calls[0].messages[0].content;
  const auditorPrompt = calls[1].messages[0].content;
  assert.match(writerPrompt, /Верните только \{"prose":"<полное вступление>"\}/u);
  assert.match(writerPrompt, /Напишите 2–4 связанных\s+абзаца сдержанной литературной прозы/u);
  assert.match(writerPrompt, /пустой список наблюдений не означает, что место пусто или тихо/u);
  assert.match(writerPrompt, /Не упоминайте предметы, людей, маршруты, звуки, погоду, воспоминания или/u);
  assert.match(auditorPrompt, /Проверяйте вступление по visible_context_package, а не по правдоподобию/u);
  assert.doesNotMatch(writerPrompt, /сохраняй связность и художественную форму/u);
  assert.doesNotMatch(writerPrompt, /Каждое утверждение должно опираться на переданный факт/u);
  assert.doesNotMatch(auditorPrompt, /Каждое утверждение должно опираться на такой факт/u);
  const writerInput = JSON.parse(calls[0].messages[1].content);
  const auditorInput = JSON.parse(calls[1].messages[1].content);
  assert.deepEqual(Object.keys(writerInput), ['сцена']);
  assert.deepEqual(Object.keys(auditorInput), ['сцена', 'проверяемая_проза']);
  for (const modelInput of [writerInput, auditorInput]) {
    const serialized = JSON.stringify(modelInput);
    assert.doesNotMatch(serialized,
      /visible_context_package|frame|clock|whole_minutes|weather_light_context|must_include|source_refs|fact_id|summer|daylight|"[^"]*":\s*\[\s*\]/u);
    assert.doesNotMatch(serialized, /male|young|blue|auburn|stocky|low_leather_shoe/u);
    assert.match(serialized, /Каждое утверждение должно иметь опору в фактах/u);
  }
  const writerFacts = [
    ...(writerInput.сцена.факты ?? []),
    ...(writerInput.сцена.персонажи ?? []).flatMap(({ имя, факты }) =>
      факты.map((fact) => `${имя}: ${fact}`))
  ];
  const auditorFacts = [
    ...(auditorInput.сцена.факты ?? []),
    ...(auditorInput.сцена.персонажи ?? []).flatMap(({ факты }) => факты)
  ];
  assert.ok(writerFacts.some((fact) => fact.includes('Любава')));
  assert.ok(writerFacts.includes('верёвка при вас; состояние — пригодное к использованию.'));
  assert.equal(writerFacts.some((fact) => /serviceable|held_by_player/u.test(fact)), false);
  assert.ok(writerFacts.some((fact) => fact.includes('Виден молодой мужчина.')));
  assert.ok(writerFacts.some((fact) => fact.includes('Глаза: голубые.')));
  assert.ok(writerFacts.some((fact) => fact.includes('низкие кожаные башмаки')));
  assert.ok(writerFacts.some((fact) => fact.startsWith('Не подтверждено:')));
  assert.ok(!writerFacts.includes(pkg.uncertain_context[0].text));
  assert.ok(writerFacts.some((fact) => /лето/iu.test(fact)));
  for (const person of writerInput.сцена.персонажи ?? []) {
    assert.equal(new Set(person.факты.map((fact) => fact.toLocaleLowerCase('ru'))).size,
      person.факты.length);
  }
  assert.ok(auditorFacts.every(({ ключ, текст }) => /^f\d+$/u.test(ключ)
    && typeof текст === 'string'));
  assert.ok(auditorFacts.some(({ текст }) =>
    текст === 'верёвка при вас; состояние — пригодное к использованию.'));
  assert.equal(auditorFacts.some(({ текст }) =>
    /serviceable|held_by_player/u.test(текст)), false);
  assert.equal(new Set(auditorFacts.map(({ ключ }) => ключ)).size,
    auditorFacts.length);
  assert.deepEqual(new Set(auditorInput.сцена.обязательные_ключи),
    new Set(auditorFacts.map(({ ключ }) => ключ)));
  assert.match(result.original_stage23_audit.evidence[0], /opening:/u);
});

test('opening fails closed on an unknown authored item condition', async () => {
  const pkg = structuredClone(openingPackage());
  pkg.visible_items[0].condition = 'unrecognized-condition';
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run() { assert.fail('role must not receive an unknown item condition'); }
  } });
  await assert.rejects(service.run({ requestId: 'opening:1',
    visibleContextPackage: pkg, visibleContextApproval: openingApproval(pkg) }),
  { code: 'OPENING_ITEM_CONDITION_UNSUPPORTED' });
});

test('opening translates all approved initial Temporal phases and rejects unknowns', async () => {
  const boundaries = { civil_dawn_minute_of_day: '250',
    sunrise_minute_of_day: '300', sunset_minute_of_day: '1100',
    civil_dusk_minute_of_day: '1150' };
  const calendarRecord = { family_id: 'calendar_daylight_light_profiles',
    status: 'approved', payload: { calendar_profile_id: 'calendar',
      daylight_profile_id: 'daylight', daylight_boundary_rules: {
        year_daily_boundaries: { '1230': { '08-20': boundaries } } },
      season_rule: { winter_months: ['12','1','2'], spring_months: ['3','4','5'],
        summer_months: ['6','7','8'], autumn_months: ['9','10','11'] } } };
  const weatherRecord = { family_id: 'weather_transition_profiles_processes',
    status: 'approved', payload: { weather_profile_id: 'weather',
      region_season_applicability: { calendar_seasons: { summer: ['6','7','8'] } },
      transition_rules: { seasonal_candidates: { summer: [{ weather_state_id: 'clear',
        weight: '1', weather_state_ref: { entity_ref: { entity_kind: 'weather_state',
          entity_id: 'clear' }, authoring_version: '1' } }] } },
      weather_states: [{ weather_state_id: 'clear', sky: 'clear' }] } };
  const environments = Array.from({ length: 1440 }, (_, local_minute_of_day) =>
    deriveApprovedInitialEnvironment({ calendar_record: calendarRecord,
      weather_record: weatherRecord, calendar_date: { year: 1230, month: 8, day: 20 },
      local_minute_of_day, random: { nextUint32: () => 0 } }));
  const dayParts = [...new Set(environments.map(({ day_part }) => day_part))];
  const lightStates = [...new Set(environments.map(({ light_state }) => light_state))];
  assert.deepEqual(dayParts, ['night', 'civil_dawn', 'daylight', 'civil_dusk']);
  assert.deepEqual(lightStates, ['night', 'civil_dawn', 'daylight', 'civil_dusk']);
  const translations = {
    day_part: { night: 'Ночь.', civil_dawn: 'Рассвет.', daylight: 'День.',
      civil_dusk: 'Сумерки.' },
    light_state: { night: 'Ночь.', civil_dawn: 'Светает.',
      daylight: 'Стоит светлое время дня.', civil_dusk: 'Сгущаются сумерки.' }
  };
  for (const [field, values] of [['day_part', dayParts],
    ['light_state', lightStates]]) {
    for (const source of values) {
      const expected = translations[field][source];
      assert.equal(typeof expected, 'string', `${field} translation missing: ${source}`);
      let captured = null;
      const pkg = structuredClone(openingPackage());
      pkg.frame = { ...pkg.frame, season: 'summer',
        day_part: field === 'day_part' ? source : null,
        light_profile: field === 'light_state' ? source : null };
      pkg.weather_light_context = [{ season: 'summer',
        day_part: field === 'day_part' ? source : null,
        light_state: field === 'light_state' ? source : null }];
      const service = createAuthoredOpeningNarrationService({ roleRunner: {
        async run(call) {
          captured = JSON.parse(call.messages[1].content);
          throw new Error('payload captured');
        }
      } });
      try {
        await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
          visibleContextApproval: openingApproval(pkg) });
      } catch (error) { assert.equal(error.message, 'payload captured'); }
      assert.ok(captured, `${source} ${field} did not reach the writer`);
      assert.ok(captured.сцена.факты.includes(expected),
        `${source} ${field} missing from ${JSON.stringify(captured)}`);
      assert.doesNotMatch(JSON.stringify(captured),
        /civil_dawn|civil_dusk|daylight|light_profile|day_part/u);
    }
  }

  for (const [field, frameField] of [['day_part', 'day_part'],
    ['light_state', 'light_profile']]) {
    const pkg = structuredClone(openingPackage());
    pkg.frame = { ...pkg.frame, [frameField]: 'unknown_temporal_phase' };
    if (field === 'day_part') pkg.frame.day_part = 'unknown_temporal_phase';
    else pkg.weather_light_context = [{ light_state: 'unknown_temporal_phase' }];
    let calls = 0;
    const service = createAuthoredOpeningNarrationService({ roleRunner: {
      async run() { calls += 1; return { output: { prose: 'Вступление.' } }; }
    } });
    await assert.rejects(service.run({ requestId: 'opening:1',
      visibleContextPackage: pkg, visibleContextApproval: openingApproval(pkg) }),
    (error) => error.code === 'OPENING_TEMPORAL_TRANSLATION_UNSUPPORTED'
      && error.details.field === field);
    assert.equal(calls, 0);
  }
});

test('opening scene facts suppress duplicate anchor, item, and exit facts', async () => {
  const pkg = structuredClone(openingPackage());
  pkg.visible_scene_facts = [
    { fact_id: 'opening:shore', text: 'Вы стоите у берега.',
      source_refs: ['anchor:shore'] },
    { fact_id: 'opening:rope', text: 'На доске лежит верёвка.',
      source_refs: ['item:rope'] },
    { fact_id: 'opening:wharf', text: 'Тропа ведёт к пристани.',
      source_refs: ['edge:wharf'] }
  ];
  pkg.visible_anchors = [{ anchor_id: 'anchor:shore', label: 'берега' }];
  pkg.visible_items = [{ item_instance_id: 'item:rope', label: 'верёвка',
    placement: 'on_ground' }];
  pkg.visible_exits = [{ edge_id: 'edge:wharf', label: 'пристани' }];
  const calls = [];
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      const input = JSON.parse(call.messages[1].content);
      calls.push({ role: call.role_id, facts: input.сцена.факты });
      if (call.role_id === 'gameplay_narrator') {
        return { output: { prose: 'Вы стоите на берегу. На доске лежит верёвка. Тропа ведёт к пристани.' } };
      }
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['f1 подтверждает сцену.'] } };
    }
  } });
  await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: openingApproval(pkg) });
  assert.deepEqual(calls.map(({ role }) => role),
    ['gameplay_narrator', 'gameplay_narrator_auditor']);
  const expected = ['Вы стоите у берега.', 'На доске лежит верёвка.',
    'Тропа ведёт к пристани.'];
  for (const { role, facts } of calls) {
    const sceneFacts = facts.map((fact) => typeof fact === 'string' ? fact : fact.текст);
    for (const text of expected) assert.equal(sceneFacts.filter((fact) => fact === text).length,
      1, `${role}: ${text}`);
    for (const duplicate of ['берега', 'верёвка', 'пристани']) {
      assert.equal(sceneFacts.includes(duplicate), false, `${role}: duplicate ${duplicate}`);
    }
  }
  assert.equal(new Set(calls[1].facts.map(({ ключ }) => ключ)).size,
    calls[1].facts.length);
});

test('opening deduplicates only whole visible scene tokens with matching item refs', async () => {
  const project = async (pkg) => {
    const calls = [];
    const service = createAuthoredOpeningNarrationService({ roleRunner: {
      async run(call) {
        const payload = JSON.parse(call.messages[1].content);
        calls.push({ role: call.role_id, facts: payload.сцена.факты });
        if (call.role_id === 'gameplay_narrator') {
          return { output: { prose: 'Вы стоите на берегу. Пристань, лес и верёвка видны.' } };
        }
        return { output: { pass: true, failed_checks: [], concerns: [],
          evidence: ['f1 подтверждает сцену.'] } };
      }
    } });
    await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
      visibleContextApproval: openingApproval(pkg) });
    return Object.fromEntries(calls.map(({ role, facts }) => [role,
      facts.map((fact) => typeof fact === 'string' ? fact : fact.текст)]));
  };
  const base = structuredClone(openingPackage());
  const cases = [
    { name: 'exit_named_in_known_context', pkg: (() => {
      const pkg = structuredClone(base);
      pkg.visible_scene_facts = [];
      pkg.known_context.push({ text: 'Брат ушёл к пристани за лодкой.',
        basis_refs: ['player:1'] });
      pkg.visible_exits = [{ edge_id: 'edge:wharf', label: 'пристани' }];
      return pkg;
    })(), expected: ['Брат ушёл к пристани за лодкой.', 'пристани'] },
    { name: 'anchor_substring_of_other_word', pkg: (() => {
      const pkg = structuredClone(base);
      pkg.visible_scene_facts = [{ fact_id: 'opening:ladder',
        text: 'У стены стоит лестница.', source_refs: ['anchor:forest'] }];
      pkg.visible_anchors = [{ anchor_id: 'anchor:forest', label: 'лес' }];
      return pkg;
    })(), expected: ['У стены стоит лестница.', 'лес'] },
    { name: 'ground_item_same_label_as_held', pkg: (() => {
      const pkg = structuredClone(base);
      pkg.visible_items.push({ item_instance_id: 'item:rope-ground',
        label: 'верёвка', placement: 'on_ground' });
      return pkg;
    })(), expected: ['верёвка при вас; состояние — пригодное к использованию.',
      'верёвка'] },
    { name: 'item_named_in_uncertain_only', pkg: (() => {
      const pkg = structuredClone(base);
      pkg.visible_scene_facts = [];
      pkg.visible_anchors = [{ anchor_id: 'anchor:shore', label: 'берег' }];
      pkg.uncertain_context = [{ text: 'Лодки у берега нет.',
        inference_basis_refs: [] }];
      return pkg;
    })(), expected: ['Не подтверждено: Лодки у берега нет.', 'берег'] }
  ];
  for (const { name, pkg, expected } of cases) {
    const roleFacts = await project(pkg);
    for (const role of ['gameplay_narrator', 'gameplay_narrator_auditor']) {
      for (const text of expected) {
        assert.ok(roleFacts[role].includes(text), `${name}/${role}: ${text}`);
      }
    }
  }
});

test('opening groups NPC facts by visible person without cross-person deduplication', async () => {
  const pkg = structuredClone(openingPackage());
  const [first, second] = pkg.visible_npcs;
  first.label = second.label = 'Человек';
  first.observable_cues = { identity: { sex_category: 'male', age_category: 'adult',
    appearance: { eyes: { color: 'blue' } } } };
  second.observable_cues = { identity: { sex_category: 'female', age_category: 'middle_aged',
    appearance: { eyes: { color: 'green' } } } };
  pkg.visible_scene_facts = [
    { fact_id: 'opening:npc:first', text: 'Человек',
      source_refs: [first.npc_instance_id] },
    { fact_id: 'opening:npc:second', text: 'Человек',
      source_refs: [second.npc_instance_id] },
    { fact_id: 'opening:npc:shared', text: 'Оба лица различимы.',
      source_refs: [first.npc_instance_id, second.npc_instance_id] }
  ];
  const calls = [];
  const prose = pkg.visible_scene_dossier.must_include.map(({ text }) => text).join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: { prose } };
      const scene = JSON.parse(call.messages[1].content).сцена;
      const evidence = scene.персонажи.flatMap(({ факты }) => факты)
        .filter(({ текст }) => текст === 'Человек')
        .map(({ ключ }) => `${ключ} виден.`);
      return { output: { pass: true, failed_checks: [], concerns: [], evidence } };
    }
  } });
  const result = await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: openingApproval(pkg) });
  const writer = JSON.parse(calls[0].messages[1].content).сцена;
  const auditor = JSON.parse(calls[1].messages[1].content).сцена;
  assert.equal(writer.персонажи.length, 2);
  assert.deepEqual(writer.персонажи.map(({ имя }) => имя), ['Человек', 'Человек']);
  assert.ok(writer.факты.includes('Оба лица различимы.'));
  assert.ok(writer.персонажи.every(({ факты }) =>
    !факты.includes('Оба лица различимы.')));
  assert.ok(writer.персонажи.every(({ факты }) => !факты.includes('Человек')));
  assert.equal(writer.персонажи[0].факты.filter((fact) => fact === 'Глаза: голубые.').length, 1);
  assert.equal(writer.персонажи[1].факты.filter((fact) => fact === 'Глаза: зелёные.').length, 1);
  assert.equal(writer.персонажи[1].факты.includes('Глаза: голубые.'), false);
  assert.ok(writer.персонажи[0].факты.includes('Виден взрослый мужчина.'));
  assert.ok(writer.персонажи[1].факты.includes('Видна женщина средних лет.'));
  assert.doesNotMatch(JSON.stringify(writer), /npc:first|npc:second|npc_instance_id/u);
  const keyedFacts = auditor.персонажи.flatMap(({ факты }) => факты);
  assert.ok(auditor.факты.some(({ текст }) => текст === 'Оба лица различимы.'));
  assert.equal(keyedFacts.filter(({ текст }) => текст === 'Человек').length, 2);
  assert.equal(new Set(keyedFacts.map(({ ключ }) => ключ)).size, keyedFacts.length);
  assert.equal(keyedFacts.filter(({ текст }) => текст === 'Глаза: голубые.').length, 1);
  assert.equal(keyedFacts.filter(({ текст }) => текст === 'Глаза: зелёные.').length, 1);
  assert.ok(result.original_stage23_audit.evidence.some((entry) =>
    entry.includes('opening:npc:first')));
  assert.ok(result.original_stage23_audit.evidence.some((entry) =>
    entry.includes('opening:npc:second')));
});

test('opening translates each supported actor and portrait appearance value', async () => {
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.sex_category,
    PORTRAIT_SPEC_V1_ENUMS.person.sex);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.age_category.map((value) =>
    value === 'young_adult' ? 'young' : value).sort(),
  [...PORTRAIT_SPEC_V1_ENUMS.person.age].sort());
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.build,
    PORTRAIT_SPEC_V1_ENUMS.person.build);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.skin_tone,
    PORTRAIT_SPEC_V1_ENUMS.person.skin_tone);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.face_shape,
    PORTRAIT_SPEC_V1_ENUMS.person.face_shape);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.hair_color,
    PORTRAIT_SPEC_V1_ENUMS.hair.color);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.hair_length,
    PORTRAIT_SPEC_V1_ENUMS.hair.length);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.hair_style,
    PORTRAIT_SPEC_V1_ENUMS.hair.style);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.facial_hair,
    PORTRAIT_SPEC_V1_ENUMS.hair.facial_hair);
  assert.deepEqual(ACTOR_BASE_APPEARANCE_VOCABULARY.eye_color,
    PORTRAIT_SPEC_V1_ENUMS.eyes.color);

  const expected = {
    sex_category: { male: 'Виден взрослый мужчина.', female: 'Видна взрослая женщина.' },
    age_category: { young: 'Виден молодой мужчина.', young_adult: 'Виден молодой мужчина.',
      adult: 'Виден взрослый мужчина.',
      middle_aged: 'Виден мужчина средних лет.', old: 'Виден пожилой мужчина.' },
    'appearance.build': { slim: 'Телосложение: стройное.', average: 'Телосложение: обычное.',
      stocky: 'Телосложение: крепкое.' },
    'appearance.skin_tone': { pale: 'Кожа: бледная.', light: 'Кожа: светлая.',
      warm: 'Кожа: смуглая.', brown: 'Кожа: коричневая.' },
    'appearance.face_shape': { oval: 'Черты лица: овальные.', round: 'Черты лица: круглые.',
      broad: 'Черты лица: широкие.', angular: 'Черты лица: угловатые.',
      long: 'Черты лица: вытянутые.' },
    'appearance.eyes.color': { blue: 'Глаза: голубые.', gray: 'Глаза: серые.',
      green: 'Глаза: зелёные.', brown: 'Глаза: карие.', dark: 'Глаза: тёмные.' },
    'appearance.hair.color': { blond: 'Волосы: короткие русые прямые.',
      light_brown: 'Волосы: короткие светло-каштановые прямые.',
      dark_brown: 'Волосы: короткие тёмно-каштановые прямые.',
      black: 'Волосы: короткие чёрные прямые.', auburn: 'Волосы: короткие рыжие прямые.',
      gray: 'Волосы: короткие седые прямые.', white: 'Волосы: короткие белые прямые.' },
    'appearance.hair.length': { bald: 'Лысина.', short: 'Волосы: короткие чёрные прямые.',
      medium: 'Волосы: средней длины чёрные прямые.', long: 'Волосы: длинные чёрные прямые.' },
    'appearance.hair.style': { straight: 'Волосы: короткие чёрные прямые.',
      wavy: 'Волосы: короткие чёрные волнистые.',
      loose: 'Волосы: короткие чёрные распущенные.',
      braided: 'Волосы: короткие чёрные заплетённые.' },
    'appearance.hair.facial_hair': { none: null, moustache: 'Усы.',
      short_beard: 'Короткая борода.', full_beard: 'Густая борода.' }
  };
  const variants = [];
  for (const [field, values] of [
    ['sex_category', PORTRAIT_SPEC_V1_ENUMS.person.sex],
    ['age_category', PORTRAIT_SPEC_V1_ENUMS.person.age],
    ['appearance.build', PORTRAIT_SPEC_V1_ENUMS.person.build],
    ['appearance.skin_tone', PORTRAIT_SPEC_V1_ENUMS.person.skin_tone],
    ['appearance.face_shape', PORTRAIT_SPEC_V1_ENUMS.person.face_shape],
    ['appearance.eyes.color', PORTRAIT_SPEC_V1_ENUMS.eyes.color],
    ['appearance.hair.color', PORTRAIT_SPEC_V1_ENUMS.hair.color],
    ['appearance.hair.length', PORTRAIT_SPEC_V1_ENUMS.hair.length],
    ['appearance.hair.style', PORTRAIT_SPEC_V1_ENUMS.hair.style],
    ['appearance.hair.facial_hair', PORTRAIT_SPEC_V1_ENUMS.hair.facial_hair]
  ]) for (const value of values) variants.push({ field, value });
  for (const [field, values] of Object.entries(ACTOR_BASE_APPEARANCE_VOCABULARY)) {
    const path = field === 'sex_category' || field === 'age_category'
      ? field : field.startsWith('appearance.') ? field
        : field === 'eye_color' ? 'appearance.eyes.color'
          : field === 'hair_color' ? 'appearance.hair.color'
            : field === 'hair_length' ? 'appearance.hair.length'
              : field === 'hair_style' ? 'appearance.hair.style'
                : field === 'facial_hair' ? 'appearance.hair.facial_hair'
                  : `appearance.${field}`;
    for (const value of values) variants.push({ field: path, value });
  }
  const pkg = structuredClone(openingPackage());
  const baseNpc = structuredClone(pkg.visible_npcs[0]);
  const npcVariants = variants.map(({ field, value }, index) => {
    const npc = structuredClone(baseNpc);
    npc.label = `Человек ${index + 1}`;
    npc.npc_instance_id = `npc:appearance:${index + 1}`;
    npc.observable_cues = { identity: { sex_category: 'male', age_category: 'adult',
      appearance: { build: 'average', skin_tone: 'light', face_shape: 'oval',
        eyes: { color: 'brown' }, hair: { color: 'black', length: 'short',
          style: 'straight', facial_hair: 'none' } } } };
    const path = field.split('.');
    let target = npc.observable_cues.identity;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    return npc;
  });
  pkg.visible_npcs = [...pkg.visible_npcs, ...npcVariants];
  const calls = [];
  const prose = pkg.visible_scene_dossier.must_include.map(({ text }) => text).join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: { prose } };
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['The supplied facts are available.'] } };
    }
  } });
  await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: openingApproval(pkg) });
  const serialized = calls[0].messages[1].content;
  const groups = JSON.parse(serialized).сцена.персонажи;
  assert.ok(groups.length >= npcVariants.length);
  for (const [{ field, value }, npc] of variants.map((variant, index) =>
    [variant, npcVariants[index]])) {
    const group = groups.find(({ имя }) => имя === npc.label);
    const expectedText = expected[field][value];
    if (expectedText) assert.ok(group.факты.includes(expectedText),
      `${field}=${value} missing translation in ${JSON.stringify(group.факты)}`);
    else assert.equal(group.факты.some((fact) => fact.includes(value)), false);
    assert.equal(group.факты.some((fact) => fact.includes(value)), false,
      `${field}=${value} leaked untranslated`);
  }
});

test('opening rejects unknown visible NPC enum values instead of dropping them', async () => {
  const pkg = structuredClone(openingPackage());
  pkg.visible_npcs[0].observable_cues = { identity: { sex_category: 'male',
    age_category: 'adult', appearance: { eyes: { color: 'violet' } } } };
  const calls = [];
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) { calls.push(call); return { output: { prose: 'Вступление.' } }; }
  } });
  await assert.rejects(service.run({ requestId: 'opening:1',
    visibleContextPackage: pkg, visibleContextApproval: openingApproval(pkg) }),
  (error) => error.code === 'OPENING_APPEARANCE_TRANSLATION_UNSUPPORTED'
    && /Не удалось подготовить видимые сведения об облике персонажа/u.test(error.message)
    && !error.message.includes('violet')
    && error.details.field === 'identity.appearance.eyes.color');
  assert.equal(calls.length, 0);
});

test('opening translates each admitted portrait clothing value', async () => {
  const expected = {
    neckline: { not_applicable: null, round: 'круглый вырез',
      slit_round: 'круглый вырез с разрезом', v_slit: 'V-образный вырез с разрезом',
      high_closed: 'закрытый высокий ворот' },
    sleeve: { narrow: 'узкие рукава', wide: 'широкие рукава' },
    outer: { none: null, wrap: 'запашная верхняя одежда',
      front_open: 'распашная верхняя одежда', shoulder_drape: 'накидка на плечах',
      sleeveless_overlayer: 'верхняя одежда без рукавов' },
    fabric: { light_linen: 'тонкий лён', wool: 'шерсть',
      coarse_wool: 'грубая шерсть', furred: 'мех' },
    trim: { none: null, edge_band: 'отделка по краю', braid: 'тесьма',
      fur_edge: 'меховая опушка' },
    color: { undyed_linen: 'цвета неокрашенного льна', dark_blue: 'тёмно-синего цвета',
      forest_green: 'зелёного цвета', madder_red: 'красного цвета',
      ochre: 'охряного цвета', brown: 'коричневого цвета',
      charcoal: 'угольно-серого цвета', blue: 'синего цвета',
      gray: 'серого цвета', red: 'красного цвета', white: 'белого цвета',
      black: 'чёрного цвета' },
    headwear: { none: null, linen_cap: 'льняная шапка', headscarf: 'платок',
      fur_hat: 'меховая шапка' }
  };
  const fields = [
    ['neckline', PORTRAIT_SPEC_V1_ENUMS.clothing.neckline, 'neckline'],
    ['sleeve', PORTRAIT_SPEC_V1_ENUMS.clothing.sleeve, 'sleeve_form'],
    ['outer', PORTRAIT_SPEC_V1_ENUMS.clothing.outer, 'outer_form'],
    ['fabric', PORTRAIT_SPEC_V1_ENUMS.clothing.fabric, 'visible_fabric'],
    ['trim', PORTRAIT_SPEC_V1_ENUMS.clothing.trim, 'trim'],
    ['color', PORTRAIT_SPEC_V1_ENUMS.clothing.main_color, 'main_visible_color'],
    ['color', PORTRAIT_SPEC_V1_ENUMS.clothing.secondary_color,
      'secondary_visible_color'],
    ['headwear', PORTRAIT_SPEC_V1_ENUMS.clothing.headwear, 'headwear_kind']
  ];
  const variants = fields.flatMap(([category, values, field]) =>
    values.map((value) => ({ category, field, value })));
  const directionalOuterForms = [
    ['wrap', 'запашная верхняя одежда'],
    ['front_open', 'распашная верхняя одежда'],
    ['shoulder_drape', 'накидка на плечах'],
    ['sleeveless_overlayer', 'верхняя одежда без рукавов'],
    ['low_leather_shoe', 'низкие кожаные башмаки'],
    ['straight_lower_garment', 'прямая нижняя одежда'],
    ['long lower-body-covering garment', 'длинная одежда, закрывающая ноги']
  ];
  const directionalSlots = [
    ['base_garment', 'Нижняя одежда'], ['lower_garment', 'Одежда ниже пояса'],
    ['outer_garment', 'Верхняя одежда'], ['over_garment_winter', 'Зимняя верхняя одежда'],
    ['outer', 'Верхняя одежда']
  ];
  variants.push(...directionalOuterForms.map(([value]) =>
    ({ category: 'outer', field: 'outer_form', value })));
  variants.push(...directionalSlots.map(([value]) =>
    ({ category: 'slot', field: 'equipment_slot_category_id', value })));
  Object.assign(expected.outer, Object.fromEntries(directionalOuterForms));
  expected.slot = Object.fromEntries(directionalSlots);
  const pkg = structuredClone(openingPackage());
  const baseNpc = structuredClone(pkg.visible_npcs[0]);
  const clothingNpcs = variants.map(({ field, value }, index) => {
    const npc = structuredClone(baseNpc);
    npc.label = `Одежда ${index + 1}`;
    npc.npc_instance_id = `npc:clothing:${index + 1}`;
    npc.observable_cues = { equipment: [{ equipment_slot_category_id: 'base_garment',
      visual_profile_snapshot: { equipment_slot: 'base_garment', neckline: 'round',
        sleeve_form: 'narrow', outer_form: 'none', visible_fabric: 'light_linen',
        trim: 'none', main_visible_color: 'undyed_linen',
        secondary_visible_color: null, headwear_kind: 'none' } }] };
    if (field === 'equipment_slot_category_id') {
      npc.observable_cues.equipment[0].equipment_slot_category_id = value;
      npc.observable_cues.equipment[0].visual_profile_snapshot.equipment_slot = value;
    } else npc.observable_cues.equipment[0].visual_profile_snapshot[field] = value;
    return npc;
  });
  const footwearNpc = structuredClone(baseNpc);
  footwearNpc.label = 'Башмаки';
  footwearNpc.npc_instance_id = 'npc:clothing:footwear-color';
  footwearNpc.observable_cues = { equipment: [{ equipment_slot_category_id: 'footwear',
    visual_profile_snapshot: { equipment_slot: 'footwear', outer_form: 'low_leather_shoe',
      visible_fabric: 'leather', main_visible_color: 'brown' } }] };
  pkg.visible_npcs = [...pkg.visible_npcs, ...clothingNpcs, footwearNpc];
  const calls = [];
  const prose = pkg.visible_scene_dossier.must_include.map(({ text }) => text).join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: { prose } };
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['Видимые детали даны.'] } };
    }
  } });
  await service.run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: openingApproval(pkg) });
  const serialized = calls[0].messages[1].content;
  const groups = JSON.parse(serialized).сцена.персонажи;
  for (const [{ category, value }, npc] of variants.map((variant, index) =>
    [variant, clothingNpcs[index]])) {
    const facts = groups.find(({ имя }) => имя === npc.label).факты;
    const translated = expected[category][value];
    if (translated) assert.ok(facts.some((fact) => fact.includes(translated)),
      `${category}=${value} missing translation: ${JSON.stringify(facts)}`);
    assert.equal(facts.some((fact) => fact.includes(value)), false,
      `${category}=${value} leaked untranslated`);
  }
  const sameColorNpc = clothingNpcs[variants.findIndex(({ field, value }) =>
    field === 'secondary_visible_color' && value === 'undyed_linen')];
  const sameColorFact = groups.find(({ имя }) => имя === sameColorNpc.label)
    .факты.find((fact) => fact.startsWith('Нижняя одежда:'));
  assert.equal((sameColorFact.match(/цвета неокрашенного льна/gu) ?? []).length, 1);
  for (const [sourceValue, phrase] of directionalOuterForms) {
    const npc = clothingNpcs[variants.findIndex(({ field, value }) =>
      field === 'outer_form' && value === sourceValue)];
    const facts = groups.find(({ имя }) => имя === npc.label).факты;
    assert.ok(facts.some((fact) => fact.includes(phrase)),
      `${sourceValue} must retain its clothing direction in ${JSON.stringify(facts)}`);
  }
  for (const [sourceValue, phrase] of directionalSlots) {
    const npc = clothingNpcs[variants.findIndex(({ field, value }) =>
      field === 'equipment_slot_category_id' && value === sourceValue)];
    const facts = groups.find(({ имя }) => имя === npc.label).факты;
    assert.ok(facts.some((fact) => fact.startsWith(`${phrase}:`)),
      `${sourceValue} must retain its clothing direction in ${JSON.stringify(facts)}`);
  }
  assert.ok(groups.find(({ имя }) => имя === footwearNpc.label).факты
    .includes('Обувь: низкие кожаные башмаки, кожа, коричневого цвета.'));
});

test('opening derives literary check from concern and keeps factual checks fail closed', async () => {
  const pkg = openingPackage(), approval = openingApproval(pkg);
  const literary = { code: 'NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION',
    severity: 'warning', message: 'Opening reads as a dossier.' };
  const run = (audit) => createAuthoredOpeningNarrationService({ roleRunner: {
    async run({ role_id }) {
      if (role_id === 'gameplay_narrator' ||
          role_id === 'gameplay_narrator_semantic_repair') return { output: { prose:
        'Любава готовит стан с братом.\n\nПеред ней берег, навес и работа до вечера.' } };
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['Grounded opening.'], ...audit } };
    }
  } }).run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: approval });

  const withConcern = await run({ concerns: [literary] });
  assert.equal(withConcern.literary_pass, false);
  assert.equal(withConcern.stage23_result.pass, true);
  const withFlagOnly = await run({ failed_checks: ['literary_composition_check'] });
  assert.equal(withFlagOnly.literary_pass, true);
  await assert.rejects(run({ failed_checks: ['require_must_not_include_compliance'] }),
    { code: 'AUTHORED_OPENING_AUDIT_INVALID' });
  await assert.rejects(run({ failed_checks: ['new_fact_check'], concerns: [{
    code: 'NARRATOR_PROSE_ADDED_FACT', severity: 'repairable',
    message: 'Unsupported fact.' }] }), { code: 'AUTHORED_OPENING_AUDIT_INVALID' });
});

test('opening retries incomplete or contradictory audit once with feedback', async () => {
  const pkg = openingPackage(), approval = openingApproval(pkg);
  const calls = [];
  const audit = { pass: true, failed_checks: [], concerns: [],
    evidence: ['Opening is grounded.'] };
  const run = (first, second) => createAuthoredOpeningNarrationService({
    roleRunner: { async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: 'Любава готовит стан с братом.\n\nПеред ней берег и навес.' } };
      return { output: calls.filter(({ role_id }) => role_id ===
        'gameplay_narrator_auditor').length === 1 ? first : second };
    } }
  }).run({ requestId: 'opening:1', visibleContextPackage: pkg,
    visibleContextApproval: approval });

  const result = await run({ pass: false, evidence: ['Missing facts.'] }, audit);
  assert.equal(result.stage23_result.pass, true);
  assert.equal(calls.filter(({ role_id }) => role_id ===
    'gameplay_narrator_auditor').length, 2);
  assert.match(calls[2].messages[0].content, /STAGE23_AUDIT_CHECK_INVALID/u);

  calls.length = 0;
  await assert.rejects(run({ pass: false, failed_checks: [], concerns: [],
    evidence: ['Missing facts.'] }, { pass: false, failed_checks: [],
    concerns: [], evidence: ['Still incomplete.'] }), (error) => {
    assert.equal(error.code, 'AUTHORED_OPENING_AUDIT_INVALID');
    assert.deepEqual(error.details.codes, ['STAGE23_AUDIT_NO_FAILED_CHECK',
      'STAGE23_AUDIT_CONCERNS_MISSING']);
    return true;
  });
  assert.equal(calls.filter(({ role_id }) => role_id ===
    'gameplay_narrator_auditor').length, 2);
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
    const { perception, initialRule, input: naturalInput } = await approvedNaturalPerceptionFixture({ canonical });
    if (canonical) {
      internal.player.dossier.knowledge.known_facts = [];
      delete internal.player.dossier.opening_context;
      internal.position.position_id = 'position:shore';
      internal.position.g6_instance_id = 'g6:inside';
      internal.environment_snapshot = { ...naturalInput.currentFacts.current_environment, version: 1,
        calendar_date: initialRule.initial_environment_inputs.calendar_date,
        local_minute_of_day: initialRule.initial_environment_inputs.local_minute_of_day,
        season: 'summer', light_state: 'daylight' };
      visible.environment = structuredClone(internal.environment_snapshot);
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
        async loadNaturalScenePerceptionInput() { order.push('perception'); return {
          ...perception, entity_observations: canonical && lighting === 'clear'
            ? [{ entity_kind: 'npc', entity_id: 'npc:arrival', visibility: 'clear',
              display_label: 'человек', exterior: { sex_category: 'male', age_category: 'adult',
                appearance: { build: 'lean' }, visible_equipment: [] } }] : [],
          site_connections: canonical ? [{ connection_binding_id: 'connection:shore',
            display_label: 'Проход 3' }] : [] }; }
      },
      authoredOpeningNarration: { async run(input) {
        order.push('narrate'); narratorInput = input.visibleContextPackage;
        const descriptions = narratorInput.visible_scene_facts.filter(({ fact_id }) => fact_id.startsWith('opening:natural:'));
        return { prose: `Вы стоите у берега. ${descriptions.map(({ text }) => text).join(' ')} ${narratorInput.visible_npcs.map(({ label }) => label).join(' ')}`,
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
    assert.deepEqual(result.screen.panels.route.data.movement?.options ?? [], canonical
      ? [{ label: 'Проход 3', knowledge_state: 'known' }] : []);
    if (canonical) {
      assert.equal(narratorInput.visible_npcs.length, lighting === 'clear' ? 1 : 0);
      if (lighting === 'clear') {
        assert.equal(narratorInput.visible_npcs[0].label, 'человек');
        assert.deepEqual(narratorInput.visible_npcs[0].observable_cues.identity.appearance,
          { build: 'lean' });
        assert.match(result.screen.main_prose, /человек/u);
      }
      assert.deepEqual(result.screen.visible_context.environment, { facts: [] });
      assert.equal(narratorInput.opening_reader_control.pass, true);
      assert.equal(narratorInput.opening_reader_control.assessments.length, 8);
      assert.deepEqual(narratorInput.opening_reader_control.assessments
        .find(({ question }) => question === 'goal_stake'), { question: 'goal_stake',
        status: 'unknown', answered: false, fact_refs: [], reason: 'No player-known goal or obligation is supplied.' });
      assert.deepEqual(narratorInput.visible_exits, []);
      assert.equal(narratorInput.visible_scene_dossier.must_include.some(({ category }) =>
        ['preceding_context', 'goal_stake'].includes(category)), false);
      assert.equal(narratorInput.visible_scene_dossier.must_include.some(({ category }) =>
        category === 'people'), lighting === 'clear');
      assert.equal(JSON.stringify(narratorInput).includes('навес'), false);
      assert.equal(JSON.stringify(narratorInput).includes('Милослав'), false);
      assert.match(JSON.stringify(narratorInput.known_context), /верёвка/u);
    }
    assert.equal(JSON.stringify(narratorInput).includes('machine-only'), false);
    assert.equal(JSON.stringify(result.screen).includes('payload_digest'), false);
  }
  }
});

test('first screen without route disclosure fails closed with an internal error, masked for the player', async () => {
  const { visible, internal, approvedProjection } = openingPackage({ raw: true });
  Object.assign(approvedProjection.opening_projection, { version: 1, schema: 'first_game_screen', calendar_label: 'Лето' });
  let committed = false;
  await assert.rejects(startLowerDvinaTrace({ requestId: 'opening:1', partyId: 'party:1',
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
      async loadInternal() { return committed ? internal : null; },
      async materialize(request) { internal.request_identity = request; committed = true; return { status: 'committed' }; },
      async loadVisible() { return visible; },
      async provisionInitialOrdinary() {},
      async loadNaturalScenePerceptionInput() { return { entity_observations: [] }; }
    },
    authoredOpeningNarration: { async run() { assert.fail('narrator must not run'); } },
    traceOpeningProjector: buildLowerDvinaTraceOpeningScreen,
    repository: { async attachCommittedOpeningSession() {}, async loadSession() {} },
    validateSession: async () => {}
  }), (error) => {
    assert.equal(error.code, 'SPATIAL_V3_CURRENT_CONNECTION_DISCLOSURE_REQUIRED');
    assert.equal(error.public_exposure, 'internal');
    const { body } = errorEnvelope(error);
    assert.equal(body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /SPATIAL_V3|disclosure/u);
    return true;
  });
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
    calendar_date: initialRule.initial_environment_inputs.calendar_date, season: 'summer',
    day_part: 'civil_dawn', light_state: 'civil_dawn',
    weather_state: { weather_state_id: 'dense_fog', movement_factor: 'private-movement-factor',
      sky: 'obscured',
      precipitation: 'none', visibility: 'poor', wind: 'calm_or_light' } };
  input.approvedProjection.scenario_id = initialRule.scenario_id;
  input.canonicalSourceBinding = perception.canonical_source_binding;
  input.naturalScenePerception = projectG4NaturalPerception({ input: perception,
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:shore' });
  input.internal.items.push({ instance_id: 'item:hidden', placement: { holder_character_id: 'player:1' },
    visibility_state: 'concealed', state: { display_name: 'невидимый предмет' } });
  const pkg = buildCanonicalOpeningVisibleContext(input);
  assert.deepEqual(pkg.frame.weather_state, { sky: 'obscured',
    precipitation: 'none', visibility: 'poor', wind: 'calm_or_light' });
  assert.doesNotMatch(JSON.stringify(pkg),
    /weather_state_id|dense_fog|movement_factor|private-movement-factor/u);
  const sceneBinding = { ...input.canonicalSourceBinding,
    schema: 'rus.verified_canonical_scene_natural_source.v1', scenario_id: undefined };
  assert.equal(buildCanonicalOpeningVisibleContext({ ...input,
    canonicalSourceBinding: sceneBinding }).opening_reader_control.pass, true);
  assert.throws(() => buildCanonicalOpeningVisibleContext({ ...input,
    canonicalSourceBinding: { ...sceneBinding, position_id: 'wrong' } }),
  { code: 'CANONICAL_OPENING_CONTEXT_INVALID' });
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
  const rolePackage = structuredClone(pkg);
  assert.ok(rolePackage.known_context.some(({ text }) => text === 'При вас: верёвка.'));
  rolePackage.visible_items.push({ item_instance_id: 'item:canonical-seen-rope',
    label: 'верёвка' });
  for (const key of ['party_id', 'actor_id', 'position_id', 'scenario_id']) {
    assert.throws(() => buildCanonicalOpeningVisibleContext({ ...input,
      canonicalSourceBinding: { ...input.canonicalSourceBinding, [key]: 'wrong' } }),
    { code: 'CANONICAL_OPENING_CONTEXT_INVALID' });
  }
  const roles = [];
  let weatherEvidenceKey;
  const service = createAuthoredOpeningNarrationService({ roleRunner: { async run(call) {
    roles.push(call.role_id);
    if (call.role_id === 'gameplay_narrator') {
      const modelInput = JSON.parse(call.messages[1].content);
      assert.ok(modelInput.сцена.факты.some((fact) => /лето/iu.test(fact)),
        JSON.stringify(modelInput.сцена.факты));
      assert.ok(modelInput.сцена.факты.includes('Рассвет.'));
      assert.ok(modelInput.сцена.факты.includes('Светает.'));
      assert.ok(modelInput.сцена.факты.includes('Небо не видно.'));
      assert.ok(modelInput.сцена.факты.includes('Осадков нет.'));
      assert.ok(modelInput.сцена.факты.includes('Видимость плохая.'));
      assert.ok(modelInput.сцена.факты.includes('При вас: верёвка.'));
      assert.ok(modelInput.сцена.факты.includes('верёвка'));
      assert.doesNotMatch(JSON.stringify(modelInput),
        /player:1|source_refs|weather_state_id|dense_fog|movement_factor|private-movement-factor|obscured|summer|civil_dawn|whole_minutes/u);
      return { output: { prose: 'Вы — Любава, рыбачка. Тело готово к работе.\n\nПри вас верёвка.' } };
    }
    const auditInput = JSON.parse(call.messages[1].content);
    assert.ok(auditInput.сцена.факты.some(({ текст }) => текст === 'При вас: верёвка.'));
    assert.ok(auditInput.сцена.факты.some(({ текст }) => текст === 'верёвка'));
    assert.ok(auditInput.сцена.факты.some(({ текст }) => текст === 'Рассвет.'));
    assert.ok(auditInput.сцена.факты.some(({ текст }) => текст === 'Светает.'));
    weatherEvidenceKey = auditInput.сцена.факты.find(({ текст }) =>
      текст === 'Небо не видно.').ключ;
    return { output: { pass: true, failed_checks: [], concerns: [],
      evidence: [`${weatherEvidenceKey} подтверждает погодный факт.`] } };
  } } });
  const result = await service.run({ requestId: input.requestId,
    visibleContextPackage: rolePackage, visibleContextApproval: openingApproval(rolePackage) });
  assert.equal(result.stage23_result.pass, true);
  assert.deepEqual(roles, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  assert.equal(result.original_stage23_audit.evidence[0],
    `${weatherEvidenceKey} (opening:weather:sky) подтверждает погодный факт.`);
});

test('opening accepts source-bound Temporal environment without aggregate profile or invented facts', async () => {
  const { initialRule, input: natural } = await approvedNaturalPerceptionFixture({ canonical: true });
  const input = openingPackage({ raw: true });
  Object.assign(input.approvedProjection.opening_projection, {
    version: 1, schema: 'first_game_screen', calendar_label: 'Лето' });
  const environment = { ...natural.currentFacts.current_environment, version: 1,
    calendar_date: initialRule.initial_environment_inputs.calendar_date,
    local_minute_of_day: initialRule.initial_environment_inputs.local_minute_of_day };
  input.visible.environment = environment;
  assert.deepEqual(buildLowerDvinaTraceOpeningScreen(input).visible_context.environment, { facts: [] });
  for (const field of ['calendar_record_ref', 'weather_record_ref', 'calendar_date',
    'local_minute_of_day', 'light_state', 'weather_state']) {
    const incomplete = structuredClone(environment);
    delete incomplete[field];
    assert.throws(() => buildLowerDvinaTraceOpeningScreen({ ...input,
      visible: { ...input.visible, environment: incomplete } }),
    { code: 'TRACE_PHASE_1B_VISIBLE_STATE_INCOMPLETE' });
  }
  input.visible.environment = { ...environment, facts: ['wet', 'unapproved prose'] };
  assert.deepEqual(buildLowerDvinaTraceOpeningScreen(input).visible_context.environment, { facts: ['wet'] });
});

// P2-4: outer retries of the first screen under one shared turn budget, real role runner.
// A STAGE23_HANDOFF_* refusal happens when the audit still fails after the one semantic repair
// (STAGE23_HANDOFF_NOT_APPROVED); only then does the first screen retry, once.
const GOOD_PROSE = 'Любава, рыбачка, с рассвета готовит стан вместе с братом.\n\nПеред ней берег, навес и работа до вечера.';
const REPAIRABLE = { pass: false, failed_checks: ['must_include_check'], concerns: [{
  code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING', severity: 'repairable',
  message: 'Missing opening sources.' }], evidence: ['Sources omitted.'] };
const HARD_BLOCK = { ...REPAIRABLE, concerns: [{ ...REPAIRABLE.concerns[0],
  severity: 'hard_block' }] };
const GROUNDED = { pass: true, failed_checks: [], concerns: [], evidence: ['Grounded.'] };

function openingHarness(audit, { step = 0 } = {}) {
  let now = 0;
  const turnBudget = createLlmTurnBudget({ now: () => now });
  const llmDiagnostics = createLlmDiagnostics({ turnBudget, now: () => now });
  const calls = [];
  const execute = async ({ roleId }) => {
    const ordinal = calls.filter((role) => role === roleId).length;
    calls.push(roleId);
    now += step;
    const output = roleId === 'gameplay_narrator_auditor' ? audit(ordinal)
      : { prose: GOOD_PROSE };
    return { status: 'ok', parsed_json: output, provider: 'test', model: 'test',
      scope: 'turn_runtime', role_id: roleId, tier_id: null, durationMs: 1, config_hash: 'x' };
  };
  const roleRunner = createLlmRoleRunnerAdapter({ turnBudget, execute });
  const service = createAuthoredOpeningNarrationService({ roleRunner, llmDiagnostics });
  const pkg = openingPackage(), approval = openingApproval(pkg);
  const run = () => service.run({ partyId: 'party:1', requestId: 'opening:1',
    visibleContextPackage: pkg, visibleContextApproval: approval });
  return { calls, run, count: (role) => calls.filter((item) => item === role).length };
}

test('opening retries a STAGE23_HANDOFF refusal once, without a second repair, and delivers',
  async () => {
    const h = openingHarness((ordinal) => ordinal < 2 ? REPAIRABLE : GROUNDED);
    const result = await h.run();
    assert.equal(result.flow.status, 'approved');
    assert.deepEqual(h.calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
      'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor',
      'gameplay_narrator', 'gameplay_narrator_auditor']);
  });

test('opening makes at most two attempts and the second fails with the standard audit rejection',
  async () => {
    const h = openingHarness(() => REPAIRABLE);
    await assert.rejects(h.run(), (error) => {
      assert.equal(error.code, 'AUTHORED_OPENING_AUDIT_REJECTED');
      assert.deepEqual(error.details.codes, ['NARRATOR_PROSE_MUST_INCLUDE_MISSING']);
      return true;
    });
    assert.equal(h.count('gameplay_narrator'), 2);
    assert.equal(h.count('gameplay_narrator_semantic_repair'), 1, 'one repair per request');
  });

test('opening does not retry a hard_block audit (the first screen fails closed)', async () => {
  const h = openingHarness(() => HARD_BLOCK);
  await assert.rejects(h.run(), { code: 'AUTHORED_OPENING_AUDIT_REJECTED' });
  assert.equal(h.count('gameplay_narrator'), 1);
  assert.equal(h.count('gameplay_narrator_semantic_repair'), 0);
});

test('opening does not start a retry when the deadline holds no more than one call',
  async () => {
    // Four calls of 60 s leave exactly 120 s of the 360 s deadline: not more than one call.
    const h = openingHarness(() => REPAIRABLE, { step: 60_000 });
    await assert.rejects(h.run(), { code: 'AUTHORED_OPENING_AUDIT_REJECTED' });
    assert.equal(h.count('gameplay_narrator'), 1);
  });

test('opening retries when the deadline holds more than one call', async () => {
  const h = openingHarness((ordinal) => ordinal < 2 ? REPAIRABLE : GROUNDED, { step: 59_000 });
  const result = await h.run();
  assert.equal(result.flow.status, 'approved');
  assert.equal(h.count('gameplay_narrator'), 2);
});
