import { reviewedNarration } from './narration-audit-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationAudit } from '@rus/narration';
import { assembleNarrationRoleOutput } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { recoverTracePendingPresentation } from '../src/runtime/lower-dvina-trace-presentation-recovery.js';

const capturedV9Prose = "Прошла минута. Вы выкрикнули: «Онисим!», но над открытым берегом лишь тянется низкое сырое небо, а у самой воды слышен лишь плеск реки. Вдоль берега тянутся мокрый песок и ивняк, перемежаясь с полосой камыша и осоки; среди обломков, разбитых досок и обрывков снастей лежат вынесенные течением ветви. Между мокрым песком и ивняком начинается приметная тропа, чье продолжение скрывается за кустами. Вы всё ещё собираетесь осторожно прощупать длинной ветвью воду между обломками, но пока не знаете, что там обнаружится.";

const visible = {
  version: 1, schema: 'visible_context_package', visible_scene: 'берег крушения',
  visible_changes: ['Прошло 1 минута.', 'Вы произнесли: «Онисим!»'],
  uncertainties: ['Ещё не выполнено: «и длинной ветвью осторожно прощупываю воду между обломками.». Результат этой попытки не установлен.'],
  sensory_details: ['Над открытым берегом тянется низкое сырое небо.',
    'У самого берега слышен плеск воды.', 'У воды лежат разбитые доски и обрывки снастей.',
    'Мокрый песок и ивняк тянутся вдоль берега реки.',
    'У воды тянется полоса камыша и осоки; среди обломков лежат вынесенные течением ветви.',
    'Между песком и ивняком начинается тропа; за кустами её продолжения не видно.'],
  visible_objects: [], visible_npc: [],
  known_context: ['При вас нижняя рубаха, хозяйственный нож и верхняя шерстяная одежда.'],
  allowed_tensions: [], do_not_imply: []
};
const bad = 'Прошла минута. Вы произнесли: «Онисим!»\n\nНад открытым берегом тянется низкое сырое небо. У самой воды слышен плеск, а среди обломков — разбитых досок и обрывков снастей — лежат вынесенные течением ветви. Вдоль берега тянется полоса камыша и осоки, переходящая в мокрый песок и ивняк. Между песком и кустами начинается приметная тропа, за которыми её продолжения не видно. При вас остаются нижняя рубаха, хозяйственный нож и верхняя шерстяная одежда.';
const speech = 'За прошедшую минуту вы позвали: «Онисим!»';
const pending = 'Прощупывать воду между обломками длинной ветвью вы ещё не начали; что это даст, пока неизвестно. Продолжать задуманное или передумать — решать вам.';
const good = `${speech} У берега плещется вода.\n\n${pending}`;
const successfulAudit = {
  ...reviewedNarration(['s1', 's2', 's3', 's4'].map((segment_id) => ({ segment_id }))),
  artistic_verdict: 'pass', technical_verdict: 'pass',
  pass: true, concerns: [], evidence: ['Speech and pending intent remain distinct.'],
  coverage: { visible_change_1: ['s1'], visible_change_2: ['s1', 's2'], uncertainty_1: ['s3', 's4'] }
};

