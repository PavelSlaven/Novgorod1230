import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';

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
    assert.match(prompt, /overlap, duration and persistence between facts require explicit supporting basis/u);
    assert.match(prompt, /not ambience, silence or subjective tempo/u);
    const input = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: sample.bad, action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(prompt, /concerns are not an exhaustive whitelist/u);
      assert.match(prompt, /shorten rather than embellish/u);
      assert.equal(input.segments[0].prose, sample.bad);
      assert.ok(input.concerns.some(({ kind }) => kind === 'unsupported_event'));
      return { output: { replacements: [{ prose: sample.repaired }] } };
    }
    assert.match(prompt, /mechanically attached time report/u);
    assert.match(prompt, /a pending remainder becomes metadata\/explanation/u);
    const audit = { ...reviewedNarration(input.segments), pass: true,
      artistic_verdict: 'pass', technical_verdict: 'pass', concerns: [],
      evidence: ['Each supplied result is covered; the pending choice remains open.'],
      coverage: { visible_change_1: ['s1'], visible_change_2: ['s1'],
        uncertainty_1: [`s${input.segments.length}`] } };
    if (input.phase === 'initial') {
      audit.pass = false;
      audit.artistic_verdict = audit.technical_verdict = 'fail';
      audit.failure_checks.elapsed_as_service_report = ['s1'];
      audit.failure_checks.weak_literary_composition = [`s${input.segments.length}`];
      audit.concerns = [
        { segment_choice: 's1', kind: 'unsupported_event', reason: 'No overlap or duration basis links speaking to the elapsed interval.' },
        { segment_choice: 's1', kind: 'technical_presentation', reason: 'Elapsed time is attached mechanically through an invented relation.' },
        { segment_choice: `s${input.segments.length}`, kind: 'literary_quality', reason: 'The remainder is a planning report rather than an open concrete choice.' }
      ];
      audit.evidence = ['The temporal relation is unsupported and the remainder reads as planning metadata.'];
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
  assert.equal(visible.visible_changes[0], 'Вы произнесли: «Онисим!»; этот шаг занял 1 минуту.');
  assert.equal(visible.visible_changes[2], `Вы в течение 5 минут выполняли попытку: «${description}». Результат наблюдения не установлен.`);
  assert.equal(visible.visible_changes.some(change => change.startsWith('Прошло ')), false);
  const prose = '«Онисим!» — зовёте вы: на оклик уходит минута. Обнаружив на берегу длинную ветвь, вы осторожно прощупываете ею воду между обломками в течение следующих пяти минут; что находится под водой, пока неясно.';
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text), visible.visible_changes);
    assert.deepEqual(wire.required_current_beat.uncertainties, []);
    assert.deepEqual(wire.optional_support, { visible_scene: scene.visible_scene, sensory_details: scene.sensory_details });
    assert.match(call.messages[0].content, /physical handling\/contact happened for the supplied applied duration/u);
    assert.match(call.messages[0].content, /goal_result pending does not mean an applied operation was unexecuted/u);
    assert.doesNotMatch(call.messages[0].content, /Convey the concrete pending action as unstarted/u);
    if (call.role_id === 'gameplay_narrator') return { output: { prose, action_options: [], used_references: [] } };
    assert.equal(call.role_id, 'gameplay_narrator_auditor');
    const pass = call.messages[0].content.includes('Do not turn an applied attempt into an unstarted action');
    return { output: { ...reviewedNarration(wire.segments), pass,
      artistic_verdict: 'pass', technical_verdict: 'pass',
      coverage: Object.fromEntries(wire.required_current_beat.changes.map(({ ref }, index) => [ref, [`s${index + 1}`]])),
      concerns: pass ? [] : [{ segment_choice: 's3', kind: 'unsupported_attempt',
        reason: 'Прощупывание должно остаться неначатым, а не совершённым действием.' }],
      evidence: [pass ? 'Committed handling happened; its observation outcome remains unknown.' : 'Attempt incorrectly treated as unstarted.'] } };
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
      `Вы выполнили попытку: «${sample.attempt}». Прошло ${sample.duration} минут. Результат наблюдения не установлен.`],
    uncertainties: [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
    allowed_tensions: [], do_not_imply: [] };
  const calls = [];
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    assert.match(call.messages[0].content, /chain of clauses without scene\/action composition, linked mainly by bare or metadata time announcements/u);
    assert.match(call.messages[0].content, /Do not invent ambience, reactions or concurrent action/u);
    if (call.role_id === 'gameplay_narrator') return { output: { prose: sample.bad, action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.ok(wire.concerns.some(({ kind }) => kind === 'literary_quality'));
      return { output: { replacements: [{ prose: sample.good }] } };
    }
    const ids = wire.segments.map(({ segment_id }) => segment_id);
    assert.match(call.messages[0].content, /exactly the supplied segment_id values; copy them unchanged/u);
    const pass = wire.phase === 'final';
    const finding = 'Короткие факты сцеплены главным образом отдельными отметками времени; причинная сцена не сложилась, хотя факты поддержаны.';
    const audit = { ...reviewedNarration(wire.segments), pass,
      artistic_verdict: pass ? 'pass' : 'fail', technical_verdict: pass ? 'pass' : 'fail',
      coverage: Object.fromEntries(wire.required_current_beat.changes.map(({ ref }) => [ref, ids])),
      concerns: pass ? [] : [{ segment_choice: ids[0], kind: 'literary_quality', reason: finding },
        { segment_choice: ids[0], kind: 'technical_presentation', reason: finding }],
      evidence: [pass ? 'Длительности принадлежат выполненным физическим эпизодам; открытый результат не подменён успехом или выдуманной реакцией.' : finding] };
    if (!pass) {
      audit.failure_checks.elapsed_as_service_report = [ids[0]];
      audit.failure_checks.weak_literary_composition = [ids[0]];
    }
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
      `Вы выполнили попытку: «${sample.action}». Результат наблюдения не установлен.`],
    uncertainties: [], sensory_details: sample.support, visible_npc: [], visible_objects: [],
    known_context: [], allowed_tensions: [], do_not_imply: [] };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    const prompt = call.messages[0].content;
    assert.match(prompt, /Exact elapsed time must modify that same applied action\/result, never the duration or persistence of static/u);
    assert.match(prompt, /Distinguish action duration from delay before action/u);
    assert.match(prompt, /Every unresolved-result proposition inside a required change must remain explicitly unknown/u);
    assert.match(prompt, /render it naturally as speech in the scene, not a typed speech-event report/u);
    if (call.role_id === 'gameplay_narrator') return { output: { prose: sample.bad, action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.ok(wire.concerns.some(({ kind }) => kind === 'missing_visible_change'));
      assert.ok(wire.concerns.some(({ kind }) => kind === 'unsupported_event'));
      return { output: { replacements: [{ prose: sample.good }] } };
    }
    assert.match(prompt, /Coverage requires every proposition within the source/u);
    const ids = wire.segments.map(({ segment_id }) => segment_id);
    const pass = wire.phase === 'final';
    const audit = { ...reviewedNarration(wire.segments), pass, artistic_verdict: pass ? 'pass' : 'fail',
      technical_verdict: pass ? 'pass' : 'fail',
      coverage: { visible_change_1: ids, visible_change_2: ids, visible_change_3: pass ? ids : [] },
      concerns: pass ? [] : [
        { segment_choice: ids[1], kind: 'unsupported_event', reason: 'Длительность оклика перенесена на постоянство sensory support без основания.' },
        { segment_choice: ids.at(-1), kind: 'technical_presentation', reason: 'Длительность выполненного контакта превращена в задержку до его начала.' },
        { segment_choice: ids[0], kind: 'missing_visible_change', reason: 'Пропущено, что результат наблюдения остаётся неизвестным внутри visible_change_3.' },
        { segment_choice: ids[0], kind: 'literary_quality', reason: 'Речь и находка поданы как последовательность записей отчёта.' }],
      evidence: [pass ? 'Длительности относятся к оклику и контакту; sensory support не получает длительность. Результат явно неизвестен, речь дословна.'
        : 'Все исходные слова известны, но временная связь и полнота смысла required change нарушены.'] };
    if (!pass) {
      audit.failure_checks.elapsed_as_service_report = [ids.at(-1)];
      audit.failure_checks.weak_literary_composition = [ids[0]];
    }
    return { output: audit };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request', request_id: sample.name,
    surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.good);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});
