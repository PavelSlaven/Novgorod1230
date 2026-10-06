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
      .concat(wire.required_current_beat.uncertainties ?? [])
      .map(({ ref }) => ({ ref, segment_choices: ids })),
    unsupported,
    literary_failures: literaryFailures,
    evidence
  };
}

function roleInput(call) {
  if (call.role_id !== 'gameplay_narrator_auditor') return call.messages[1].content;
  const input = JSON.parse(call.messages[1].content);
  assert.ok(input.segments.every(({ segment_id }) => /^p\d+$/u.test(segment_id)));
  assert.ok(input.required_current_beat.changes.every(({ ref }) => /^c\d+$/u.test(ref)));
  assert.ok((input.required_current_beat.uncertainties ?? []).every(({ ref }) => /^u\d+$/u.test(ref)));
  return input;
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
    'Вы выполнили попытку: «Осторожно прощупываю воду длинной ветвью.»'
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
  let auditCalls = 0;
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = roleInput(call);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content, /Длительность хода — UI-метаданные/u);
      assert.match(call.messages[0].content, /Используй только переданные факты/u);
      return { output: { prose: 'За минуту вы произнесли: «Онисим!», завершив наблюдение. У воды лежат разбитые доски и обрывки снастей.' } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(call.messages[0].content, /длительность хода относится только к UI/u);
      assert.match(wire, /Обязательные положения текущего эпизода/u);
      assert.match(wire, /У воды лежат разбитые доски/u);
      return { output: { replacements: [{
        prose: 'Вы оглядели берег и позвали: «Онисим!» У самой воды среди обломков лежат разбитые доски и обрывки снастей.'
      }] } };
    }
    const initial = auditCalls++ === 0;
    return { output: reviewed(wire, {
      unsupported: initial ? [{ segment_choice: wire.segments[0].segment_id, kind: 'unsupported_fact',
        reason: 'Elapsed minute is not supplied as prose evidence.' }] : [],
      literaryFailures: initial ? [{ check: 'elapsed_as_service_report', segment_choice: wire.segments[0].segment_id,
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
]) test(`${sample.name}: source-order literary finding does not block delivery`, async () => {
  const visible = { ...scene(), visible_scene: 'Невиденная тестовая сцена',
    visible_changes: sample.changes };
  const calls = [];
  let auditCalls = 0;
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = roleInput(call);
    if (call.role_id === 'gameplay_narrator') {
      assert.match(call.messages[0].content,
        /Передай каждый источник required_current_beat ровно один раз/u);
      assert.match(call.messages[0].content,
        /Оставляй опорную подробность только тогда/u);
      return { output: { prose: sample.checklist } };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(call.messages[0].content, /Перестрой весь отрывок/u);
      assert.match(wire, /Замечания аудитора/u);
      return { output: { replacements: [{ prose: sample.repaired }] } };
    }
    const initial = auditCalls++ === 0;
    assert.match(call.messages[0].content,
      /не создают грамматического управления/u);
    return { output: reviewed(wire, {
      literaryFailures: initial ? [{ check: 'weak_literary_composition',
        segment_choice: wire.segments[0].segment_id,
        reason: 'Supported facts are restated in source order instead of composing the performed action and supplied spatial relations into a scene.' }] : [],
      evidence: initial ? [] : ['The performed action organizes the supplied spatial facts.']
    }) };
  } } });

  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: sample.name, surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, sample.checklist);
  assert.equal(result.final_audit.artistic_verdict, 'fail');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
});

