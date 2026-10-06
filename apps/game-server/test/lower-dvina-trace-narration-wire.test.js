import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';

test('captured live snapshot candidates cannot displace the current speech and pending intent', async () => {
  const { visible_context, prose } = JSON.parse(await readFile(new URL(
    './fixtures/narration-current-beat.json', import.meta.url), 'utf8'));
  const candidates = [...visible_context.sensory_details, ...visible_context.visible_objects,
    ...visible_context.known_context, visible_context.visible_scene];
  assert.equal(candidates.length, 23);
  let calls = 0;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls += 1;
    if (call.role_id === 'gameplay_narrator') {
      assert.equal(typeof call.messages[1].content, 'string');
      assert.ok(call.messages[1].content.includes(visible_context.visible_changes[0]));
      assert.doesNotMatch(call.messages[1].content, /request_id|party_id|source_ref|\[\s*\]/u);
      return { output: { prose } };
    }
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.required_current_beat.changes.map(({ ref, text }) => ({ ref, text })),
      visible_context.visible_changes.map((text, index) => ({ ref: `c${index + 1}`, text })));
    assert.deepEqual((wire.required_current_beat.uncertainties ?? []).map(({ text, status }) =>
      ({ text, status })), visible_context.uncertainties.map((text) => ({ text,
        status: 'Действие ещё не выполнено; результат пока неизвестен.' })));
    assert.deepEqual(wire.segments.map(({ segment_id }) => segment_id),
      wire.segments.map((_, index) => `p${index + 1}`));
    assert.doesNotMatch(JSON.stringify(wire), /request_id|party_id|source_ref|visible_change_1|segment_id.:.s1/u);
    return { output: {} };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: 'captured-static-candidates', surface: 'turn', visible_context, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 2);
});

test('dense storeyard auditor receives the complete player prose as well as evidence segments', async () => {
  const frozen = JSON.parse(await readFile(new URL(
    '../../../data/model-evals/llm-runtime/frozen-role-requests-v1.json', import.meta.url), 'utf8'));
  const fixture = frozen.fixtures.find((item) => item.role_id === 'gameplay_narrator_auditor'
    && item.request?.output?.output_id === 'gameplay-narrator-auditor-dense-storeyard-catalogue');
  assert.ok(fixture, 'dense-storeyard frozen auditor fixture exists');
  const prose = fixture.request.output.prose;
  assert.equal(fixture.request.segments.map(({ prose: segment }) => segment).join(''), prose);
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    if (call.role_id === 'gameplay_narrator') return { output: { prose } };
    assert.equal(call.role_id, 'gameplay_narrator_auditor');
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.output, { prose });
    assert.equal(wire.segments.map(({ prose: segment }) => segment).join(''), prose);
    assert.deepEqual(wire.required_current_beat.changes.map(({ ref }) => ref),
      wire.required_current_beat.changes.map((_, index) => `c${index + 1}`));
    assert.deepEqual(wire.segments.map(({ segment_id }) => segment_id),
      wire.segments.map((_, index) => `p${index + 1}`));
    assert.doesNotMatch(JSON.stringify(wire.output), /output_id|action_options|used_references|self_check/u);
    const segmentIds = wire.segments.map(({ segment_id }) => segment_id);
    const sources = [...wire.required_current_beat.changes,
      ...wire.required_current_beat.uncertainties];
    return { output: { reviewed_segments: segmentIds,
      source_reviews: sources.map(({ ref }) => ({ ref, segment_choices: segmentIds })),
      unsupported: [], literary_failures: [], evidence: ['Полный текст и сегменты совпадают.'] } };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: fixture.request.output.output_id, surface: 'turn',
    visible_context: fixture.request.visible_context,
    style_policy: fixture.request.style_policy, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.final_audit.coverage.visible_changes.length,
    fixture.request.visible_context.visible_changes.length);
});