test('closed audit coverage rejects missing, malformed and incoherent claims', async (t) => {
  const request = { visible_context: visible,
    segments: ['s1', 's2', 's3', 's4'].map((segment_id) => ({ segment_id })) };
  const validate = (output) => validateNarrationAudit(
    assembleNarrationRoleOutput('gameplay_narrator_auditor', output, request),
    request.segments.map(({ segment_id }) => segment_id), { visible_changes: 2, uncertainties: 1 });
  assert.equal(validate(successfulAudit).ok, true);
  assert.deepEqual(assembleNarrationRoleOutput('gameplay_narrator_auditor', successfulAudit, request).coverage,
    { visible_changes: [{ source_index: 0, segment_ids: ['s1'] },
      { source_index: 1, segment_ids: ['s1', 's2'] }],
    uncertainties: [{ source_index: 0, segment_ids: ['s3', 's4'] }] });
  const mutations = {
    old_free_text_pass: (a) => { delete a.coverage; delete a.artistic_verdict; delete a.technical_verdict; },
    missing: (a) => { delete a.coverage.uncertainty_1; },
    merged: (a) => { delete a.coverage.visible_change_2; },
    old_positional: (a) => { a.coverage = { visible_changes: [['s1'], ['s2']], uncertainties: [['s3']] }; },
    wrong_key: (a) => { a.coverage.visible_change_01 = a.coverage.visible_change_1; delete a.coverage.visible_change_1; },
    captured_v11_prose: (a) => { a.coverage.visible_change_1 = ['s1', 'Прошла минута.']; },
    unknown_segment: (a) => { a.coverage.uncertainty_1 = ['s99']; },
    unknown_alias: (a) => { a.coverage.uncertainty_1 = ['s01']; },
    synthetic_alias: (a) => { a.coverage.uncertainty_1 = ['segment_1']; },
    empty_segment: (a) => { a.coverage.uncertainty_1 = []; },
    duplicate_segment: (a) => { a.coverage.uncertainty_1 = ['s1', 's1']; },
    malformed: (a) => { a.coverage.uncertainty_1 = 'covered'; },
    null_value: (a) => { a.coverage.uncertainty_1 = null; },
    object_value: (a) => { a.coverage.uncertainty_1 = { segment: 's3' }; },
    number_value: (a) => { a.coverage.uncertainty_1 = 3; },
    extra_field: (a) => { a.coverage.extra = []; },
    incoherent_artistic: (a) => { a.artistic_verdict = 'fail'; },
    incoherent_technical: (a) => { a.technical_verdict = 'fail'; },
    false_check_on_pass: (a) => { a.failure_checks.elapsed_as_service_report = ['s1']; },
    missing_check: (a) => { delete a.failure_checks.current_beat_buried; },
    old_all_true: (a) => { delete a.failure_checks; a.scene_checks = { current_beat_centered: true, elapsed_integrated: true, static_context_selective: true, literary_quality: true, nontechnical_presentation: true }; },
    missing_review: (a) => { a.reviewed_segments.pop(); },
    duplicate_review: (a) => { a.reviewed_segments[3] = 's1'; },
    noncanonical_review: (a) => { a.reviewed_segments[3] = 's04'; },
    malformed_review: (a) => { a.reviewed_segments[3] = ['s4']; },
    bad_failure_choice: (a) => { a.failure_checks.static_context_dump = ['s99']; },
    duplicate_failure: (a) => { a.failure_checks.static_context_dump = ['s1', 's1']; },
    nested_failure: (a) => { a.failure_checks.static_context_dump = [['s1']]; },
    null_failure: (a) => { a.failure_checks.static_context_dump = null; },
    object_failure: (a) => { a.failure_checks.static_context_dump = {}; },
    number_failure: (a) => { a.failure_checks.static_context_dump = 1; },
    unknown_failure_key: (a) => { a.failure_checks.other = []; },
    no_evidence: (a) => { a.evidence = []; },
    captured_v10_scalar_evidence: (a) => { a.evidence = 'Speech and pending intent remain distinct.'; },
    object_evidence: (a) => { a.evidence = { finding: 'Grounded.' }; },
    empty_evidence_entry: (a) => { a.evidence = [' ']; }
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, () => {
    const audit = structuredClone(successfulAudit);
    mutate(audit);
    assert.equal(validate(audit).ok, false);
  });
  const empty = { ...successfulAudit, ...reviewedNarration([{ segment_id: 's1' }]), coverage: {  } };
  assert.equal(validateNarrationAudit(assembleNarrationRoleOutput('gameplay_narrator_auditor', empty,
    { ...request, segments: [{ segment_id: 's1' }], visible_context: { visible_changes: [], uncertainties: [] } }),
    ['s1'], { visible_changes: 0, uncertainties: 0 }).ok, true);
});

