import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildProviderRequestPayload } from '../../../packages/llm-runtime/src/provider-request.js';
import { createLowerDvinaTraceNarrationService, narrationWire } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';

test('narration wire omits structural label-gap item and preserves unrelated uncertainty', () => {
  const wire = narrationWire({ visible_context: {
    visible_scene: 'У берега.', visible_changes: [],
    uncertainties: ['Наблюдение ещё не дало результата.'],
    do_not_imply: [], allowed_tensions: [], visible_objects: [{
      entity_ref: { entity_kind: 'item', entity_id: 'opaque-item-ref' },
      label_gap: { code: 'player_safe_item_label_required' },
      visible_status: 'serviceable'
    }]
  } });
  assert.deepEqual(wire['Обязательные положения текущего эпизода'],
    ['Наблюдение ещё не дало результата.']);
  assert.equal(wire['Переданные сведения об обстановке']['Место'], 'У берега.');
  assert.deepEqual(wire['Переданные сведения об обстановке']['Предметы и ориентиры'], []);
  const payload = buildProviderRequestPayload({ model: 'test-model', maxTokens: 20000,
    responseFormat: { type: 'json_object' }, compatibility: 'openai_compatible',
    thinking: { type: 'disabled' }, temperature: 0, topP: 1 }, [
    { role: 'system', content: 'Narration system.' },
    { role: 'user', content: JSON.stringify(wire) }
  ]);
  assert.doesNotMatch(payload.messages[1].content,
    /opaque-item-ref|serviceable|label_gap|player_safe_item_label_required|Видны вещи, названия которых пока не удалось установить/u);
});

test('narration roles receive Russian entity descriptions without private refs or statuses', () => {
  const request = { visible_context: {
    visible_scene: 'У берега.', visible_changes: [], uncertainties: [],
    sensory_details: [], known_context: [], allowed_tensions: [], do_not_imply: [],
    visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'private-npc-91' },
      display_label: 'Еремей', recognition: 'known', visible_status: 'Стоит у навеса.',
      observable_cues: { ordinary_remainder: { ordinary_activity: 'Смотрит на воду.' } } }],
    visible_objects: [{ entity_ref: { entity_kind: 'item', entity_id: 'private-item-91' },
      display_label: 'Глиняная чаша', visible_status: 'Стоит на столе.' }]
  }, action_intent_context: { text: 'Следующий шаг ещё не выполнен.' } };
  for (const roleId of ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair']) {
    const wire = narrationWire(request, { roleId });
    assert.deepEqual(wire['Переданные сведения об обстановке']['Люди'],
      ['Еремей Стоит у навеса. Смотрит на воду.']);
    assert.deepEqual(wire['Переданные сведения об обстановке']['Предметы и ориентиры'],
      ['Глиняная чаша Стоит на столе.']);
    assert.doesNotMatch(JSON.stringify(wire['Переданные сведения об обстановке']),
      /private-npc-91|private-item-91|entity_ref|recognition|visible_status/u);
    if (roleId === 'gameplay_narrator_auditor') {
      assert.equal(wire['Контекст намерения для проверки'], undefined);
    } else {
      assert.equal(Object.hasOwn(wire, 'Контекст намерения для проверки'), false);
    }
  }
});

test('all prose roles retain described NPC and admitted path without internal fields', () => {
  const npc = { entity_ref: { entity_kind: 'npc', entity_id: 'private-npc-92' },
    display_label: 'Рыбак', observable_cues: {
      identity: { sex_category: 'male', age_category: 'adult',
        appearance: { build: 'stocky', eyes: { color: 'gray' } } },
      equipment: [{ equipment_slot_category_id: 'outer_garment',
        visual_profile_snapshot: { equipment_slot: 'outer_garment',
          visible_fabric: 'wool', main_visible_color: 'brown' } }],
      outward_presentation: { gaze: 'Смотрит на реку.' }
    } };
  const visible_context = { visible_scene: 'Берег.', visible_changes: [],
    uncertainties: [], sensory_details: [], known_context: [],
    allowed_tensions: [], do_not_imply: [], visible_npc: [npc],
    visible_objects: [
      { entity_ref: { entity_kind: 'passage', entity_id: 'private-path-92' },
        display_label: 'Тропа вдоль берега', visible_status: 'Видна под ивами.' },
      ...['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection']
        .map((entity_kind) => ({ entity_ref: { entity_kind, entity_id: 'private-menu-92' },
          display_label: 'Проход 3' }))
    ] };
  for (const roleId of ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair']) {
    const support = narrationWire({ visible_context }, { roleId })['Переданные сведения об обстановке'];
    assert.equal(support['Люди'].length, 1);
    assert.match(support['Люди'][0], /Рыбак/u);
    assert.match(support['Люди'][0], /взрослый мужчина/u);
    assert.match(support['Люди'][0], /Телосложение: крепкое/u);
    assert.match(support['Люди'][0], /шерсть/u);
    assert.match(support['Люди'][0], /Смотрит на реку/u);
    assert.deepEqual(support['Предметы и ориентиры'], ['Тропа вдоль берега Видна под ивами.']);
    assert.doesNotMatch(JSON.stringify(support),
      /private-|Проход 3|sex_category|outer_garment|stocky|entity_ref/u);
  }
});

