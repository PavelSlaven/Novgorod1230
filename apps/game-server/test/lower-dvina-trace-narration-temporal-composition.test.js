import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';

function audited(wire, {
  sourceReviews = wire.required_current_beat.changes.concat(wire.required_current_beat.uncertainties)
    .map(({ ref }) => ({ ref, segment_choices: wire.segments.map(({ segment_id }) => segment_id) })),
  unsupported = [], literaryFailures = [], evidence = ['All required sources are covered.']
} = {}) {
  return {
    reviewed_segments: wire.segments.map(({ segment_id }) => segment_id),
    source_reviews: sourceReviews,
    unsupported,
    literary_failures: literaryFailures,
    evidence
  };
}

for (const sample of [
  { name: 'live-shaped speech and pending probing', words: 'Онисим!',
    change: 'Прошла одна минута.', pending: 'Прощупывать воду ветвью вы ещё не начали; результат неизвестен.',
    bad: 'Пока вы зовёте: «Онисим!», у тихого берега проходит минута. Прощупывание воды ветвью остаётся невыполненной частью намерения.',
    repaired: '«Онисим!» — зовёте вы; минута миновала. Прощупывать воду ветвью вы ещё не начали — результат неизвестен; продолжить задуманное или передумать пока можно.' },
  { name: 'unseen warning and pending retreat', words: 'Осторожно!',
    change: 'Прошло две минуты.', pending: 'Вы ещё не отступили к воротам; результат неизвестен.',
    bad: 'Две минуты тянутся, пока вы предупреждаете: «Осторожно!» Отступление к воротам значится следующим пунктом вашего плана.',
    repaired: '«Осторожно!» — предупреждаете вы; две минуты миновали. Вы ещё не отступили к воротам — можно сделать это или выбрать другое действие; результат пока неизвестен.' }
]) test(`${sample.name}: unsupported relation and metadata composition require one whole-prose repair`, async () => {
  const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Берег у ворот',
    visible_changes: [sample.change, `Вы произнесли: «${sample.words}»`],
    uncertainties: [sample.pending], sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], allowed_tensions: [], do_not_imply: [] };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const prompt = call.messages[0].content;
    const input = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(prompt, /Put the current beat first/u);
      assert.match(prompt, /Required changes are ordered:[\s\S]*never subordinate the earlier action/u);
      assert.match(prompt, /Ground every sensation, action, temporal relation and causal link/u);
      return { output: { prose: sample.bad, action_options: [], used_references: [] } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(prompt, /concerns are not an exhaustive whitelist/u);
      assert.match(prompt, /shorten rather than embellish/u);
      assert.match(prompt, /replacement must differ from the rejected prose/u);
      assert.match(prompt, /combine their total in that action sentence/u);
      assert.equal(input.segments[0].prose, sample.bad);
      assert.ok(input.concerns.some(({ kind }) => kind === 'unsupported_event'));
      return { output: { replacements: [{ prose: sample.repaired }] } };
    }
    assert.match(prompt, /Silently split[\s\S]*every factual proposition/u);
    assert.match(prompt, /If prose reverses ordered performed actions[\s\S]*unsupported_event/u);
    assert.match(prompt, /source_reviews must contain exactly/u);
    const audit = audited(input, {
      evidence: ['Each supplied result is covered; the pending choice remains open.']
    });
    if (input.phase === 'initial') {
      audit.unsupported = [{ segment_choice: 's1', kind: 'unsupported_event',
        reason: 'No overlap or duration basis links speaking to the elapsed interval.' }];
      audit.literary_failures = [
        { check: 'elapsed_as_service_report', segment_choice: 's1',
          reason: 'Elapsed time is attached mechanically through an invented relation.' },
        { check: 'weak_literary_composition', segment_choice: `s${input.segments.length}`,
          reason: 'The remainder is a planning report rather than an open concrete choice.' }
      ];
      audit.evidence = [];
    }
    return { output: audit };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: sample.name, surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.repaired);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});