test('prepared model input localizes player text and World Knowledge qualifiers', async () => {
  const captured = [];
  const visible_context = { version: 1, schema: 'visible_context_package',
    visible_scene: 'У ворот стоит телега.', visible_changes: [], uncertainties: [],
    sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
    do_not_imply: [], allowed_tensions: [] };
  const world_knowledge = { facts: [{ runtime_text: 'Обычный размер.', qualifiers: {
    typicality: 'common', directness: 'analogical', confidence: 'medium' } }] };
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    const user = call.messages[1].content;
    captured.push(user);
    assert.doesNotMatch(user, /player input|raw text|no_new_world_facts|не добавлять факты мира:\s*true/u);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(user, /Ввод игрока: текст: Осмотреть телегу\./u);
      assert.match(user, /обычность: обычное/u);
      assert.match(user, /характер утверждения: вывод по аналогии/u);
      assert.match(user, /степень результата: успех с ценой/u);
      assert.match(user, /разница результата: -2/u);
      assert.doesNotMatch(user, /roll_note|natural_1|severe_failure|cost_required/u);
      assert.doesNotMatch(user, /typicality|common|analogical/u);
      return { output: { prose: 'У ворот стоит телега.' } };
    }
    if (call.role_id === 'gameplay_narrator_auditor') {
      assert.doesNotMatch(user, /typicality|common|analogical/u);
      const wire = JSON.parse(user);
      assert.deepEqual(wire.confirmed_outcome.check_outcomes, [{
        action: 'Осмотреть телегу.', band: 'success_with_cost', margin: -2
      }]);
      assert.doesNotMatch(user, /roll_note|natural_1|severe_failure|cost_required/u);
      const coverage = Object.fromEntries([
        ...(wire.required_current_beat?.changes ?? []),
        ...(wire.required_current_beat?.uncertainties ?? [])
      ].map(({ ref }) => [ref, wire.segments.map(({ segment_id }) => segment_id)]));
      return { output: reviewedNarration(wire.segments, coverage) };
    }
    return { output: {} };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: 'prepared-input-labels', surface: 'turn', visible_context,
    context: { player_input: { raw_text: 'Осмотреть телегу.' }, outcome: {
      check_outcomes: [{ action: 'Осмотреть телегу.', band: 'success_with_cost',
        margin: -2, success: true, cost_required: true, severe_failure: false,
        roll_note: 'natural_1', ordinal: 1 }]
    } },
    style_policy: { no_new_world_facts: true }, world_knowledge });
  assert.equal(result.status, 'approved');
  assert.equal(captured.length, 2);
});