test('prose roles retain described routes and fog in the same player-safe snapshot', () => {
  const visible_context = { visible_scene: 'У речного берега',
    visible_changes: ['Пройденный путь: по глинистой тропе.', 'Вы прибыли.'],
    sensory_details: ['Небо не видно.', 'Видимость плохая.'],
    visible_npc: [], visible_objects: [{
      entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'private-local-id' },
      display_label: 'Дальше'
    }, {
      entity_ref: { entity_kind: 'g5_site_connection', entity_id: 'private-route-id' },
      display_label: 'Тропа к берегу'
    }], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  for (const roleId of ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair']) {
    const wire = narrationWire({ visible_context }, { roleId });
    assert.match(wire['Обязательные положения текущего эпизода'][0],
      /Пройденный путь: по глинистой тропе/u);
    assert.deepEqual(wire['Переданные сведения об обстановке']['Ощущения'],
      ['Небо не видно.', 'Видимость плохая.']);
    assert.deepEqual(wire['Переданные сведения об обстановке']['Предметы и ориентиры'],
      ['Тропа к берегу']);
    assert.doesNotMatch(JSON.stringify(wire), /private-route-id|private-local-id|entity_ref/u);
  }
});

test('identity facts come from one actor snapshot for every prose role', () => {
  const visible_context = { visible_scene: 'Берег.', visible_changes: [],
    uncertainties: [], sensory_details: [], known_context: [],
    allowed_tensions: [], do_not_imply: [], visible_npc: [], visible_objects: [] };
  for (const [sex_category, sex] of [['male', 'мужской'],
    ['female', 'женский']]) {
    for (const roleId of ['gameplay_narrator', 'gameplay_narrator_auditor',
      'gameplay_narrator_semantic_repair']) {
      const wire = narrationWire({ visible_context,
        actor: { name: 'Мирон', sex_category } }, { roleId });
      assert.ok(wire['Переданные сведения об обстановке']['Известное герою'].includes('Имя героя: Мирон.'));
      assert.ok(wire['Переданные сведения об обстановке']['Известное герою'].includes(`Пол героя: ${sex}.`));
      assert.doesNotMatch(JSON.stringify(wire), /"sex_category"|"male"|"female"/u);
    }
  }
});

test('captured live snapshot candidates cannot displace the current speech and pending intent', async () => {
  const { visible_context, prose } = JSON.parse(await readFile(new URL(
    './fixtures/narration-current-beat.json', import.meta.url), 'utf8'));
  const candidates = [...visible_context.sensory_details, ...visible_context.visible_objects,
    ...visible_context.known_context, visible_context.visible_scene];
  assert.equal(candidates.length, 23);
  let calls = 0;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls += 1;
    const wire = JSON.parse(call.messages[1].content);
    assert.equal(wire['Переданные сведения об обстановке']['Место'], visible_context.visible_scene);
    assert.deepEqual(wire['Переданные сведения об обстановке']['Ощущения'], visible_context.sensory_details);
    assert.deepEqual(wire['Обязательные положения текущего эпизода'].map((line) =>
      line.replace(/^(?:visible_change|uncertainty)_\d+: /u, '')),
    [...visible_context.visible_changes, ...visible_context.uncertainties]);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose, action_options: [], used_references: [] } };
    return { output: {} };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: 'captured-static-candidates', surface: 'turn', visible_context, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 2);
});