test('completed-before literary findings remain non-blocking delivery metadata', async (t) => {
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
      rejected: [
        { prose: 'Вы внимательно изучили обстановку. Над открытым берегом тянется низкое сырое небо. Мокрый песок и ивняк тянутся вдоль берега реки; у самой воды лежат разбитые доски, обрывки снастей и вынесенные течением ветви, среди которых тянется полоса камыша и осоки. Между мокрым песком и ивняком начинается приметная тропа, но за кустами её продолжения не видно. У самого берега слышен плеск воды. Вы произнесли: «Онисим!»' },
        { prose: 'Вы произнесли: «Онисим!», внимательно изучая обстановку: над открытым берегом тянется низкое сырое небо; вдоль реки тянутся мокрый песок и ивняк, между которыми начинается приметная тропа, скрывающаяся за кустами; у самой воды лежат разбитые доски и обрывки снастей, у воды тянется полоса камыша и осоки, среди обломков лежат вынесенные течением ветви, а у самого берега слышен плеск.', overlap: true }
      ],
      accepted: 'Внимательно осмотрев обстановку — над открытым берегом тянется низкое сырое небо; вдоль реки тянутся мокрый песок и ивняк, между которыми начинается приметная тропа, скрывающаяся за кустами; у самой воды лежат разбитые доски и обрывки снастей, у воды тянется полоса камыша и осоки, среди обломков лежат вынесенные течением ветви, а у самого берега слышен плеск, — вы произнесли: «Онисим!»',
      perception: true
    },
    {
      name: 'unseen workshop inspection then call', scene: 'мастерская',
      changes: ['Вы осмотрели мастерскую.', 'Вы произнесли: «Хозяин!»',
        'У окна стоит верстак; на нём лежит резец.', 'Под окном темнеют стружки.',
        'Справа от двери висит кожаный фартук.'],
      rejected: [
        { prose: 'Вы осмотрели мастерскую. У окна стоит верстак; на нём лежит резец. Под окном темнеют стружки. Справа от двери висит кожаный фартук. Вы произнесли: «Хозяин!»' },
        { prose: 'Вы произнесли: «Хозяин!», осматривая мастерскую: у окна стоит верстак с лежащим на нём резцом, под окном темнеют стружки, а справа от двери висит кожаный фартук.', overlap: true }
      ],
      accepted: 'Осмотрев мастерскую — у окна стоит верстак с лежащим на нём резцом, под окном темнеют стружки, а справа от двери висит кожаный фартук, — вы произнесли: «Хозяин!»',
      perception: true
    },
    {
      name: 'unseen yard entry then knock', scene: 'двор',
      changes: ['Вы вошли во двор.', 'Вы постучали в дверь.',
        'Слева от входа стоит амбар.', 'Впереди видна дверь дома.',
        'У колодца справа лежит пустое ведро.'],
      rejected: [{ prose: 'Вы постучали в дверь, входя во двор. Слева от входа стоит амбар. Впереди видна дверь дома. У колодца справа лежит пустое ведро.', overlap: true }],
      accepted: 'Войдя во двор, вы постучали в дверь. Слева от входа стоит амбар; впереди видна дверь дома, а справа, у колодца, лежит пустое ведро.'
    }
  ];
  for (const sample of samples) await t.test(sample.name, async () => {
      const repairs = [...sample.rejected.map((repair) => ({ ...repair, accepted: false })),
        { prose: sample.accepted, accepted: true }];
      for (const repair of repairs) {
        const calls = [];
        let auditCalls = 0;
      const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
        calls.push(call.role_id);
        const wire = roleInput(call);
        if (call.role_id === 'gameplay_narrator') {
          assert.match(call.messages[0].content,
            /Передай каждый источник required_current_beat ровно один раз/u);
          assert.match(call.messages[0].content,
            /Передавай подтверждённую речь дословно/u);
          assert.match(call.messages[0].content,
            /Выборочно используй дополнительные опорные сведения, чтобы построить эпизод/u);
          return { output: { prose: sample.changes.join(' ') } };
        }
        if (call.role_id === 'gameplay_narrator_semantic_repair') {
          assert.match(wire, /Обязательные положения текущего эпизода/u);
          assert.match(call.messages[0].content, /подчинение с отношением «раньше» допустимо/u);
          assert.match(call.messages[0].content, /visible_scene может указывать место[\s\S]*цель действия/u);
          assert.match(call.messages[0].content,
            /Если в текущем эпизоде осмотра или восприятия переданы наблюдения[\s\S]*грамматически связывающей/u);
          return { output: { replacements: [{ prose: repair.prose }] } };
        }
        assert.match(call.messages[0].content,
          /Предоставленный безопасный\s+для игрока источник подтверждает ровно свои атомарные фактические утверждения/u);
        assert.match(call.messages[0].content,
          /Метки, идентификаторы,\s+категории, имена и правдоподобные выводы не добавляют сенсорных признаков/u);
        assert.match(call.messages[0].content, /Никогда не принимай обратный причинный порядок/u);
        assert.match(call.messages[0].content, /Грамматическое подчинение более раннего\s+действия допустимо[\s\S]*завершилось до более позднего действия/u);
        assert.match(call.messages[0].content, /одновременным с более поздним или продолжается во время него/u);
        const initial = auditCalls++ === 0;
        const audit = reviewed(wire, {
          literaryFailures: initial || !repair.accepted ? [{ check: 'weak_literary_composition',
            segment_choice: wire.segments[0].segment_id, reason: 'Performed actions overlap or descriptive facts follow source order.' }] : [],
          evidence: initial || !repair.accepted ? [] : ['Completed-before action order and grounding are preserved.']
        });
        if (!initial && repair.overlap) {
          audit.source_reviews[0].segment_choices = [];
          audit.unsupported = [{ segment_choice: wire.segments[0].segment_id, kind: 'unsupported_event',
            reason: 'Earlier completed action became simultaneous with the later action.' }];
        }
        return { output: audit };
      } } });
      const result = await service.run({ version: 1, schema: 'narration_request',
        request_id: `${sample.name}-${repair.accepted}-${repair.overlap === true}`,
        surface: 'turn', visible_context: {
          ...scene(), visible_scene: sample.scene, visible_changes: sample.changes
        }, context: {} });
      assert.equal(result.status, 'approved');
      assert.equal(result.approved_output.prose, sample.changes.join(' '));
      assert.equal(result.final_audit.artistic_verdict, 'fail');
      assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
    }
  });
});

