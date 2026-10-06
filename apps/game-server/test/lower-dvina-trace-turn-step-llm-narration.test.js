import { reviewedNarration } from './narration-audit-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationOutput } from '@rus/narration';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { assembleNarrationRoleOutput,
  createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

function auditInput(call) {
  assert.equal(call.role_id, 'gameplay_narrator_auditor');
  const input = JSON.parse(call.messages[1].content);
  if (Object.hasOwn(input, 'output')) {
    assert.deepEqual(Object.keys(input.output), ['prose']);
    assert.equal(input.output.prose, input.segments.map(({ prose }) => prose).join(''));
  }
  return input;
}

test('narration assembly requires model prose and owns all fixed output metadata', () => {
  const supplied = assembleNarrationRoleOutput('gameplay_narrator', {
    prose: 'Двор тих.', action_options: [{ label: 'Осмотреть двор' }],
    used_references: ['scene:yard'],
    self_check: { every_fact_is_true: true, no_unsupported_silence: true }
  }, { request_id: 'narration-1' });
  assert.deepEqual(supplied.action_options, []);
  assert.deepEqual(supplied.used_references, []);
  assert.deepEqual(supplied.self_check, {});
  assert.equal(validateNarrationOutput(supplied).ok, true);
  const missing = assembleNarrationRoleOutput('gameplay_narrator', {},
    { request_id: 'narration-1' });
  assert.deepEqual(validateNarrationOutput(missing).errors, ['prose is required']);
});

test('writer metadata drift does not invoke narration format repair', async () => {
  const calls = [];
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: 'У ворот стоит телега.', action_options: [{ label: 'Осмотреть телегу' }],
        used_references: ['scene:cart'], self_check: { approved: true }
      } };
      if (call.role_id === 'gameplay_narrator_format_repair') {
        throw new Error('format repair must not run');
      }
      const input = auditInput(call);
      return { output: {
        ...reviewedNarration(input.segments), evidence: ['Visible scene supports prose.']
      } };
    }
  } });
  const result = await narration.run({ version: 1, schema: 'narration_request',
    request_id: 'fixed-writer-fields', surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'У ворот стоит телега.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }, context: {} });
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  assert.deepEqual(result.approved_output.action_options, []);
  assert.deepEqual(result.approved_output.used_references, []);
  assert.deepEqual(result.approved_output.self_check, {});
  assert.equal(result.diagnostics.repairs_used, 0);
});