test('private prose wire keeps player-safe scene support beside a current beat', async (t) => {
  const cases = [
    { name: 'physical result and body with a pending second action',
      changes: ['Сухой конец жерди отломлен.', 'Одежда стала менее мокрой.'],
      uncertainties: ['Перевязать отломленный конец вы ещё не успели; результат неизвестен.'],
      prose: 'Вы отломили сухой конец жерди; одежда стала менее мокрой, а перевязать конец вы ещё не успели — результат пока неизвестен, и можно продолжить или передумать.' },
    { name: 'arrival with near, far and NPC support',
      changes: ['Вы вышли на пристань.', 'Рядом стоят мокрые сваи; вдали темнеет лес; у навеса виден Еремей.'], uncertainties: [],
      prose: 'Вы выходите на пристань: рядом стоят мокрые сваи, вдали темнеет лес, а у навеса виден Еремей.',
      sensory: ['Рядом стоят мокрые сваи.', 'Вдали темнеет лес.'],
      npcs: [{ entity_ref: { entity_kind: 'npc', entity_id: 'eremey' },
        display_label: 'Еремей', recognition: 'known', visible_status: 'Виден у навеса.' }],
      outcome: { movement_committed: true } },
    { name: 'scene-only perception retains descriptive support', changes: [], uncertainties: [],
      sensory: ['Рядом стоят мокрые сваи.'], prose: 'Рядом стоят мокрые сваи.' },
    { name: 'qualitative assessment excludes unchanged scene support',
      changes: ['Сухое укрытие сейчас важнее дальнейшего осмотра.'], uncertainties: [],
      sensory: ['Рядом стоят мокрые сваи.'],
      prose: 'Сейчас важнее искать сухое укрытие, чем продолжать осмотр.',
      outcome: { qualitative_assessment: true } }
  ];
  for (const sample of cases) await t.test(sample.name, async () => {
    const visible = { version: 1, schema: 'visible_context_package',
      visible_scene: 'Тёмная речная вода.', visible_changes: sample.changes,
      uncertainties: sample.uncertainties, sensory_details: sample.sensory ?? [],
      visible_npc: sample.npcs ?? [], visible_objects: [],
      known_context: ['На поясе хозяйственный нож.'],
      allowed_tensions: ['Сдержанное внимание.'], do_not_imply: ['Скрытое содержимое неизвестно.'] };
    const original = structuredClone(visible);
    const style = { tone: 'restrained' };
    const outcome = sample.outcome ?? {};
    const { visible_changes, uncertainties, allowed_tensions, do_not_imply, ...support } = visible;
    const calls = [];
    const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(call.messages[1].content);
      assert.equal(Object.hasOwn(wire, 'visible_context'), false);
      assert.equal(wire['Переданные сведения об обстановке']['Место'], support.visible_scene);
      assert.deepEqual(wire['Переданные сведения об обстановке']['Ощущения'], support.sensory_details);
      assert.deepEqual(wire['Переданные сведения об обстановке']['Известное герою'], support.known_context);
      assert.deepEqual(wire['Переданные сведения об обстановке']['Люди'],
        sample.npcs ? ['Еремей Виден у навеса.'] : []);
      assert.deepEqual(wire['Переданные сведения об обстановке']['Предметы и ориентиры'], []);
      assert.doesNotMatch(JSON.stringify(wire['Переданные сведения об обстановке']),
        /entity_ref|entity_id|recognition|visible_status|eremey|version|schema/u);
      assert.deepEqual(wire['Границы рассказа'], { 'Допустимое напряжение': allowed_tensions, 'Не утверждать': do_not_imply });
      assert.deepEqual(wire['Обязательные положения текущего эпизода'].slice(0, visible_changes.length),
        visible_changes.map((text, index) => call.role_id === 'gameplay_narrator_auditor'
          ? `visible_change_${index + 1}: ${text}` : text));
      assert.deepEqual(wire['Обязательные положения текущего эпизода'].slice(visible_changes.length),
        uncertainties.map((text, index) => call.role_id === 'gameplay_narrator_auditor'
          ? `uncertainty_${index + 1}: ${text}` : text));
      assert.deepEqual(wire['Подтверждённый исход'], outcome.movement_committed
        ? ['Переход совершён.'] : outcome.qualitative_assessment
          ? ['Дана качественная оценка.'] : []);
      for (const text of [...visible_changes, ...uncertainties]) {
        assert.equal(call.messages[1].content.split(text).length - 1, 1);
      }
      assert.equal(Object.hasOwn(wire, 'action_intent'), false);
      assert.deepEqual(call.overrides, { temperature: 0 });
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content,
          /в третьем лице и прошедшем времени/u);
        assert.match(call.messages[0].content,
          /Замысел не становится действием, наблюдением или ответом; несделанный шаг не рассказывай как событие/u);
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /неизвестн/u);
        assert.match(call.messages[0].content,
          /замысел|несделанный шаг/u);
      }
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: sample.prose, action_options: [], used_references: [] } };
      const refs = wire['Обязательные положения текущего эпизода'].map((line) => line.split(': ')[0]);
      return { output: { ...reviewedNarration(wire['Отрывки прозы'],
        Object.fromEntries(refs.map((ref) => [ref, ['s1']]))),
        evidence: ['The current beat is grounded and optional context is selected.'] } };
    } } });
    const result = await narrator.run({ version: 1, schema: 'narration_request',
      request_id: sample.name, surface: 'turn', visible_context: visible,
      style_policy: style, context: { outcome } });
    assert.equal(result.status, 'approved');
    assert.deepEqual(result.approved_output.self_check, {});
    assert.deepEqual(visible, original);
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  });
});