test('unseen warning with pending movement and observation passes as concise prose', async () => {
  const prose = '«Берег осыпается!» — говорите вы, подняв ладонь. Отойти к вербе и осмотреть склон вы ещё не успели; что откроется оттуда, неизвестно — можно продолжить задуманное или выбрать иной путь.';
  const context = { ...visible, visible_changes: ['Вы сказали: «Берег осыпается!»', 'Вы подняли ладонь.'],
    uncertainties: ['Вы ещё не отошли к вербе и не осмотрели склон; результат неизвестен.'] };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'gameplay_narrator') return { output: { prose, action_options: [], used_references: [], self_check: {} } };
    assert.equal(call.role_id, 'gameplay_narrator_auditor');
    assert.match(call.messages[0].content, /current_beat_buried \(required result displaced\)/);
    assert.match(call.messages[0].content, /elapsed_as_service_report \(isolated service datum or mechanically attached time report/);
    const prompt = call.messages[0].content;
    const shape = JSON.parse(prompt.match(/not a verdict\): (.*?)\. Replace null/u)[1]);
    assert.deepEqual(shape.coverage, { visible_change_1: [],
      visible_change_2: [], uncertainty_1: [] });
    const beat = JSON.parse(call.messages[1].content).required_current_beat;
    const sources = Object.fromEntries([...beat.changes, ...beat.uncertainties].map(({ ref, text }) => [ref, text]));
    assert.deepEqual(sources, { visible_change_1: context.visible_changes[0],
      visible_change_2: context.visible_changes[1], uncertainty_1: context.uncertainties[0] });
    return { output: { ...successfulAudit, ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: ['s1', 's2'],
      visible_change_2: ['s2'], uncertainty_1: ['s3'] } } };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request', request_id: 'unseen',
    surface: 'turn', visible_context: context, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, prose);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});

test('copying the illustrative audit shape blocks without repair or approval', async () => {
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: good, action_options: [], used_references: [] } };
    assert.equal(call.role_id, 'gameplay_narrator_auditor');
    return { output: JSON.parse(call.messages[0].content.match(/not a verdict\): (.*?)\. Replace null/u)[1]) };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'copied-audit-shape', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.phase, 'audit_validation');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});

test('captured V7 static recap FAIL triggers one whole-prose repair', async () => {
  const calls = [];
  let audits = 0;
  const service = createLowerDvinaTraceNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: bad, action_options: [], used_references: [], self_check: {}
      } };
      if (call.role_id === 'gameplay_narrator_auditor') return { output: ++audits === 1
        ? { pass: false, artistic_verdict: 'fail', technical_verdict: 'fail',
          ...reviewedNarration(JSON.parse(call.messages[1].content).segments),
          failure_checks: { current_beat_buried: ['s1'], elapsed_as_service_report: ['s1'],
            static_context_dump: ['s1'], weak_literary_composition: ['s1'], unsupported_response_or_continuation: [] },
          coverage: { visible_change_1: [], visible_change_2: [], uncertainty_1: [] }, concerns: [
            { segment_choice: 's1', kind: 'missing_visible_change', reason: visible.uncertainties[0] },
            { segment_choice: 's1', kind: 'literary_quality', reason: 'Static recap dominates current beat.' },
            { segment_choice: 's1', kind: 'technical_presentation', reason: 'Bare service opener.' }
          ], evidence: ['Pending action is absent.'] }
        : successfulAudit };
      const repair = JSON.parse(call.messages[1].content);
      assert.equal(call.role_id, 'gameplay_narrator_semantic_repair');
      assert.equal(repair.segments.length, 1);
      assert.ok(repair.concerns.some(({ kind, reason }) =>
        kind === 'missing_visible_change' && reason.includes(visible.uncertainties[0])));
      return { output: { replacements: [{ prose: good }] } };
    }
  } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'captured-v7', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, good);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('missing uncertainty coverage blocks both initial and final PASS without another call', async () => {
  for (const malformedPhase of ['initial', 'final']) {
    const calls = [];
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const input = JSON.parse(call.messages[1].content);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: good, action_options: [], used_references: [], self_check: {} } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
        replacements: [{ prose: good }] } };
      const audit = structuredClone(successfulAudit);
      if (input.phase === malformedPhase) delete audit.coverage.uncertainty_1;
      else {
        audit.pass = false;
        audit.artistic_verdict = 'fail';
        audit.failure_checks.weak_literary_composition = ['s1'];
        audit.concerns = [{ segment_choice: 's1', kind: 'literary_quality',
          reason: 'Rewrite the current beat coherently.' }];
      }
      return { output: audit };
    } } });
    const result = await service.run({ version: 1, schema: 'narration_request',
      request_id: 'missing-coverage', surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.status, 'blocked');
    assert.equal(calls.length, malformedPhase === 'initial' ? 2 : 4);
  }
});