test('body delta reaches narration as grounded meaning without technical prose or invented shivering', async () => {
  const possibleCold = { id: 'cold_with_possible_shivering', status: 'active' };
  const visible = enrichLowerDvinaTraceVisibleNpcCues({
    visibleContext: { version: 1, schema: 'visible_context_package', visible_scene: 'У костра.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] },
    committedState: { body_state: { active_conditions: [{ id: 'wet' }, possibleCold] } },
    bodyAfter: { active_conditions: [{ id: 'damp' }, possibleCold] }
  });
  const prose = 'Одежда стала менее мокрой, но остаётся сырой.';
  let auditCount = 0;
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
    async run(call) {
      if (call.role_id === 'gameplay_narrator') {
        assert.equal(typeof call.messages[1].content, 'string');
        for (const fact of visible.visible_changes) {
          assert.ok(call.messages[1].content.includes(fact), fact);
        }
        assert.equal(call.messages[1].content.includes('visible_context'), false);
        assert.match(call.messages[0].content, /Пиши связную, сдержанную литературную прозу/u);
        return { output: { prose: 'Вас трясёт. {"before":"wet","after":"damp"}',
          action_options: [], used_references: [], self_check: {} } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        const input = auditInput(call);
        assert.deepEqual(input.required_current_beat.changes.map(({ text }) => text), visible.visible_changes);
        assert.equal(Object.hasOwn(input, 'visible_context'), false);
        auditCount += 1;
        const segments = input.segments;
        return { output: auditCount === 1 ? {
          ...reviewedNarration(segments, { c1: [] }),
          unsupported: [{ segment_choice: 'p1', kind: 'unsupported_fact',
            reason: 'Possible shivering is not confirmed.' }],
          literary_failures: [{ check: 'elapsed_as_service_report', segment_choice: 'p1',
            reason: 'Body JSON is not literary prose.' }], evidence: [] }
          : { ...reviewedNarration(segments, { c1: ['p1'] }),
            evidence: ['Only the supported clothing change is stated.'] } };
      }
      return { output: { replacements: [{ prose }] } };
    }
  } });
  const result = await narration.run({ version: 1, schema: 'narration_request',
    request_id: 'body-delta', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(auditCount, 2);
  assert.equal(result.approved_output.prose, prose);
  assert.doesNotMatch(result.approved_output.prose, /[{}]|before|after|wet|damp|cold_with|дрож|тряс/u);
});

test('narration wires writer, audit, and coherent semantic repair roles', async () => {
  const calls = [];
  const question = 'Имеющихся данных недостаточно для ответа: «Найти мою грамоту».';
  const repairedOutput = { version: 1, schema: 'narration_output', output_id: 'narration-1', prose: 'The clearing is quiet.', action_options: [], used_references: [], self_check: {} };
  const semanticRepairProse = 'A snapped branch lies beside fresh footprints in the mud; where your charter is remains unknown.';
  const turnBudget = createLlmTurnBudget();
  const narration = createLowerDvinaTraceNarrationService({
    roleRunner: createLlmRoleRunnerAdapter({ turnBudget,
      env: { DEEPSEEK_API_KEY: 'test-key' }, async execute(call) {
      calls.push(call);
      const output = call.roleId === 'gameplay_narrator'
        ? {}
        : call.roleId === 'gameplay_narrator_format_repair'
          ? { prose: repairedOutput.prose, action_options: [],
              used_references: [], self_check: {} }
          : call.roleId === 'gameplay_narrator_auditor'
            ? calls.filter(({ roleId }) => roleId === 'gameplay_narrator_auditor').length === 1
              ? { ...reviewedNarration(auditInput({ role_id: call.roleId,
                messages: call.messages }).segments,
                { c1: [], c2: [], u1: [] }),
                unsupported: [{ segment_choice: 'p1', kind: 'unsupported_fact',
                  reason: 'Не подтверждено.' }], evidence: [] }
              : { ...reviewedNarration(auditInput({ role_id: call.roleId,
                messages: call.messages }).segments,
                { c1: ['p1'], c2: ['p1'], u1: ['p1'] }),
                evidence: ['Подтверждено.'] }
            : call.roleId === 'gameplay_narrator_semantic_repair'
              ? { replacements: [{ prose: semanticRepairProse }] }
              : null;
      return { status: 'ok', parsed_json: output, provider: 'deepseek',
        model: 'deepseek-v4-flash', scope: call.scope, role_id: call.roleId,
        durationMs: 1, config_hash: 'test' };
    } })
  });
  const result = await turnBudget.runTurn(() => narration.run({
    version: 1, schema: 'narration_request', request_id: 'narration-1',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'The clearing is quiet.',
      visible_changes: ['A snapped branch lies nearby.', 'Fresh footprints cross the mud.'],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: ['A marked path leads toward the settlement.', 'health:5'],
      uncertainties: [question], allowed_tensions: [], do_not_imply: []
    }, context: {
      attempt: { text: 'Постучать в закрытую дверь.' },
      outcome: {}
    }
  }));
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls.map(({ roleId }) => roleId), [
    'gameplay_narrator', 'gameplay_narrator_format_repair', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor'
  ]);
  let auditCalls = 0;
  for (const call of calls) {
    assert.equal(call.overrides.temperature,
      call.roleId === 'gameplay_narrator_semantic_repair' ? 0.2 : 0);
    if (call.roleId === 'gameplay_narrator_auditor') {
      auditCalls += 1;
      const payload = JSON.parse(call.messages[1].content);
      assert.deepEqual(payload.required_current_beat.uncertainties,
        [{ ref: 'u1', text: question,
          status: 'Действие ещё не выполнено; результат пока неизвестен.' }]);
      assert.deepEqual(payload.optional_support,
        { visible_scene: 'The clearing is quiet.' });
      assert.equal(Object.hasOwn(payload, 'confirmed_outcome'), false);
      assert.deepEqual(payload.segments, [{ segment_id: 'p1',
        prose: auditCalls === 1 ? repairedOutput.prose : semanticRepairProse }]);
      assert.match(call.messages[0].content, /строгий аудитор доказательств/u);
      assert.match(call.messages[0].content,
        /встроенный неизвестный\s+результат должен оставаться неизвестным/u);
    } else if (call.roleId === 'gameplay_narrator_semantic_repair') {
      assert.equal(typeof call.messages[1].content, 'string');
      assert.match(call.messages[1].content, /The clearing is quiet/u);
      assert.match(call.messages[1].content, /A snapped branch lies nearby/u);
      assert.match(call.messages[1].content, /Fresh footprints cross the mud/u);
      assert.match(call.messages[1].content, /Имеющихся данных недостаточно/u);
      assert.equal(call.messages[1].content.includes('narration-1'), false);
      assert.match(call.messages[0].content, /каждое обязательное положение и степень достоверности/u);
      assert.match(call.messages[0].content, /подтверждённую речь дословно/u);
      assert.match(call.messages[0].content, /порядок совершённых действий/u);
      assert.match(call.messages[0].content, /удали неподтверждённые утверждения/u);
    } else {
      assert.equal(typeof call.messages[1].content, 'string');
      assert.match(call.messages[1].content, /The clearing is quiet/u);
      assert.match(call.messages[1].content, /Имеющихся данных недостаточно/u);
      assert.equal(call.messages[1].content.includes('narration-1'), false);
      if (call.roleId === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /Передавай подтверждённую речь дословно/u);
        assert.match(call.messages[0].content,
          /Передай каждый источник required_current_beat ровно один раз/u);
        assert.match(call.messages[0].content,
          /Выборочно используй дополнительные опорные сведения, чтобы построить эпизод/u);
      } else {
        assert.match(call.messages[0].content, /Передавай подтверждённую речь дословно/u);
        assert.match(call.messages[0].content, /степень достоверности/u);
        assert.match(call.messages[0].content,
          /движение действующего лица требует confirmed_outcome\.movement_committed=true/u);
        assert.match(call.messages[0].content, /Не добавляй скрытые факты, диагнозы/u);
      }
    }
  }
  const audit = JSON.parse(calls[2].messages[1].content);
  assert.deepEqual(audit.action_intent, {
    evidence_scope: 'intent_only_non_evidence_of_execution_or_success',
    attempt: { text: 'Постучать в закрытую дверь.' }
  });
  assert.deepEqual(audit.output, { prose: repairedOutput.prose });
  assert.deepEqual(audit.segments, [{ segment_id: 'p1', prose: repairedOutput.prose }]);
  for (const index of [0, 1, 3]) {
    assert.equal(typeof calls[index].messages[1].content, 'string');
    assert.equal(calls[index].messages[1].content.includes('action_intent'), false);
  }
  assert.match(calls[3].messages[1].content, /A snapped branch lies nearby/u);
  assert.match(calls[3].messages[1].content, /Замечания аудитора/u);
  assert.match(calls[3].messages[0].content, /Перестрой весь отрывок/u);
  assert.equal(validateNarrationOutput(repairedOutput).ok, true);
});