for (const sample of [
  { name: 'captured integrated five-minute probing',
    change: 'Вы осторожно прощупывали длинной ветвью воду между обломками; результат наблюдения не установлен.',
    relevant: 'У воды лежат мокрые обломки.', other: ['Над берегом низкое серое небо.', 'За ивняком начинается тропа.'],
    prose: 'Между мокрыми обломками вы осторожно прощупываете воду длинной ветвью; что скрывается под ними, пока неизвестно.' },
  { name: 'unseen integrated contact beside a rough bowl',
    change: 'Вы проводили сухим лоскутом по краю глиняной чаши; результат наблюдения не установлен.',
    relevant: 'Край глиняной чаши шероховатый.', other: ['За дверью виден двор.', 'У стены лежат поленья.'],
    prose: 'По шероховатому краю глиняной чаши вы проводите сухим лоскутом; что это позволило заметить, пока неизвестно.' }
]) test(`${sample.name}: unchanged dump is a non-blocking literary finding`, async () => {
  for (const dump of [false, true]) {
    const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Текущее место',
      visible_changes: [sample.change], uncertainties: [], sensory_details: [sample.relevant, ...sample.other],
      visible_npc: [], visible_objects: [], known_context: ['Старая история героя.'],
      allowed_tensions: [], do_not_imply: [] };
    const calls = [];
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(call.messages[1].content);
      assert.equal(wire['Переданные сведения об обстановке']['Место'], visible.visible_scene);
      assert.deepEqual(wire['Переданные сведения об обстановке']['Ощущения'], visible.sensory_details);
      assert.match(call.messages[0].content,
        /Сколько прошло времени и сколько заняло действие, не называй|выдуманная длительность/u);
      assert.match(call.messages[0].content, call.role_id === 'gameplay_narrator_auditor'
        ? /static_context_dump/u
        : call.role_id === 'gameplay_narrator_semantic_repair'
          ? /avoiding protocol, checklists and static inventories/u
          : /без списка сведений/u);
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /Покажи важное через взгляд героя/u);
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /Обязательные положения текущего эпизода/u);
      }
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: dump ? `${sample.prose} ${visible.sensory_details.join(' ')}` : sample.prose,
        action_options: [], used_references: [] } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.ok(wire['Замечания'].some((reason) => reason.includes('Неизменённые детали')));
        assert.match(call.messages[0].content,
          /An unperformed intent remains silent and never becomes a performed event/u);
        return { output: { replacements: [{ prose: sample.prose }] } };
      }
      const ids = wire['Отрывки прозы'].map(({ segment_id }) => segment_id);
      const pass = !dump || calls.filter((role) => role === 'gameplay_narrator_auditor').length > 1;
      const reason = 'Неизменённые детали пересказаны списком; неотносящиеся к контакту факты отвлекают от физического эпизода.';
      const audit = { ...reviewedNarration(wire['Отрывки прозы'], { visible_change_1: ids }),
        literary_failures: pass ? [] : [{ check: 'static_context_dump',
          segment_choice: ids.at(-1), reason }],
        evidence: pass
          ? ['Подтверждённое движение составляет физический эпизод без служебного времени.']
          : [] };
      return { output: audit };
    } } });
    const result = await service.run({ version: 1, schema: 'narration_request', request_id: `${sample.name}-${dump}`,
      surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose,
      dump ? `${sample.prose} ${visible.sensory_details.join(' ')}` : sample.prose);
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  }
});