test('committed transient motion is performed while only its observation result remains open', async () => {
  const { createLowerDvinaTraceTurnStepVisibleProjector } = await import('../src/runtime/lower-dvina-trace-turn-step-fire-visible.js');
  const description = 'и длинной ветвью осторожно прощупываю воду между обломками.';
  const scene = { version: 1, schema: 'visible_context_package', visible_scene: 'Берег крушения',
    visible_changes: [], uncertainties: [], sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], allowed_tensions: [], do_not_imply: [] };
  const speech = { turn_step_1: { kind: 'semantic_activity', duration_minutes: 1 } };
  const discovery = { ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution: 'materialized',
    query: 'длинная ветвь', display_name: 'длинная ветвь' } };
  const handling = { turn_step_3: { kind: 'semantic_activity', duration_minutes: 5 },
    turn_step_item_use_3: { kind: 'transient_item_use', description } };
  const plans = [{ resolution: 'direct', direct_result_kind: 'player_utterance', utterance: { utterance_text: 'Онисим!' } },
    { resolution: 'domain_request', goal_result: 'pending', operations: [{ op: 'request_discovery', query: 'длинная ветвь' }] },
    { resolution: 'domain_request', goal_result: 'pending', continuation: null,
      operations: [{ op: 'request_item_use', use_kind: 'other', description }] }];
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: { project: async () => assert.fail() } })
    .project({ retrieved_state: { current_visible_context: scene },
      consequence: { status: 'resolved', visible_seed: { ...speech, ...discovery, ...handling } },
      time_update: { prepared_effect_ledger: { slices: [speech, discovery, handling]
        .map((visible_seed, index) => ({ step_index: index + 1, consequence: { visible_seed } })) } },
      mode_resolution: { decision_trace: { remaining_intent: null,
        step_traces: plans.map((approved_plan, index) => ({ step_index: index + 1, applied: true, approved_plan })) } } });
  assert.deepEqual(visible.uncertainties, []);
  assert.ok(visible.visible_changes[2].includes(`«${description}»`));
  assert.equal(visible.visible_changes[0], 'За 1 минуту вы произнесли: «Онисим!».');
  assert.equal(visible.visible_changes[2], `Вы в течение 5 минут выполняли попытку: «${description}».`);
  assert.equal(visible.visible_changes[3], 'В ходе этой попытки результат наблюдения не установлен.');
  assert.equal(visible.visible_changes.some(change => change.startsWith('Прошло ')), false);
  const prose = '«Онисим!» — зовёте вы: на оклик уходит минута. Обнаружив на берегу длинную ветвь, вы осторожно прощупываете ею воду между обломками в течение следующих пяти минут; что находится под водой, пока неясно.';
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text), visible.visible_changes);
    assert.deepEqual(wire.required_current_beat.uncertainties, []);
    assert.deepEqual(wire.optional_support, { visible_scene: scene.visible_scene, sensory_details: scene.sensory_details });
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /committed transient attempt is independent evidence of performed physical[\s\S]*contact/u);
      assert.match(call.messages[0].content, /performed handling stays performed even when its observation result is unknown/u);
    } else {
      assert.match(call.messages[0].content, /source_reviews must contain exactly/u);
    }
    if (call.role_id === 'gameplay_narrator') return { output: { prose, action_options: [], used_references: [] } };
    assert.equal(call.role_id, 'gameplay_narrator_auditor');
    return { output: audited(wire, {
      evidence: ['Committed handling happened; its observation outcome remains unknown.']
    }) };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request', request_id: 'committed-transient',
    surface: 'turn', visible_context: visible, context: { outcome: { goal_result: 'pending' } } });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, prose);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});


for (const sample of [
  { name: 'captured factual time ledger', words: 'Онисим!', material: 'длинная ветвь',
    duration: 5, attempt: 'Осторожно прощупываю ветвью воду между обломками.',
    bad: '— Онисим! — произносите вы. Проходит минута. Обнаруживается длинная ветвь. Спустя пять минут вы заканчиваете прощупывать ею воду между обломками. Результат наблюдения неизвестен.',
    good: '«Онисим!» — зовёте вы: на оклик уходит минута. Обнаружив длинную ветвь, вы осторожно прощупываете ею воду между обломками в течение следующих пяти минут; что находится под водой, пока неясно.' },
  { name: 'unseen cloth contact scene', words: 'Берегись!', material: 'сухой лоскут',
    duration: 2, attempt: 'Провожу сухим лоскутом по краю глиняной чаши.',
    bad: 'Вы произносите: «Берегись!» Минута прошла. Обнаруживается сухой лоскут. Через две минуты вы заканчиваете проводить им по краю глиняной чаши. Результат наблюдения неизвестен.',
    good: '«Берегись!» — предупреждаете вы, потратив на оклик минуту; затем обнаруживаете сухой лоскут и две минуты проводите им по краю глиняной чаши. Что это позволило заметить, пока неизвестно.' }
]) test(`${sample.name}: report composition fails and grounded whole-scene repair passes`, async () => {
  const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'У воды',
    visible_changes: [`Вы произнесли: «${sample.words}». Прошла 1 минута.`,
      `Обнаружено: «${sample.material}».`,
      `Вы выполнили попытку: «${sample.attempt}». Прошло ${sample.duration} минут.`,
      'В ходе этой попытки результат наблюдения не установлен.'],
    uncertainties: [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
    allowed_tensions: [], do_not_imply: [] };
  const calls = [];
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /Put the current beat first/u);
      assert.match(call.messages[0].content, /Sparse evidence calls for concise prose/u);
      return { output: { prose: sample.bad, action_options: [], used_references: [] } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.ok(wire.concerns.some(({ kind }) => kind === 'literary_quality'));
      return { output: { replacements: [{ prose: sample.good }] } };
    }
    const ids = wire.segments.map(({ segment_id }) => segment_id);
    assert.match(call.messages[0].content, /reviewed_segments must copy every[\s\S]*exactly once and in order/u);
    const pass = wire.phase === 'final';
    const finding = 'Короткие факты сцеплены главным образом отдельными отметками времени; причинная сцена не сложилась, хотя факты поддержаны.';
    const audit = audited(wire, {
      literaryFailures: pass ? [] : [
        { check: 'elapsed_as_service_report', segment_choice: ids[0], reason: finding },
        { check: 'weak_literary_composition', segment_choice: ids[0], reason: finding }
      ],
      evidence: pass
        ? ['Длительности принадлежат выполненным физическим эпизодам; открытый результат не подменён успехом или выдуманной реакцией.']
        : []
    });
    return { output: audit };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request', request_id: sample.name,
    surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.good);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});