test('private prose wire admits only scene identity beside a current beat', async (t) => {
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
    { name: 'movement to a new place retains nine supplied sensory facts',
      changes: ['Вы вышли к берегу.'], uncertainties: [],
      prose: 'Вы вышли к берегу, где на песке лежат камни и ветви.',
      sensory: ['У кромки лежит мокрый песок.', 'Между камнями видны полосы ила.',
        'На берег выбросило тонкие ветви.', 'У воды темнеют водоросли.',
        'По песку тянутся следы струй.', 'В траве у берега лежат осыпавшиеся листья.',
        'У самой воды рассыпана мелкая галька.', 'Ниже по течению заметны плавучие обломки.',
        'Над берегом нависают гибкие ивовые ветви.'],
      outcome: { movement_committed: true } },
    { name: 'movement without an existing change still promotes arrival facts',
      changes: [], uncertainties: [],
      prose: 'Вы приходите к берегу, где на песке лежат камни и ветви.',
      sensory: ['У кромки лежит мокрый песок.', 'Между камнями видны полосы ила.'],
      outcome: { movement_committed: true } },
    { name: 'confirmed movement remains a current beat without sensory details',
      changes: [], uncertainties: [], prose: 'Вы переходите к берегу.', sensory: [],
      outcome: { movement_committed: true } },
    { name: 'scene-only perception retains descriptive support', changes: [], uncertainties: [],
      sensory: ['Рядом стоят мокрые сваи.'], prose: 'Рядом стоят мокрые сваи.' },
    { name: 'qualitative assessment keeps only the scene label as optional support',
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
    const movementFacts = outcome.movement_committed === true
      ? support.sensory_details.filter((fact) => !visible_changes.some((change) => change.includes(fact))) : [];
    const expectedChanges = [...visible_changes];
    if (movementFacts.length && expectedChanges.length) {
      expectedChanges[expectedChanges.length - 1] += ` ${movementFacts.join(' ')}`;
    } else if (outcome.movement_committed === true && !expectedChanges.length) {
      expectedChanges.push(['Переход выполнен.', movementFacts.join(' ')].filter(Boolean).join(' '));
    }
    const calls = [];
    const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const content = call.messages[1].content;
      if (call.role_id === 'gameplay_narrator_auditor') {
        const wire = JSON.parse(content);
        assert.deepEqual(wire.required_current_beat?.changes ?? [],
          expectedChanges.map((text, index) => ({ ref: `c${index + 1}`, text })));
        assert.deepEqual(wire.required_current_beat?.uncertainties ?? [],
          uncertainties.map((text, index) => ({ ref: `u${index + 1}`, text,
            status: 'Действие ещё не выполнено; результат пока неизвестен.' })));
        assert.deepEqual(wire.segments.map(({ segment_id }) => segment_id),
          wire.segments.map((_, index) => `p${index + 1}`));
        assert.equal(JSON.stringify(wire).includes('visible_change_'), false);
        assert.equal(JSON.stringify(wire).includes('uncertainty_'), false);
        assert.equal(JSON.stringify(wire).includes('request_id'), false);
        assert.equal(JSON.stringify(wire).includes('output_id'), false);
        assert.equal(wire.output.prose, wire.segments.map(({ prose }) => prose).join(''));
        assert.deepEqual(Object.keys(wire.output), ['prose']);
        if (sample.outcome?.movement_committed) {
          assert.deepEqual(wire.optional_support, { visible_scene: visible.visible_scene });
        }
      } else {
        assert.equal(typeof content, 'string');
        if (expectedChanges.length || uncertainties.length) {
          assert.match(content, /Обязательные положения текущего эпизода/u);
        }
        for (const fact of [...visible_changes, ...uncertainties, visible.visible_scene,
          ...movementFacts, ...(expectedChanges.length || uncertainties.length
            ? [] : visible.known_context)]) {
          assert.ok(content.includes(fact), `prepared input must retain fact: ${fact}`);
        }
        assert.doesNotMatch(content, /request_id|output_id|source_refs|segment_id|visible_change_[0-9]|version\s*:/u);
        assert.doesNotMatch(content, /\[\s*\]/u);
        for (const text of [...visible_changes, ...uncertainties]) {
          assert.equal(content.split(text).length - 1, 1);
        }
      }
      assert.deepEqual(call.overrides, { temperature: 0 });
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content,
          /Показывай невыполненное продолжение как открытый следующий выбор игрока/u);
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /действие ещё не выполнено и результат пока неизвестен[\s\S]*Никогда не приписывай её NPC[\s\S]*не является unsupported_attempt/u);
        assert.doesNotMatch(call.messages[0].content,
          /Never attribute it to an NPC/u);
      }
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: sample.prose, action_options: [], used_references: [] } };
      const wire = JSON.parse(content);
      const refs = [...(wire.required_current_beat?.changes ?? []),
        ...(wire.required_current_beat?.uncertainties ?? [])];
      const segmentIds = wire.segments.map(({ segment_id }) => segment_id);
      return { output: { ...reviewedNarration(wire.segments,
        Object.fromEntries(refs.map(({ ref }) => [ref, segmentIds]))),
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

test('auditor receives factual WK projection and repair reasons cannot expose projected keys', async () => {
  const calls = [];
  const worldKnowledge = { schema: 'world_knowledge_slice_v1', sufficiency: 'PARTIAL_KNOWLEDGE',
    purpose: 'narration', verdict: 'supported', coverage: ['hidden'],
    search_hint_relevance: [0.99], rerank_applied: true,
    facts: [{ claim_ref: 'wk:cart:wheel-count', domain: 'material_culture',
      predicate: 'has_parts', polarity: 'support', runtime_text: 'У телеги два колеса.',
      qualifiers: { directness: 'direct', quantifier: 'some' } }],
    hard_constraints: [], disputes: [{ conflict_group_ref: 'conflict:cart-wheel-count',
      claims: [{ claim_ref: 'wk:cart:wheel-count-a', runtime_text: 'У телеги два колеса.' },
        { claim_ref: 'wk:cart:wheel-count-b', runtime_text: 'У телеги четыре колеса.' }] }],
    gaps: [{ domain: 'material_culture', status: 'unresolved' }] };
  const service = createLowerDvinaTraceNarrationService({
    worldKnowledgeGrounder: { async ground(request) {
      return { ...request, world_knowledge: worldKnowledge };
    } }, roleRunner: { async run(call) {
    calls.push(call);
    if (call.role_id === 'gameplay_narrator') return { output: { prose: 'У ворот стоит телега.' } };
    if (call.role_id === 'gameplay_narrator_auditor') {
      const wire = JSON.parse(call.messages[1].content);
      assert.equal(typeof wire.world_knowledge, 'string');
      for (const fact of ['У телеги два колеса.', 'У телеги четыре колеса.',
        'разногласия', 'неустановленные сведения', 'Запрос не дал достаточных сведений.']) {
        assert.ok(wire.world_knowledge.includes(fact), `WK projection keeps ${fact}`);
      }
      assert.doesNotMatch(call.messages[1].content,
        /claim_ref|domain|predicate|polarity|purpose|verdict|coverage|search_hint|rerank/u);
      assert.doesNotMatch(call.messages[0].content, /например, "s1"/u);
      if (calls.filter(({ role_id }) => role_id === 'gameplay_narrator_auditor').length === 1) {
        return { output: { reviewed_segments: ['p1'],
          source_reviews: [{ ref: 'c1', segment_choices: ['p1'] }],
          unsupported: [{ segment_choice: 'p1', kind: 'unsupported_fact',
            reason: "Let's re-evaluate elapsed_as_service_report and weak_literary_composition for p1." }],
          literary_failures: [], evidence: [] } };
      }
      return { output: { reviewed_segments: ['p1'],
        source_reviews: [{ ref: 'c1', segment_choices: ['p1'] }],
        unsupported: [], literary_failures: [], evidence: ['Факт подтверждён.'] } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(call.messages[1].content, /У телеги два колеса/u);
      assert.match(call.messages[1].content, /В прозе есть неподтверждённое утверждение/u);
      assert.doesNotMatch(call.messages[1].content,
        /Let's re-evaluate|elapsed_as_service_report|weak_literary_composition/u);
      assert.doesNotMatch(call.messages[1].content, /\b(?:p1|c1|u1)\b/u);
      return { output: { replacements: [{ prose: 'У ворот стоит телега.' }] } };
    }
    throw new Error(`Unexpected role ${call.role_id}`);
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'projected-wk-and-repair-keys', surface: 'turn',
    visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'У ворот стоит телега.', visible_changes: ['У ворот стоит телега.'],
      uncertainties: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], do_not_imply: [], allowed_tensions: [] },
  });
  assert.equal(result.status, 'approved');
});

test('NO_KNOWLEDGE_REQUIRED does not add a WK notice to narration inputs', async () => {
  const notice = 'Дополнительные сведения для этого вопроса не требуются';
  const service = createLowerDvinaTraceNarrationService({
    worldKnowledgeGrounder: { async ground(request) {
      return { ...request, world_knowledge: { sufficiency: 'NO_KNOWLEDGE_REQUIRED' } };
    } },
    roleRunner: { async run(call) {
      assert.doesNotMatch(call.messages[1].content, new RegExp(notice, 'u'));
      if (call.role_id === 'gameplay_narrator') return { output: { prose: 'У ворот пусто.' } };
      if (call.role_id === 'gameplay_narrator_auditor') {
        const wire = JSON.parse(call.messages[1].content);
        assert.equal(Object.hasOwn(wire, 'world_knowledge'), false);
        return { output: { reviewed_segments: ['p1'], source_reviews: [],
          unsupported: [], literary_failures: [], evidence: ['Сегмент проверен.'] } };
      }
      throw new Error(`Unexpected role ${call.role_id}`);
    } }
  });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'no-knowledge-required-projection', surface: 'turn',
    visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'У ворот пусто.', visible_changes: [], uncertainties: [],
      sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
      do_not_imply: [], allowed_tensions: [] }, context: {} });
  assert.equal(result.status, 'approved');
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
      if (call.role_id === 'gameplay_narrator') {
        assert.ok(call.messages[1].content.includes(sample.change));
        assert.doesNotMatch(call.messages[1].content, /request_id|output_id|\[\s*\]/u);
        assert.match(call.messages[0].content,
          /^Возвращай только объект JSON вида \{"prose":"<полный русский текст прозы>"\}\./u);
        assert.match(call.messages[0].content,
          /Передай каждый источник required_current_beat ровно один раз/u);
        assert.match(call.messages[0].content,
          /Показывай невыполненное продолжение как открытый следующий выбор игрока/u);
        assert.match(call.messages[0].content, /Сначала передай текущий эпизод/u);
        assert.doesNotMatch(call.messages[0].content, /результат удержания/u);
        return { output: { prose: dump
          ? `${sample.prose} ${visible.sensory_details.join(' ')}` : sample.prose } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /качественная оценка или вывод может быть воспринимаемым результатом/u);
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.match(call.messages[1].content, /Замечания аудитора/u);
        assert.match(call.messages[1].content, /неизменённые детали/u);
        return { output: { replacements: [{ prose: sample.prose }] } };
      }
      const wire = JSON.parse(call.messages[1].content);
      assert.deepEqual(wire.required_current_beat?.changes ?? [], [{ ref: 'c1', text: sample.change }]);
      assert.deepEqual(wire.segments.map(({ segment_id }) => segment_id),
        wire.segments.map((_, index) => `p${index + 1}`));
      assert.doesNotMatch(JSON.stringify(wire), /request_id|output_id|visible_change_1|"segment_id":"s1"/u);
      const ids = wire.segments.map(({ segment_id }) => segment_id);
      return { output: { ...reviewedNarration(wire.segments, { c1: ids }),
        evidence: ['Подтверждённое изменение сохранено.'] } };
    } } });
    const result = await service.run({ version: 1, schema: 'narration_request', request_id: `${sample.name}-${dump}`,
      surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose,
      dump ? `${sample.prose} ${visible.sensory_details.join(' ')}` : sample.prose);
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  }
});