test('narration treats exact known context as visible evidence and still blocks inventions', async (t) => {
  const known = 'A dry shelter stands beside the path.';
  for (const [prose, expectedStatus] of [[known, 'approved'], [
    'A stone bridge rises ahead.', 'blocked'
  ]]) await t.test(prose, async () => {
    const calls = [];
    const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
      async run(call) {
        calls.push(call);
        if (call.role_id === 'gameplay_narrator') return { output: {
          prose, action_options: [], used_references: [], self_check: {}
        } };
        if (call.role_id === 'gameplay_narrator_auditor') {
          const input = auditInput(call);
          const supported = input.segments.map(({ prose }) => prose).join('')
            .includes(known);
          return { output: supported
            ? { ...reviewedNarration(input.segments),
              evidence: ['known context'] }
            : { ...reviewedNarration(input.segments),
              unsupported: [{ segment_choice: 'p1', kind: 'unsupported_world_state',
                reason: 'not visible' }], evidence: [] } };
        }
        return { output: { replacements: [{ prose }] } };
      }
    } });
    const result = await narration.run({
      version: 1, schema: 'narration_request', request_id: 'known-context',
      surface: 'turn', visible_context: {
        version: 1, schema: 'visible_context_package', visible_scene: 'The path is quiet.',
        visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
        known_context: [known], uncertainties: [], allowed_tensions: [], do_not_imply: []
      }, context: {}
    });
    assert.equal(result.status, expectedStatus);
    const auditInstruction = calls.find(
      ({ role_id: role }) => role === 'gameplay_narrator_auditor').messages[0].content;
    assert.match(auditInstruction, /строгий аудитор доказательств/u);
    assert.match(auditInstruction, /unsupported_result/u);
    assert.match(auditInstruction, /попытка без утверждения об исходе/u);
  });
});

test('narration removes technical prose derived from a negative movement invariant',
  async () => {
    let auditCount = 0;
    const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
      async run(call) {
        if (call.role_id === 'gameplay_narrator') return { output: {
          prose: 'Отдых не привёл к перемещению.', action_options: [],
          used_references: [], self_check: {}
        } };
        if (call.role_id === 'gameplay_narrator_auditor') {
          auditCount += 1;
          const input = auditInput(call);
          assert.equal(input.confirmed_outcome.position_changed, false);
          return { output: auditCount === 1 ? {
            ...reviewedNarration(input.segments, { c1: [] }),
            literary_failures: [{ check: 'elapsed_as_service_report', segment_choice: 'p1',
              reason: 'Negative movement invariant is not prose material.' }], evidence: [] }
            : { ...reviewedNarration(input.segments,
              { c1: ['p1'] }), evidence: ['Visible change only.'] } };
        }
        return { output: { replacements: [{
          prose: 'У огня одежда немного подсохла.'
        }] } };
      }
    } });
    const result = await narration.run({
      version: 1, schema: 'narration_request', request_id: 'silent-negative',
      surface: 'turn', visible_context: {
        version: 1, schema: 'visible_context_package',
        visible_scene: 'У костра.',
        visible_changes: ['У огня одежда немного подсохла.'],
        sensory_details: [], visible_npc: [], visible_objects: [],
        known_context: [], uncertainties: [], allowed_tensions: [],
        do_not_imply: []
      }, context: { attempt: { text: 'Отдохнуть у костра.' },
        outcome: { position_changed: false } }
    });
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose,
      'У огня одежда немного подсохла.');
    assert.equal(result.approved_output.prose.includes('перемещ'), false);
  });