test('each failed scene axis requires a matching model concern and cannot coexist with PASS', () => {
  const request = { visible_context: visible,
    segments: ['s1', 's2', 's3', 's4'].map((segment_id) => ({ segment_id })) };
  for (const key of Object.keys(successfulAudit.failure_checks)) {
    const audit = structuredClone(successfulAudit);
    audit.failure_checks[key] = ['s1'];
    const validate = () => validateNarrationAudit(assembleNarrationRoleOutput(
      'gameplay_narrator_auditor', audit, request), ['s1', 's2', 's3', 's4'],
    { visible_changes: 2, uncertainties: 1 });
    assert.equal(validate().ok, false);
    audit.pass = false;
    const technical = key === 'elapsed_as_service_report';
    const unsupported = key === 'unsupported_response_or_continuation';
    if (!unsupported) audit[technical ? 'technical_verdict' : 'artistic_verdict'] = 'fail';
    assert.equal(validate().ok, false);
    audit.concerns = [{ segment_choice: 's1',
      kind: unsupported ? 'unsupported_npc_state' : technical ? 'technical_presentation' : 'literary_quality',
      reason: `The model found ${key} unsatisfied in this passage.` }];
    assert.equal(validate().ok, true);
  }
});

test('segment choices reject arrays, objects, null and numbers without coercion', () => {
  const request = { visible_context: visible,
    segments: ['s1', 's2', 's3', 's4'].map((segment_id) => ({ segment_id })) };
  for (const choice of [['s1'], { segment_choice: 's1' }, null, 1]) {
    for (const target of ['coverage', 'concern']) {
      const audit = structuredClone(successfulAudit);
      if (target === 'coverage') audit.coverage.visible_change_1 = [choice];
      else {
        audit.pass = false;
        audit.concerns = [{ segment_choice: choice, kind: 'unsupported_fact', reason: 'Not supplied.' }];
      }
      const validation = validateNarrationAudit(assembleNarrationRoleOutput(
        'gameplay_narrator_auditor', audit, request), ['s1', 's2', 's3', 's4'],
      { visible_changes: 2, uncertainties: 1 });
      assert.equal(validation.ok, false);
      assert.ok(validation.errors.some((error) => error.includes(target === 'coverage' ? 'coverage' : 'segment_id')));
    }
  }
});

const malformedNegativeAudit = {
  reviewed_segments: ['s1', 's2', 's3'],
  failure_checks: { current_beat_buried: [], elapsed_as_service_report: [{
    segment_choice: 's2', kind: 'elapsed_as_service_report',
    reason: 'Время вынесено в отдельный служебный отчёт.' }],
  static_context_dump: [], weak_literary_composition: [], unsupported_response_or_continuation: [] },
  coverage: { visible_change_1: ['s2'], visible_change_2: ['s3'], uncertainty_1: [] },
  artistic_verdict: 'fail', technical_verdict: 'fail', pass: false,
  concerns: [{ segment_choice: 's2', kind: 'elapsed_as_service_report',
    reason: 'Время вынесено в отдельный служебный отчёт.' }], evidence: []
};

test('captured malformed negative audit triggers only one whole-prose repair and requires strict final audit', async () => {
  for (const final of ['valid', 'malformed_positive', 'malformed_negative']) {
    const calls = [];
    const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(call.messages[1].content);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: bad, action_options: [], used_references: [] } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.deepEqual(wire.concerns, [{ segment_id: 's1',
          reason: malformedNegativeAudit.concerns[0].reason }]);
        assert.equal(wire.segments[0].prose, bad);
        return { output: { replacements: [{ prose: good }] } };
      }
      if (wire.phase === 'initial' || final === 'malformed_negative') return { output: malformedNegativeAudit };
      const audit = structuredClone(successfulAudit);
      if (final === 'malformed_positive') audit.reviewed_segments = ['s1'];
      return { output: audit };
    } } });
    const result = await narrator.run({ version: 1, schema: 'narration_request',
      request_id: `malformed-negative-${final}`, surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.audit_history[0].value.pass, false);
    assert.equal(result.audit_history[0].value.coverage, undefined);
    assert.equal(result.status, final === 'valid' ? 'approved' : 'blocked');
    if (final !== 'valid') assert.equal(result.diagnostics.phase, 'final_audit_validation');
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
      'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
  }
});

