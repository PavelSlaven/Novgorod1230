import { reviewedNarration } from './narration-audit-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationAudit } from '@rus/narration';
import { assembleNarrationRoleOutput, createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { recoverTracePendingPresentation } from '../src/runtime/lower-dvina-trace-presentation-recovery.js';

const visible = {
  version: 1, schema: 'visible_context_package', visible_scene: 'берег крушения',
  visible_changes: ['Вы одну минуту прощупывали воду ветвью.',
    'В ходе этой попытки результат наблюдения не установлен.'],
  uncertainties: [], sensory_details: ['У берега слышен плеск воды.'],
  visible_objects: [], visible_npc: [], known_context: [], allowed_tensions: [], do_not_imply: []
};
const segments = ['s1', 's2'].map((segment_id) => ({ segment_id }));
const coverage = { visible_change_1: ['s1'], visible_change_2: ['s2'] };
const passAudit = () => ({
  ...reviewedNarration(segments, coverage), evidence: ['Both required facts are grounded.']
});
const validate = (raw, request = { visible_context: visible, segments }) => validateNarrationAudit(
  assembleNarrationRoleOutput('gameplay_narrator_auditor', raw, request),
  request.segments.map(({ segment_id }) => segment_id),
  { visible_changes: request.visible_context.visible_changes.length,
    uncertainties: request.visible_context.uncertainties.length });

test('private audit output is strict and canonical verdicts are code-owned', async (t) => {
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', passAudit(),
    { visible_context: visible, segments });
  assert.equal(validate(passAudit()).ok, true);
  assert.equal(assembled.pass, true);
  assert.equal(assembled.artistic_verdict, 'pass');
  assert.equal(assembled.technical_verdict, 'pass');
  assert.deepEqual(assembled.coverage, { visible_changes: [
    { source_index: 0, segment_ids: ['s1'] },
    { source_index: 1, segment_ids: ['s2'] }
  ], uncertainties: [] });

  const mutations = {
    extra_key: (a) => { a.pass = true; },
    missing_key: (a) => { delete a.unsupported; },
    missing_source: (a) => { a.source_reviews.pop(); },
    wrong_source_order: (a) => { a.source_reviews.reverse(); },
    wrong_source_ref: (a) => { a.source_reviews[0].ref = 'visible_change_01'; },
    unknown_segment: (a) => { a.source_reviews[0].segment_choices = ['s99']; },
    duplicate_segment: (a) => { a.source_reviews[0].segment_choices = ['s1', 's1']; },
    scalar_choices: (a) => { a.source_reviews[0].segment_choices = 's1'; },
    unknown_unsupported_kind: (a) => { a.unsupported = [{ segment_choice: 's1',
      kind: 'unsupported_other', reason: 'No support.' }]; },
    unknown_literary_check: (a) => { a.literary_failures = [{ segment_choice: 's1',
      check: 'other', reason: 'Bad prose.' }]; },
    empty_reason: (a) => { a.unsupported = [{ segment_choice: 's1',
      kind: 'unsupported_fact', reason: ' ' }]; },
    scalar_evidence: (a) => { a.evidence = 'Grounded.'; }
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, () => {
    const audit = passAudit();
    mutate(audit);
    assert.equal(validate(audit).ok, false);
  });
});

test('code owns redundant reviewed segment ids and clean-audit evidence', () => {
  const raw = passAudit();
  raw.reviewed_segments = ['Model copied prose instead of the supplied segment id.'];
  raw.evidence = [];
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw,
    { visible_context: visible, segments });
  assert.equal(assembled.pass, true);
  assert.deepEqual(assembled.evidence,
    ['All required sources are covered and no audit failures were reported.']);
  assert.equal(validateNarrationAudit(assembled, ['s1', 's2'],
    { visible_changes: 2, uncertainties: 0 }).ok, true);
});

test('code normalizes exact prose aliases and whole-passage audit targets', () => {
  const proseSegments = [
    { segment_id: 's1', prose: 'Первое предложение.' },
    { segment_id: 's2', prose: 'Второе предложение.' }
  ];
  const raw = passAudit();
  raw.source_reviews[0].segment_choices = ['Первое предложение.'];
  raw.source_reviews[1].segment_choices = ['Второе предложение.'];
  raw.literary_failures = [{ check: 'weak_literary_composition',
    segment_choice: 's1, s2', reason: 'The whole passage is list-like.' }];
  raw.evidence = [];
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw,
    { visible_context: visible, segments: proseSegments,
      output: { prose: 'Первое предложение. Второе предложение.' } });
  assert.equal(assembled.pass, false);
  assert.deepEqual(assembled.coverage.visible_changes.map(
    ({ segment_ids: ids }) => ids), [['s1'], ['s2']]);
  assert.equal(assembled.concerns[0].segment_id, 's1');
  assert.equal(validateNarrationAudit(assembled, ['s1', 's2'],
    { visible_changes: 2, uncertainties: 0 }).ok, true);
});

test('final audit bounds repeated composition repair without weakening factual failures', () => {
  const weakOnly = passAudit();
  weakOnly.literary_failures = [{ check: 'weak_literary_composition',
    segment_choice: 's1', reason: 'The repaired passage is still list-like.' }];
  weakOnly.evidence = [];
  const request = { phase: 'final', visible_context: visible, segments };
  const accepted = assembleNarrationRoleOutput('gameplay_narrator_auditor', weakOnly, request);
  assert.equal(accepted.pass, true);
  assert.deepEqual(accepted.concerns, []);
  assert.equal(validateNarrationAudit(accepted, ['s1', 's2'],
    { visible_changes: 2, uncertainties: 0 }).ok, true);

  const unsupported = structuredClone(weakOnly);
  unsupported.unsupported = [{ segment_choice: 's1', kind: 'unsupported_fact',
    reason: 'The repaired passage still invents a fact.' }];
  const rejected = assembleNarrationRoleOutput('gameplay_narrator_auditor', unsupported, request);
  assert.equal(rejected.pass, false);
  assert.deepEqual(rejected.concerns.map(({ kind }) => kind), ['unsupported_fact']);
});