test('dense literary variants remain deliverable with recorded artistic failure', async (t) => {
  const changes = [
    'Вы осмотрели кладовую.',
    'У дальней стены стоят ящики.',
    'На верхнем ящике лежит ключ.',
    'Под ним видна трещина.',
    'У двери висит фонарь.',
    'На полу тянется полоса песка.',
    'Возле порога лежит обрывок верёвки.',
    'На полке стоит глиняная чаша.',
    'В чаше заметна вода.',
    'Одежда осталась сырой.'
  ];
  const uncertainty = 'Наблюдения не устанавливают, кто оставил ключ.';
  const flat = `${changes.join(' ')} ${uncertainty}`;
  const focused = 'Осматривая кладовую, вы различаете у дальней стены ящики: на верхнем лежит ключ, а под ним видна трещина. У двери висит фонарь. На полу возле порога тянется полоса песка и лежит обрывок верёвки. На полке стоит глиняная чаша с водой. Одежда осталась сырой. Наблюдения не устанавливают, кто оставил ключ.';
  const focalCatalogue = 'Осматривая кладовую, вы различаете: у дальней стены стоят ящики, на верхнем лежит ключ, под ним видна трещина; у двери висит фонарь; на полу тянется полоса песка; возле порога лежит обрывок верёвки; на полке стоит глиняная чаша, в чаше заметна вода. Одежда осталась сырой. Наблюдения не устанавливают, кто оставил ключ.';
  const repairs = [
    { name: 'focal repair passes', prose: focused, accepted: true },
    { name: 'focal verb plus independent catalogue stays terminal', prose: focalCatalogue, accepted: false },
    { name: 'byte-identical repair stays terminal', prose: flat, accepted: false },
    { name: 'clause permutation stays terminal',
      prose: `${uncertainty} ${[...changes].reverse().join(' ')}`, accepted: false }
  ];
  for (const repair of repairs) await t.test(repair.name, async () => {
    const calls = [];
    let auditCalls = 0;
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = roleInput(call);
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /Сначала передай текущий эпизод/u);
        assert.match(call.messages[0].content, /Оставляй опорную подробность только тогда/u);
        return { output: { prose: flat } };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.match(wire, /Обязательные положения текущего эпизода/u);
        assert.ok(wire.includes(flat));
        assert.ok(wire.includes(uncertainty));
        assert.match(call.messages[0].content, /При плотном эпизоде осмотра или восприятия/u);
        assert.match(call.messages[0].content, /не добавляй связующих фактов, причин, ощущений или результатов/u);
        assert.ok(wire.includes(flat));
        assert.match(call.messages[0].content, /Замена должна отличаться от отклонённой прозы/u);
        return { output: { replacements: [{ prose: repair.prose }] } };
      }
      const initial = auditCalls++ === 0;
      const audit = reviewed(wire, {
        literaryFailures: initial || !repair.accepted ? [{ check: 'weak_literary_composition',
          segment_choice: wire.segments[0].segment_id, reason: repair.name.includes('independent catalogue')
            ? 'Focal wording introduces independent observations without an anchored factual cluster.'
            : 'Dense required facts remain a source-order checklist.' }] : [],
        evidence: initial || !repair.accepted ? [] : ['Supplied anchors organize the dense current beat.']
      });
      return { output: audit };
    } } });
    const result = await service.run({ version: 1, schema: 'narration_request',
      request_id: `dense-current-${repair.accepted}-${repair.name}`, surface: 'turn', visible_context: {
        ...scene(), visible_changes: changes, uncertainties: [uncertainty]
      }, context: {} });
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose, flat);
    assert.equal(result.final_audit.artistic_verdict, 'fail');
    assert.equal(result.final_audit.coverage.visible_changes.length, changes.length);
    assert.equal(result.final_audit.coverage.uncertainties.length, 1);
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  });
});

test('sparse current beat remains concise without an invented bridge or layout', async () => {
  const prose = 'На пороге лежит ключ.';
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    const wire = roleInput(call);
    if (call.role_id === 'gameplay_narrator') {
      return { output: { prose } };
    }
    return { output: reviewed(wire, { evidence: ['The sparse grounded result is concise.'] }) };
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'sparse-current', surface: 'turn', visible_context: {
      ...scene(), visible_changes: ['На пороге лежит ключ.']
    }, context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, prose);
});

function scene() {
  return { version: 1, schema: 'visible_context_package', visible_scene: 'Берег',
    visible_changes: [], uncertainties: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], allowed_tensions: [], do_not_imply: [] };
}