test('provider payload gives four prose roles one fact snapshot without service envelope', async () => {
  const captured = [];
  let auditCount = 0;
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    const payload = buildProviderRequestPayload({ model: 'test-model', maxTokens: 20000,
      responseFormat: { type: 'json_object' }, compatibility: 'openai_compatible',
      thinking: { type: 'disabled' }, temperature: call.overrides.temperature,
      topP: 1 }, call.messages);
    const wire = JSON.parse(payload.messages[1].content);
    captured.push({ role: call.role_id, wire, payload });
    if (call.role_id === 'gameplay_narrator') return { output: { prose: 3 } };
    if (call.role_id === 'gameplay_narrator_format_repair') return {
      output: { prose: 'Мирон коснулся жерди; чем это кончилось, пока неизвестно.' } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') return {
      output: { replacements: [{ prose: 'Мирон ощутил жердь под рукой; исход ещё оставался неизвестным.' }] } };
    auditCount += 1;
    const coverage = auditCount === 1
      ? { visible_change_1: ['s1'], uncertainty_1: [] }
      : { visible_change_1: ['s1'], uncertainty_1: ['s1'] };
    return { output: reviewedNarration(wire['Отрывки прозы'], coverage) };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'private-request-47', surface: 'turn',
    visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'У берега.', visible_changes: ['Мирон коснулся жерди.'],
      uncertainties: ['Исход прикосновения неизвестен.'],
      sensory_details: ['Вода шумела.'], known_context: ['Имя героя: Мирон.'],
      visible_npc: [], visible_objects: [], allowed_tensions: [],
      do_not_imply: [] }, context: { outcome: {} } });
  assert.equal(result.status, 'approved');
  assert.deepEqual(captured.map(({ role }) => role), [
    'gameplay_narrator', 'gameplay_narrator_format_repair',
    'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair',
    'gameplay_narrator_auditor'
  ]);
  for (const { role, wire, payload } of captured) {
    assert.deepEqual(wire['Переданные сведения об обстановке'],
      captured[0].wire['Переданные сведения об обстановке']);
    assert.deepEqual(wire['Подтверждённый исход'], []);
    assert.deepEqual(wire['Сведения о мире'], []);
    assert.deepEqual(wire['Обязательные положения текущего эпизода'].map((line) =>
      line.replace(/^(?:visible_change|uncertainty)_\d+: /u, '')),
    ['Мирон коснулся жерди.', 'Исход прикосновения неизвестен.']);
    assert.doesNotMatch(payload.messages[1].content,
      /private-request-47|request_id|surface|version|schema|status|no_new_world_facts/u);
    if (role === 'gameplay_narrator' || role === 'gameplay_narrator_format_repair') {
      assert.doesNotMatch(payload.messages[1].content, /visible_change_1|uncertainty_1/u);
    }
  }
  assert.deepEqual(result.final_audit.coverage.visible_changes,
    [{ source_index: 0, segment_ids: ['s1'] }]);
});


test('object uncertainty keeps unknown outcome in ordinary Russian', () => {
  const wire = narrationWire({ visible_context: {
    visible_scene: 'Берег.', visible_changes: [],
    uncertainties: [{ summary: 'Чаша пока не найдена.', status: 'result_unknown' }],
    sensory_details: [], known_context: [], visible_npc: [], visible_objects: [],
    do_not_imply: [], allowed_tensions: []
  } });
  assert.deepEqual(wire['Обязательные положения текущего эпизода'],
    ['Исход неизвестен: Чаша пока не найдена.']);
  assert.doesNotMatch(JSON.stringify(wire), /result_unknown|status/u);
});
