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

test('narration assembly keeps missing content invalid and owns neutral self-check metadata', () => {
  const output = assembleNarrationRoleOutput('gameplay_narrator', {
    prose: 'Двор тих.' }, { request_id: 'narration-1' });
  assert.equal(output.action_options, undefined);
  assert.equal(output.used_references, undefined);
  assert.deepEqual(output.self_check, {});
  assert.equal(validateNarrationOutput(output).ok, false);
  const supplied = assembleNarrationRoleOutput('gameplay_narrator', {
    prose: 'Двор тих.', action_options: [], used_references: [],
    self_check: { every_fact_is_true: true, no_unsupported_silence: true }
  }, { request_id: 'narration-1' });
  assert.deepEqual(supplied.self_check, {});
  assert.equal(validateNarrationOutput(supplied).ok, true);
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
      const input = JSON.parse(call.messages[1].content);
      assert.deepEqual(input.required_current_beat.changes.map(({ text }) => text), visible.visible_changes);
      assert.equal(Object.hasOwn(input, 'visible_context'), false);
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /never an added diagnosis or possible symptom asserted as fact/u);
        return { output: { prose: 'Вас трясёт. {"before":"wet","after":"damp"}',
          action_options: [], used_references: [], self_check: {} } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        auditCount += 1;
        return { output: auditCount === 1 ? { pass: false, artistic_verdict: 'pass', technical_verdict: 'fail', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: [] }, concerns: [
          { segment_choice: 's1', kind: 'unsupported_fact', reason: 'Possible shivering is not confirmed.' },
          { segment_choice: 's1', kind: 'technical_presentation', reason: 'Body JSON is not literary prose.' }
        ], evidence: ['Only wet-to-damp changed; cold has possible shivering.'] }
          : { pass: true, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: ['s1'] }, concerns: [], evidence: ['Only the supported clothing change is stated.'] } };
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
              ? { pass: false, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: [], visible_change_2: [], uncertainty_1: [] }, concerns: [{ segment_choice: 's1', kind: 'unsupported_fact', reason: 'Не подтверждено.' }], evidence: ['Нет в visible_context.'] }
              : { pass: true, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: ['s1'], visible_change_2: ['s1'], uncertainty_1: ['s1'] }, concerns: [], evidence: ['Подтверждено.'] }
            : call.roleId === 'gameplay_narrator_semantic_repair'
              ? { replacements: [{ prose: 'A snapped branch lies beside fresh footprints in the mud; where your charter is remains unknown.' }] }
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
  for (const call of calls) {
    const payload = JSON.parse(call.messages[1].content);
    assert.equal(Object.hasOwn(payload, 'visible_context'), false);
    assert.deepEqual(payload.required_current_beat.uncertainties,
      [{ ref: 'uncertainty_1', text: question, status: 'unperformed_result_unknown' }]);
    assert.deepEqual(payload.optional_support, { visible_scene: 'The clearing is quiet.', sensory_details: [] });
    assert.deepEqual(payload.confirmed_outcome, {});
    assert.match(call.messages[0].content, /Preserve confirmed speech verbatim with its supplied speaker/);
    assert.match(call.messages[0].content, /preserve each proposition’s certainty/);
    assert.match(call.messages[0].content, /A partial observation proves neither exclusivity nor persistence/);
    assert.match(call.messages[0].content, /Failed\/incomplete attempts are mandatory results/);
    assert.match(call.messages[0].content, /short scene-bearing literary transition/);
    assert.match(call.messages[0].content, /Actor movement requires confirmed_outcome.movement_committed=true/);
    assert.match(call.messages[0].content, /A feature never licenses unstated sound/);
    assert.match(call.messages[0].content, /no swapped\/grouped traits, invented actions/);
  }
  const audit = JSON.parse(calls[2].messages[1].content);
  assert.deepEqual(audit.action_intent, {
    evidence_scope: 'intent_only_non_evidence_of_execution_or_success',
    attempt: { text: 'Постучать в закрытую дверь.' }
  });
  assert.deepEqual(audit.output, repairedOutput);
  assert.deepEqual(audit.segments, [{ segment_id: 's1', prose: repairedOutput.prose }]);
  for (const index of [0, 1, 3]) {
    assert.equal(Object.hasOwn(JSON.parse(calls[index].messages[1].content), 'action_intent'), false);
  }
  const repair = JSON.parse(calls[3].messages[1].content);
  assert.deepEqual(repair.segments, [{ segment_id: 's1', prose: repairedOutput.prose, nearby_context: [] }]);
  assert.match(calls[3].messages[0].content, /Rebuild the whole passage/);
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
          const supported = JSON.parse(call.messages[1].content).output.prose
            .includes(known);
          return { output: supported
            ? { pass: true, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: {  }, concerns: [], evidence: ['known context'] }
            : { pass: false, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: {  }, concerns: [{ segment_choice: 's1',
              kind: 'unsupported_world_state', reason: 'not visible' }],
            evidence: ['not visible'] } };
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
    assert.equal(calls.find(({ role_id: role }) => role === 'gameplay_narrator_auditor')
      .messages[0].content.includes('With no required beat, descriptive support is the scene result'), true);
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
          const input = JSON.parse(call.messages[1].content);
          assert.equal(input.confirmed_outcome.position_changed, false);
          return { output: auditCount === 1 ? { pass: false, artistic_verdict: 'pass', technical_verdict: 'fail', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: [] }, concerns: [{
            segment_choice: 's1', kind: 'technical_presentation',
            reason: 'Negative movement invariant is not prose material.'
          }], evidence: ['False outcome is a silent constraint.'] } : {
            pass: true, artistic_verdict: 'pass', technical_verdict: 'pass', ...reviewedNarration(JSON.parse(call.messages[1].content).segments), coverage: { visible_change_1: ['s1'] }, concerns: [], evidence: ['Visible change only.']
          } };
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