for (const sample of [
  { name: 'captured static-time transfer and postponed probing', words: 'Онисим!', material: 'длинная ветвь',
    action: 'Пять минут осторожно прощупываю длинной ветвью воду между обломками.',
    support: ['Над берегом тянется низкое сырое небо.', 'У самой воды слышен плеск.', 'У воды лежат разбитые доски и обрывки снастей.'],
    bad: 'Вы произнесли: «Онисим!» В течение одной минуты над берегом тянется низкое сырое небо, а у самой воды слышен плеск. Среди обломков обнаруживается длинная ветвь. Спустя пять минут вы осторожно прощупываете ею воду между обломками.',
    good: '«Онисим!» — зовёте вы; минута уходит на оклик. У самой воды, среди разбитых досок и обрывков снастей, вы находите длинную ветвь. Следующие пять минут вы осторожно прощупываете ею воду между обломками. Что показало прощупывание, пока остаётся неясным.' },
  { name: 'unseen static-light transfer and postponed cloth contact', words: 'Берегись!', material: 'сухой лоскут',
    action: 'Пять минут провожу сухим лоскутом по краю глиняной чаши.',
    support: ['Свет падает на глиняную чашу.', 'Край чаши шероховатый.'],
    bad: 'Вы произнесли: «Берегись!» Минуту на глиняную чашу падает свет. Обнаруживается сухой лоскут. После пяти минут вы проводите им по краю чаши.',
    good: '«Берегись!» — предупреждаете вы; минута уходит на оклик. Найдя сухой лоскут, вы следующие пять минут проводите им по шероховатому краю глиняной чаши. Что удалось заметить, пока неясно.' }
]) test(`${sample.name}: temporal aspect and every embedded uncertainty are mandatory`, async () => {
  const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Текущее место',
    visible_changes: [`Вы произнесли: «${sample.words}». Прошла 1 минута.`, `Обнаружено: «${sample.material}».`,
      `Вы выполнили попытку: «${sample.action}».`,
      'В ходе этой попытки результат наблюдения не установлен.'],
    uncertainties: [], sensory_details: sample.support, visible_npc: [], visible_objects: [],
    known_context: [], allowed_tensions: [], do_not_imply: [] };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    const prompt = call.messages[0].content;
    if (call.role_id === 'gameplay_narrator') {
      assert.match(prompt, /Integrate a supplied duration into its own action/u);
      assert.match(prompt, /Every unresolved-result proposition inside a required change must remain explicitly unknown/u);
      assert.match(prompt, /Preserve confirmed speech verbatim/u);
      return { output: { prose: sample.bad, action_options: [], used_references: [] } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.ok(wire.concerns.some(({ kind }) => kind === 'missing_visible_change'));
      assert.ok(wire.concerns.some(({ kind }) => kind === 'unsupported_event'));
      return { output: { replacements: [{ prose: sample.good }] } };
    }
    assert.match(prompt, /source_reviews must contain exactly/u);
    const ids = wire.segments.map(({ segment_id }) => segment_id);
    const pass = wire.phase === 'final';
    const audit = audited(wire, {
      sourceReviews: wire.required_current_beat.changes.concat(wire.required_current_beat.uncertainties)
        .map(({ ref }, index) => ({ ref, segment_choices: !pass && index === 3 ? [] : ids })),
      unsupported: pass ? [] : [{ segment_choice: ids[1], kind: 'unsupported_event',
        reason: 'Длительность оклика перенесена на постоянство sensory support без основания.' }],
      literaryFailures: pass ? [] : [
        { check: 'elapsed_as_service_report', segment_choice: ids.at(-1),
          reason: 'Длительность выполненного контакта превращена в задержку до его начала.' },
        { check: 'weak_literary_composition', segment_choice: ids[0],
          reason: 'Речь и находка поданы как последовательность записей отчёта.' }
      ],
      evidence: pass
        ? ['Длительности относятся к оклику и контакту; sensory support не получает длительность. Результат явно неизвестен, речь дословна.']
        : []
    });
    return { output: audit };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request', request_id: sample.name,
    surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.good);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});
