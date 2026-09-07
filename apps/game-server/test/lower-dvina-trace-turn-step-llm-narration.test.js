import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationOutput } from '@rus/narration';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { assembleNarrationRoleOutput,
  createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('narration assembly does not default omitted semantic fields', () => {
  const output = assembleNarrationRoleOutput('gameplay_narrator', {
    prose: 'Двор тих.' }, { request_id: 'narration-1' });
  assert.equal(output.action_options, undefined);
  assert.equal(output.used_references, undefined);
  assert.equal(output.self_check, undefined);
  assert.equal(validateNarrationOutput(output).ok, false);
});

test('narration wires writer, audit, and coherent semantic repair roles', async () => {
  const calls = [];
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
              ? { pass: false, concerns: [{ segment_choice: 'segment_1', kind: 'unsupported_fact', reason: 'Не подтверждено.' }], evidence: ['Нет в visible_context.'] }
              : { pass: true, concerns: [], evidence: ['Подтверждено.'] }
            : call.roleId === 'gameplay_narrator_semantic_repair'
              ? { replacements: [{ prose: 'The clearing is quiet.' }] }
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
      uncertainties: [], allowed_tensions: [], do_not_imply: []
    }, context: {
      attempt: { text: 'Постучать в закрытую дверь.' },
      outcome: {}
    }
  }));
  assert.equal(result.status, 'approved');
  const shape = '{"prose":"<visible-only prose in Russian>","action_options":[],"used_references":[],"self_check":{}}';
  const repairShape = shape;
  assert.equal(calls[0].messages[0].content.includes(shape), true);
  assert.equal(calls[0].messages[0].content.includes(
    'server assembles version, schema, and output_id'), true);
  assert.equal(calls[0].messages[0].content.includes('context.attempt'), false);
  assert.equal(calls[0].messages[0].content.includes(
    'Missing or false outcome fields are silent constraints'), true);
  assert.equal(calls[0].messages[0].content.includes(
    "item moved confirms only that item's placement change"), true);
  assert.equal(calls[0].messages[0].content.includes(
    'Do not infer a causal bridge or exact success mechanism'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'Faithfully paraphrase mechanical source wording'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'visible_context.visible_changes is nonempty, convey every material new change'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'relevant player-safe known_context'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'not a report of game state'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'When perception itself is the action'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'do not add that nothing else was noticed'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'unless that exact bodily effect is supplied'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'Проходит минута, а у самой воды лежат <supplied current detail>'), true);
  for (const call of calls) {
    assert.match(call.messages[0].content,
      /Unsupported exclusivity or persistence MUST FAIL the audit as unsupported_world_state/);
    assert.match(call.messages[0].content,
      /explicit failed or incomplete attempt result in visible_context\.visible_changes is material/);
    assert.equal(call.messages[0].content.includes(
      'Narrate the player in second-person Russian'), true);
    assert.equal(call.messages[0].content.includes(
      'Empty visible_npc or visible_objects arrays are omissions'), true);
    assert.equal(call.messages[0].content.includes(
      'State uncertainty only when it is explicitly supplied'), true);
    assert.equal(call.messages[0].content.includes(
      'ground every adjective, adverb, sensory quality, temporal relation'), true);
    assert.equal(call.messages[0].content.includes(
      'Compare every rendered NPC trait to that same entity\'s observable_cues'), true);
    assert.equal(call.messages[0].content.includes(
      'static identity or equipment cue never authorizes an NPC action'), true);
    assert.equal(call.messages[0].content.includes(
      'never group differing traits unless every stated trait applies'), true);
    assert.equal(call.messages[0].content.includes(
      'does not authorize an unstated direction, destination, route'), true);
    const outcomeField = ['gameplay_narrator_auditor',
      'gameplay_narrator_semantic_repair'].includes(call.roleId)
      ? 'confirmed_outcome' : 'context.outcome';
    assert.equal(call.messages[0].content.includes(
      `grounds only an attempt unless visible_context or ${outcomeField} confirms`), true);
    assert.equal(call.messages[0].content.includes(
      'do not turn source arrays into a one-fact-per-sentence catalogue'), true);
  }
  assert.equal(calls[0].scope, 'turn_runtime');
  assert.equal(calls[0].roleId, 'gameplay_narrator');
  assert.equal(calls[1].roleId, 'gameplay_narrator_format_repair');
  assert.equal(calls[1].messages[0].content.includes(repairShape), true);
  assert.equal(calls[1].messages[0].content.includes('request.visible_context'), true);
  assert.equal(calls[1].messages[0].content.includes(
    'Convey every material visible_change naturally'), true);
  assert.equal(calls[2].roleId, 'gameplay_narrator_auditor');
  assert.equal(calls[2].messages[0].content.includes('full narration'), true);
  assert.equal(calls[2].messages[0].content.includes('hidden state'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'action_intent_context may ground only'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'it never proves success, object use, a result, or a world/NPC state change'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'faithful natural paraphrase of visible_context is supported'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'do not prove that nobody or nothing is present'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'does not support an unstated sound, smell, temperature, bodily sensation, history, or recent use'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'remain intent-only'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'a wet surface alone is insufficient'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'requires an explicit supplied uncertainty'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'repeating how or why the player looked is technical_presentation'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'FAIL with kind missing_visible_change'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'already a confirmed player-safe fact and sufficient evidence'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'Actor movement wording MUST FAIL'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'unless confirmed_outcome.movement_committed is true'), true);
  assert.equal(calls[2].messages[0].content.includes('{"pass":true,"concerns":[],"evidence":["visible facts only"]}'), true);
  assert.match(calls[2].messages[0].content,
    /"kind":"<one allowed concern kind>"/u);
  assert.match(calls[2].messages[0].content, /unsupported_success/u);
  assert.match(calls[2].messages[0].content, /technical_presentation/u);
  assert.equal(calls[2].messages[0].content.includes(
    'Exact elapsed time is not standalone when it is woven into'), true);
  assert.equal(calls.some((call) => call.messages[0].content.includes(
    'same sentence as a supplied current scene detail')), true);
  assert.equal(calls[2].messages[0].content.includes(
    'without claiming a change of scene, body, position, or action'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'still stands, waits, watches, looks, or remains somewhere MUST FAIL'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'scene or its objects stayed unchanged'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'copy one complete supplied current scene detail without semantic shortening'), true);
  assert.equal(calls[2].messages[0].content.includes(
    'MUST NOT classify that construction as standalone elapsed time'), true);
  assert.equal(calls[2].messages[0].content.includes(
    '"segment_choice":"segment_1"'), true);
  assert.deepEqual(JSON.parse(calls[2].messages[1].content), {
    version: 1, schema: 'narration_semantic_audit_request', phase: 'initial',
    output: repairedOutput, visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'The clearing is quiet.',
      visible_changes: ['A snapped branch lies nearby.', 'Fresh footprints cross the mud.'],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: ['A marked path leads toward the settlement.', 'health:5'],
      uncertainties: [], allowed_tensions: [], do_not_imply: []
    }, action_intent_context: {
      evidence_scope: 'intent_only_non_evidence_of_success',
      attempt: { text: 'Постучать в закрытую дверь.' }
    }, confirmed_outcome: {}, style_policy: {},
    segments: [{ segment_id: 's1', prose: 'The clearing is quiet.' }]
  });
  assert.equal(calls[3].roleId, 'gameplay_narrator_semantic_repair');
  assert.equal(calls[3].messages[0].content.includes(
    'entire supplied prose as one coherent paragraph'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'Never emit a sentence whose only content is elapsed time'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'when elapsed time is the only visible change'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'A safe grammatical pattern is «Проходит минута'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'still stands, waits, watches, looks, or remains somewhere'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'server assembles version, schema, and immutable segment_id'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'Remove every unsupported claim'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'do not prove that nobody or nothing is present'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'faithful natural paraphrase of visible_context is allowed'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'For missing_visible_change'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'complete replacement must naturally convey every material visible_change once'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'confirmed_outcome contains the code-confirmed outcome'), true);
  assert.deepEqual(JSON.parse(calls[3].messages[1].content).segments, [{ segment_id: 's1', prose: 'The clearing is quiet.', nearby_context: [] }]);
  assert.equal(Object.hasOwn(JSON.parse(calls[3].messages[1].content),
    'action_intent_context'), false);
  assert.deepEqual(JSON.parse(calls[3].messages[1].content).confirmed_outcome,
    {});
  assert.equal(calls[4].roleId, 'gameplay_narrator_auditor');
  assert.equal(validateNarrationOutput(repairedOutput).ok, true);
  assert.equal(calls.length, 5);
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
            ? { pass: true, concerns: [], evidence: ['known context'] }
            : { pass: false, concerns: [{ segment_choice: 'segment_1',
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
      .messages[0].content.includes('visible_context.known_context'), true);
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
          return { output: auditCount === 1 ? { pass: false, concerns: [{
            segment_choice: 'segment_1', kind: 'technical_presentation',
            reason: 'Negative movement invariant is not prose material.'
          }], evidence: ['False outcome is a silent constraint.'] } : {
            pass: true, concerns: [], evidence: ['Visible change only.']
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
