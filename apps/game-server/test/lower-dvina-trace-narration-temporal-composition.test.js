import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

function reviewed(wire, { unsupported = [], literaryFailures = [], evidence = ['Grounded.'] } = {}) {
  const ids = wire.segments.map(({ segment_id }) => segment_id);
  return {
    reviewed_segments: ids,
    source_reviews: wire.required_current_beat.changes
      .concat(wire.required_current_beat.uncertainties)
      .map(({ ref }) => ({ ref, segment_choices: ids })),
    unsupported,
    literary_failures: literaryFailures,
    evidence
  };
}

test('code-owned durations never enter narrator sources', async () => {
  const speech = { turn_step_1: { kind: 'semantic_activity', duration_minutes: 1 } };
  const handling = {
    turn_step_2: { kind: 'semantic_activity', duration_minutes: 5 },
    turn_step_item_use_2: { kind: 'transient_item_use',
      description: 'Осторожно прощупываю воду длинной ветвью.' }
  };
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => assert.fail('unexpected fallback')
  } }).project({
    retrieved_state: { current_visible_context: scene() },
    consequence: { status: 'resolved', visible_seed: { ...speech, ...handling } },
    time_update: { exact_elapsed: { numerator: '6', denominator: '1' },
      prepared_effect_ledger: { slices: [
        { step_index: 1, consequence: { visible_seed: speech } },
        { step_index: 2, consequence: { visible_seed: handling } }
      ] } },
    mode_resolution: { decision_trace: { remaining_intent: null, step_traces: [
      { step_index: 1, applied: true, approved_plan: { resolution: 'direct',
        direct_result_kind: 'player_utterance', utterance: { utterance_text: 'Онисим!' } } },
      { step_index: 2, applied: true, approved_plan: { resolution: 'domain_request',
        operations: [{ op: 'request_item_use' }] } }
    ] } }
  });

  assert.deepEqual(visible.visible_changes, [
    'Вы произнесли: «Онисим!»',
    'Вы выполнили попытку: «Осторожно прощупываю воду длинной ветвью.»',
    'В ходе этой попытки результат наблюдения не установлен.'
  ]);
  assert.equal(JSON.stringify(visible).includes('минут'), false);
});

test('invented elapsed-time report is removed by whole-prose repair', async () => {
  const visible = { ...scene(), visible_changes: [
    'Вы произнесли: «Онисим!»',
    'Вы внимательно изучили обстановку.',
    'У воды лежат разбитые доски и обрывки снастей.'
  ] };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /Turn duration is code-owned UI metadata/u);
      assert.match(call.messages[0].content, /spatially coherent image/u);
      return { output: { prose: 'За минуту вы произнесли: «Онисим!», завершив наблюдение. У воды лежат разбитые доски и обрывки снастей.' } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(call.messages[0].content, /turn duration belongs only to the UI/u);
      assert.ok(wire.concerns.some(({ kind }) => kind === 'unsupported_fact'));
      return { output: { replacements: [{
        prose: 'Вы оглядели берег и позвали: «Онисим!» У самой воды среди обломков лежат разбитые доски и обрывки снастей.'
      }] } };
    }
    const initial = wire.phase === 'initial';
    return { output: reviewed(wire, {
      unsupported: initial ? [{ segment_choice: 's1', kind: 'unsupported_fact',
        reason: 'Elapsed minute is not supplied as prose evidence.' }] : [],
      literaryFailures: initial ? [{ check: 'elapsed_as_service_report', segment_choice: 's1',
        reason: 'Turn duration is presented as a service datum.' }] : [],
      evidence: initial ? [] : ['Actions and scene facts are grounded; no duration is narrated.']
    }) };
  } } });

  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'no-prose-time', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose.includes('минут'), false);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

function scene() {
  return { version: 1, schema: 'visible_context_package', visible_scene: 'Берег',
    visible_changes: [], uncertainties: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], allowed_tensions: [], do_not_imply: [] };
}