test('malformed audit without actionable negative concern cannot invoke semantic repair', async () => {
  for (const audit of [{}, { ...malformedNegativeAudit, pass: true },
    { ...malformedNegativeAudit, concerns: [] },
    { ...malformedNegativeAudit, concerns: [{ reason: '   ' }] }]) {
    const calls = [];
    const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      assert.notEqual(call.role_id, 'gameplay_narrator_semantic_repair');
      return { output: call.role_id === 'gameplay_narrator'
        ? { prose: good, action_options: [], used_references: [] } : audit };
    } } });
    const result = await narrator.run({ version: 1, schema: 'narration_request',
      request_id: 'nonactionable-negative', surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  }
});

test('captured V9 recovery repairs the whole scene without a second gameplay commit', async () => {
  const calls = [];
  let commits = 0;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const input = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: capturedV9Prose, action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.equal(input.segments[0].prose, capturedV9Prose);
      assert.match(call.messages[0].content, /Infer no hearing, answer, lack of answer, silence/);
      return { output: { replacements: [{ prose: good }] } };
    }
    if (input.phase === 'final') return { output: successfulAudit };
    return { output: malformedNegativeAudit };
  } } });
  const repository = {
    async loadPhase2State() { return { last_turn: { idempotency_key: 'committed-turn' } }; },
    async loadPhase2Replay() { return { screen: { screen_status: 'committed_presentation_pending' } }; },
    async commitPhase2Turn() { commits += 1; throw new Error('Gameplay must not run on presentation recovery.'); },
    async replayPhase2Turn({ narrator: service }) {
      const result = await service.run({ version: 1, schema: 'narration_request', request_id: 'committed-turn',
        surface: 'turn', visible_context: visible, context: {} });
      assert.equal(result.status, 'approved');
      return { screen: { screen_status: 'ready', main_prose: result.approved_output.prose } };
    }
  };
  const result = await recoverTracePendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending' } }, repository, narrator });
  assert.equal(result.screen.main_prose, good);
  assert.equal(commits, 0);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});


test('captured final PASS uses six actual supplied IDs and never positional aliases', () => {
  for (const ids of [['s1', 's2', 's3', 's4', 's5', 's6'],
    ['speech:a', 'time:b', 'discovery:c', 'motion:d', 'time:e', 'unknown:f']]) {
    const request = { phase: 'final', visible_context: visible,
      segments: ids.map((segment_id) => ({ segment_id, prose: 'Supplied reviewed segment.' })) };
    const raw = { ...reviewedNarration(request.segments), pass: true,
      artistic_verdict: 'pass', technical_verdict: 'pass', concerns: [],
      coverage: { visible_change_1: [ids[0], ids[1]], visible_change_2: [ids[2], ids[3]],
        uncertainty_1: [ids[4], ids[5]] },
      evidence: ['All six supplied segments reviewed; required facts and uncertainty covered.'] };
    const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw, request);
    assert.equal(validateNarrationAudit(assembled, ids, { visible_changes: 2, uncertainties: 1 }).ok, true);
    assert.deepEqual(assembled.coverage.uncertainties[0].segment_ids, [ids[4], ids[5]]);
    for (const alias of ['segment_1', 's01', 's99']) {
      for (const field of ['reviewed_segments', 'coverage', 'concerns']) {
        const bad = structuredClone(raw);
        if (field === 'reviewed_segments') bad.reviewed_segments[0] = alias;
        else if (field === 'coverage') bad.coverage.visible_change_1 = [alias];
        else { bad.pass = false; bad.concerns = [{ segment_choice: alias,
          kind: 'technical_presentation', reason: 'Unknown segment may not bind.' }]; }
        assert.equal(validateNarrationAudit(assembleNarrationRoleOutput('gameplay_narrator_auditor', bad, request),
          ids, { visible_changes: 2, uncertainties: 1 }).ok, false);
      }
    }
  }
});
