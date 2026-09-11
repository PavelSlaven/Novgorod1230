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

for (const sample of [
  {
    name: 'arrival at a yard',
    changes: ['Вы вошли во двор.', 'Слева от вас стоит амбар.', 'Впереди, у колодца, ждёт возчик.'],
    checklist: 'Вы вошли во двор. Слева от вас стоит амбар. Впереди, у колодца, ждёт возчик.',
    repaired: 'Вы входите во двор: слева от вас стоит амбар, а впереди, у колодца, ждёт возчик.'
  },
  {
    name: 'search in a workshop',
    changes: ['Вы осмотрели мастерскую.', 'На верстаке лежит резец.', 'Под окном темнеют стружки.'],
    checklist: 'Вы осмотрели мастерскую. На верстаке лежит резец. Под окном темнеют стружки.',
    repaired: 'Осматривая мастерскую, вы видите резец на верстаке и тёмные стружки под окном.'
  },
  {
    name: 'speech beside a gate',
    changes: ['Вы произнесли: «Стой!»', 'Прямо перед вами — ворота; за ними виден всадник.',
      'Справа от вас тянется частокол.'],
    checklist: 'Вы произнесли: «Стой!» Прямо перед вами — ворота; за ними виден всадник. Справа от вас тянется частокол.',
    repaired: 'Вы произносите: «Стой!»; прямо перед вами, за воротами, виден всадник, а справа от вас тянется частокол.'
  }
]) test(`${sample.name}: source-order checklist fails literary audit and is repaired as an action-centered scene`, async () => {
  const visible = { ...scene(), visible_scene: 'Невиденная тестовая сцена',
    visible_changes: sample.changes };
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(call.messages[1].content);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /relevant action or result beat/u);
      assert.match(call.messages[0].content, /source-order checklist/u);
      return { output: { prose: sample.checklist } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(call.messages[0].content, /weak_literary_composition/u);
      assert.ok(wire.concerns.some(({ kind }) => kind === 'literary_quality'));
      return { output: { replacements: [{ prose: sample.repaired }] } };
    }
    const initial = wire.phase === 'initial';
    assert.match(call.messages[0].content, /source-order checklist/u);
    return { output: reviewed(wire, {
      literaryFailures: initial ? [{ check: 'weak_literary_composition',
        segment_choice: 's1',
        reason: 'Supported facts are restated in source order instead of composing the performed action and supplied spatial relations into a scene.' }] : [],
      evidence: initial ? [] : ['The performed action organizes the supplied spatial facts.']
    }) };
  } } });

  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: sample.name, surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.repaired);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('captured repair keeps ordered actions distinct and regroups scene facts by supplied anchors', async (t) => {
  const samples = [
    {
      name: 'captured shore observation then call',
      scene: 'берег крушения',
      changes: ['Вы внимательно изучили обстановку.', 'Вы произнесли: «Онисим!»',
        'Мокрый песок и ивняк тянутся вдоль берега реки.',
        'У самой воды лежат разбитые доски и обрывки снастей.',
        'У воды тянется полоса камыша и осоки; среди обломков лежат вынесенные течением ветви.',
        'Над открытым берегом тянется низкое сырое небо.',
        'Между мокрым песком и ивняком начинается приметная тропа; за кустами её продолжения не видно.',
        'У самого берега слышен плеск воды.'],
      rejected: 'Вы внимательно изучили обстановку. Над открытым берегом тянется низкое сырое небо. Мокрый песок и ивняк тянутся вдоль берега реки; у самой воды лежат разбитые доски, обрывки снастей и вынесенные течением ветви, среди которых тянется полоса камыша и осоки. Между мокрым песком и ивняком начинается приметная тропа, но за кустами её продолжения не видно. У самого берега слышен плеск воды. Вы произнесли: «Онисим!»',
      accepted: 'Вы внимательно изучили обстановку: над открытым берегом тянется низкое сырое небо; вдоль реки тянутся мокрый песок и ивняк, между которыми начинается приметная тропа, скрывающаяся за кустами; у самой воды лежат разбитые доски и обрывки снастей, у воды тянется полоса камыша и осоки, среди обломков лежат вынесенные течением ветви, а у самого берега слышен плеск. Затем вы произнесли: «Онисим!»',
      perception: true
    },
    {
      name: 'unseen workshop inspection then call', scene: 'мастерская',
      changes: ['Вы осмотрели мастерскую.', 'Вы произнесли: «Хозяин!»',
        'У окна стоит верстак; на нём лежит резец.', 'Под окном темнеют стружки.',
        'Справа от двери висит кожаный фартук.'],
      rejected: 'Вы осмотрели мастерскую. У окна стоит верстак; на нём лежит резец. Под окном темнеют стружки. Справа от двери висит кожаный фартук. Вы произнесли: «Хозяин!»',
      accepted: 'Вы осмотрели мастерскую: у окна стоит верстак с лежащим на нём резцом, а под окном темнеют стружки; справа от двери висит кожаный фартук. Закончив осмотр, вы произнесли: «Хозяин!»',
      perception: true
    },
    {
      name: 'unseen yard entry then knock', scene: 'двор',
      changes: ['Вы вошли во двор.', 'Вы постучали в дверь.',
        'Слева от входа стоит амбар.', 'Впереди видна дверь дома.',
        'У колодца справа лежит пустое ведро.'],
      rejected: 'Вы постучали в дверь, входя во двор. Слева от входа стоит амбар. Впереди видна дверь дома. У колодца справа лежит пустое ведро.',
      accepted: 'Вы вошли во двор. Слева от входа стоит амбар; впереди видна дверь дома, а справа, у колодца, лежит пустое ведро. После этого вы постучали в дверь.',
      overlap: true
    }
  ];
  for (const sample of samples) await t.test(sample.name, async () => {
    for (const accepted of [false, true]) {
      const calls = [];
      const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
        calls.push(call.role_id);
        const wire = JSON.parse(call.messages[1].content);
        if (call.role_id === 'gameplay_narrator') {
          assert.match(call.messages[0].content, /Only performed-action sources constrain action order/u);
          assert.match(call.messages[0].content, /shared supplied subjects or spatial anchors/u);
          assert.match(call.messages[0].content, /one coherent focal sweep/u);
          assert.match(call.messages[0].content, /perception action.*grammatically govern/u);
          assert.match(call.messages[0].content, /Do not invent perception or causality for other action classes/u);
          return { output: { prose: sample.changes.join(' ') } };
        }
        if (call.role_id === 'gameplay_narrator_semantic_repair') {
          assert.match(call.messages[0].content, /distinct performed-action beats in order/u);
          assert.match(call.messages[0].content, /visible_scene.*action target/u);
          assert.match(call.messages[0].content, /standalone perception-action sentence.*descriptive inventory/u);
          return { output: { replacements: [{ prose: accepted
            ? sample.accepted : sample.rejected }] } };
        }
        const initial = wire.phase === 'initial';
        const audit = reviewed(wire, {
          literaryFailures: initial || !accepted ? [{ check: 'weak_literary_composition',
            segment_choice: 's1', reason: 'Performed actions overlap or descriptive facts follow source order.' }] : [],
          evidence: initial || !accepted ? [] : ['Ordered action beats frame facts grouped by supplied spatial anchors.']
        });
        if (!initial && !accepted && sample.overlap) {
          audit.source_reviews[0].segment_choices = [];
          audit.unsupported = [{ segment_choice: 's1', kind: 'unsupported_event',
            reason: 'Earlier completed action became simultaneous with the later action.' }];
        }
        return { output: audit };
      } } });
      const result = await service.run({ version: 1, schema: 'narration_request',
        request_id: `${sample.name}-${accepted}`, surface: 'turn', visible_context: {
          ...scene(), visible_scene: sample.scene, visible_changes: sample.changes
        }, context: {} });
      assert.equal(result.status, accepted ? 'approved' : 'blocked');
      if (accepted) assert.equal(result.approved_output.prose, sample.accepted);
      assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
        'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
    }
  });
});

function scene() {
  return { version: 1, schema: 'visible_context_package', visible_scene: 'Берег',
    visible_changes: [], uncertainties: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], allowed_tensions: [], do_not_imply: [] };
}