test('omitted atomic unresolved result becomes deterministic missing-visible-change failure', () => {
  const raw = passAudit();
  raw.source_reviews[1].segment_choices = [];
  raw.literary_failures = [{ check: 'current_beat_buried',
    segment_choice: 's1', reason: 'The omitted result is not stated.' }];
  raw.evidence = [];
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw,
    { visible_context: visible, segments });
  assert.equal(assembled.pass, false);
  assert.deepEqual(assembled.coverage.visible_changes[1].segment_ids, []);
  assert.deepEqual(assembled.concerns, [{ segment_id: 's1', kind: 'missing_visible_change',
    reason: 'Required source visible_change_2 is not fully conveyed.' }]);
  assert.equal(validateNarrationAudit(assembled, ['s1', 's2'],
    { visible_changes: 2, uncertainties: 0 }).ok, true);
});

test('semantic and literary findings map to canonical concerns and verdicts', () => {
  const raw = passAudit();
  raw.unsupported = [{ segment_choice: 's1', kind: 'unsupported_sensory',
    reason: 'The branch does not support a ringing sound.' }];
  raw.literary_failures = [
    { check: 'static_context_dump', segment_choice: 's2', reason: 'Static recap dominates.' },
    { check: 'elapsed_as_service_report', segment_choice: 's1', reason: 'Bare time datum.' }
  ];
  raw.evidence = [];
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw,
    { visible_context: visible, segments });
  assert.equal(assembled.pass, false);
  assert.equal(assembled.artistic_verdict, 'fail');
  assert.equal(assembled.technical_verdict, 'fail');
  assert.deepEqual(assembled.concerns.map(({ kind }) => kind),
    ['unsupported_sensory', 'literary_quality', 'technical_presentation']);
  assert.equal(validateNarrationAudit(assembled, ['s1', 's2'],
    { visible_changes: 2, uncertainties: 0 }).ok, true);
});

test('published omission forces one whole-prose repair and strict final audit', async () => {
  const bad = 'Одну минуту вы прощупываете воду ветвью.';
  const good = 'Одну минуту вы прощупываете воду ветвью; что удалось заметить, пока неизвестно.';
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: bad, action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.ok(wire.concerns.some(({ kind }) => kind === 'missing_visible_change'));
      return { output: { replacements: [{ prose: good }] } };
    }
    const raw = reviewedNarration(wire.segments, Object.fromEntries(
      wire.required_current_beat.changes.map(({ ref }, index) =>
        [ref, wire.phase === 'initial' && index === 1 ? [] : ['s1']])));
    raw.evidence = wire.phase === 'initial' ? [] : ['Action and unresolved result are explicit.'];
    return { output: raw };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'published-omission', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, good);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('malformed final audit blocks after the single allowed repair', async () => {
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: 'Служебный отчёт.', action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
      replacements: [{ prose: 'Одну минуту вы прощупываете воду ветвью; результат пока неизвестен.' }] } };
    const raw = reviewedNarration(wire.segments, { visible_change_1: [], visible_change_2: [] });
    raw.evidence = [];
    if (wire.phase === 'final') raw.source_reviews[0].segment_choices = ['s99'];
    return { output: raw };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'malformed-final', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.phase, 'final_audit_validation');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('presentation recovery repairs prose without a second gameplay commit', async () => {
  let commits = 0;
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: 'Одну минуту вы прощупываете воду ветвью.', action_options: [], used_references: [] } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
      replacements: [{ prose: 'Одну минуту вы прощупываете воду ветвью; результат пока неизвестен.' }] } };
    const raw = reviewedNarration(wire.segments, { visible_change_1: ['s1'],
      visible_change_2: wire.phase === 'initial' ? [] : ['s1'] });
    raw.evidence = wire.phase === 'initial' ? [] : ['Both atomic sources are present.'];
    return { output: raw };
  } } });
  const repository = {
    async loadPhase2State() { return { last_turn: { idempotency_key: 'committed-turn' } }; },
    async loadPhase2Replay() { return { screen: { screen_status: 'committed_presentation_pending' } }; },
    async commitPhase2Turn() { commits += 1; },
    async replayPhase2Turn({ narrator }) {
      const result = await narrator.run({ version: 1, schema: 'narration_request',
        request_id: 'committed-turn', surface: 'turn', visible_context: visible, context: {} });
      return { screen: { screen_status: 'ready', main_prose: result.approved_output.prose } };
    }
  };
  const result = await recoverTracePendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending' } }, repository, narrator: service });
  assert.match(result.screen.main_prose, /результат пока неизвестен/u);
  assert.equal(commits, 0);
});

test('canonical and non-positional segment IDs bind without aliases', () => {
  for (const ids of [['s1', 's2'], ['motion:a', 'unknown:b']]) {
    const request = { visible_context: visible,
      segments: ids.map((segment_id) => ({ segment_id })) };
    const raw = reviewedNarration(request.segments,
      { visible_change_1: [ids[0]], visible_change_2: [ids[1]] });
    assert.equal(validate(raw, request).ok, true);
    for (const alias of ['segment_1', 's01', 's99']) {
      const bad = structuredClone(raw);
      bad.source_reviews[0].segment_choices = [alias];
      assert.equal(validate(bad, request).ok, false);
    }
  }
});
