import { reviewedNarration } from './narration-audit-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createPorts, execution, preparedOrdinary, semanticOwners } from './lower-dvina-trace-turn-step-runtime-ports-fixture.js';
import { createActionProductionVisibleConsequence } from '../src/runtime/releases/lower-dvina-trace-a1-production.js';

for (const [query, name, spoken, pending] of [
  ['доска', 'длинная доска', 'Постойте у берега.', false],
  ['шнур', 'короткий шнур', 'Не подходите к стене.', true]
]) test(`prepared steps group exact speech/time then search/discovery (${query})`, async () => {
  const state = committedState();
  const body = { health: 100, satiety: 100, energy: 100, active_conditions: [], body_parts: {} };
  const operation = { op: 'request_discovery', actor_ref: 'mikula', discovery_kind: 'search', target_refs: ['shore'], query };
  const input = execution(operation, undefined, 2);
  input.request.actor.body = body;
  input.plan = { resolution: 'domain_request', continuation: null };
  const ordinary = { ...preparedOrdinary('ordinary_item:board'),
    request_identity: `${input.request.root_turn_id}:ordinary:presence:step:2` };
  const presence = { kind: 'ordinary_presence_seed', resolution: 'materialized', query, display_name: name };
  const ports = createPorts({ committedState: { body_state: body, items: [] },
    semanticActivityOwner: semanticOwners.semanticActivityOwner,
    ordinaryDiscoveryResolver: async () => ({ working_projection: input.working_projection,
      write_fragments: [], summary: 'discovery', ordinary_materialization_atomic_write_plan: ordinary,
      consequence_fragment: { visible_seed: { ordinary_presence_seed: presence } } }) });
  const found = await ports.ordinaryDiscoveryResolver(input);
  assert.equal(Object.keys(found.consequence_fragment.visible_seed)[0], 'ordinary_presence_seed');
  assert.equal(found.player_response_boundary, true);
  assert.equal(found.duration_minutes, 15);
  const speechSeeds = { turn_step_speech: { kind: 'semantic_activity', duration_minutes: 1 } };
  const physical = 'Доска приспособлена как опора.';
  const produced = createActionProductionVisibleConsequence({ actionRef: 'action:3', stepIndex: 3,
    semantic: { source_refs: [ordinary.item.item_id], result_descriptor: {
      physical_description: physical, qualitative_facts: [] } } });
  const step = (step_index, approved_plan) => ({ step_index, approved_plan, applied: true });
  const projected = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => assert.fail('unexpected fallback') } }).project({ retrieved_state: state,
    consequence: { status: pending ? 'partial' : 'resolved', visible_seed: {
      ...found.consequence_fragment.visible_seed, ...speechSeeds, ...(pending ? {} : produced.visible_seed) } },
    time_update: { prepared_effect_ledger: { slices: [
      { step_index: 1, consequence: { visible_seed: speechSeeds } },
      { step_index: 2, consequence: found.consequence_fragment } ] } },
    mode_resolution: { decision_trace: { remaining_intent: 'Осмотреть опору.', step_traces: [
      step(1, { resolution: 'direct', direct_result_kind: 'player_utterance', utterance: { utterance_text: spoken } }),
      step(2, { resolution: 'domain_request', operations: [operation] }),
      { ...step(3, { resolution: 'domain_request', operations: [{ op: 'request_item_use' }] }), applied: !pending } ] } } });
  const expected = [`Вы произнесли: «${spoken}»; этот шаг занял 1 минуту.`,
    'Поиск занял 15 минут.', `Обнаружено: «${name}».`, ...(pending ? [] : [physical])];
  assert.deepEqual(projected.visible_changes, expected);
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text), expected);
    assert.deepEqual(wire.required_current_beat.changes.map(({ ref }) => ref), expected.map((_, index) => `visible_change_${index + 1}`));
    assert.equal(wire.required_current_beat.uncertainties[0].ref, 'uncertainty_1');
    assert.match(call.messages[0].content, call.role_id === 'gameplay_narrator_auditor'
      ? /Integrated duration belongs to its supplied\s+action/u
      : /Integrate a supplied duration into its own action/u);
    assert.deepEqual(wire.optional_support, { visible_scene: projected.visible_scene, sensory_details: projected.sensory_details });
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: `За прошедшую минуту вы произнесли: «${spoken}» Затем пятнадцать минут поиска принесли находку — ${name}. ${pending ? '' : physical + ' '}К осмотру опоры вы ещё не приступили; что он покажет, пока неизвестно. Можно продолжить задуманное или выбрать другое действие.`,
      action_options: [], used_references: [] } };
    assert.match(call.messages[0].content, /standalone elapsed-time sentence/u);
    return { output: { ...reviewedNarration(wire.segments,
      Object.fromEntries([...wire.required_current_beat.changes, ...wire.required_current_beat.uncertainties]
        .map(({ ref }) => [ref, wire.segments.map((_, index) => `s${index + 1}`)]))),
      evidence: ['Duration belongs to its applied step; no overlap or continuation is invented.'] } };
  } } });
  assert.equal((await narrator.run({ version: 1, schema: 'narration_request', request_id: 'causal-o1-a1',
    surface: 'turn', visible_context: projected, context: {} })).status, 'approved');
});

test('search duration uses Russian accusative numeric forms', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: { project: async () => assert.fail() } });
  for (const [duration, noun] of [[1, 'минуту'], [2, 'минуты'], [5, 'минут'], [11, 'минут'], [21, 'минуту'], [22, 'минуты'], [111, 'минут']]) {
    const visible = await projector.project({ retrieved_state: committedState(), consequence: {
      visible_seed: { turn_step_search: { kind: 'semantic_activity', duration_minutes: duration, discovery_kind: 'search' } } } });
    assert.deepEqual(visible.visible_changes, [`Поиск занял ${duration} ${noun}.`]);
  }
});

for (const domainFallback of [false, true]) test(`materialized O1 precedes physical continuation (fallback=${domainFallback})`, async () => {
  const state = committedState();
  state.current_visible_context.sensory_details = ['У воды лежат доски.'];
  const physical = 'На конце жерди видны свежие срезы.';
  const found = 'Обнаружено: «короткая жердь».';
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => ({ ...state.current_visible_context, visible_changes: [physical] }) } });
  const visible = await projector.project({ retrieved_state: state, consequence: {
    ...(domainFallback ? { phase2_kind: 'inspect' } : {}), status: 'resolved', visible_seed: {
      turn_step_speech: { kind: 'semantic_activity', duration_minutes: 1 },
      ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution: 'materialized',
        query: 'деревянная жердь', display_name: 'короткая жердь' },
      turn_step_action_production_3: { change: 'physical_change', physical_description: physical }
    } } });
  assert.equal(visible.visible_changes.filter((text) => text === found).length, 1);
  assert.ok(visible.visible_changes.indexOf(found) < visible.visible_changes.indexOf(physical));
  if (!domainFallback) assert.deepEqual(visible.visible_changes, ['Прошла 1 минута.', found, physical]);
  assert.ok(visible.do_not_imply.includes('discovery_query_as_existence_ownership_or_executed_action'));
  let calls = 0;
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls += 1;
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.optional_support, { visible_scene: visible.visible_scene, sensory_details: visible.sensory_details });
    const changes = wire.required_current_beat.changes.map(({ text }) => text);
    assert.ok(changes.includes(found)); assert.ok(changes.includes(physical));
    return { output: call.role_id === 'gameplay_narrator'
      ? { prose: 'Вы обрабатываете найденную жердь.', action_options: [], used_references: [] } : {} };
  } } });
  assert.equal((await narration.run({ version: 1, schema: 'narration_request', request_id: 'o1-a1',
    surface: 'turn', visible_context: visible, context: {} })).status, 'blocked');
  assert.equal(calls, 2);
});

test('ordinary presence seed accepts only the strict negative or materialized union', async () => {
  const negative = { kind: 'ordinary_presence_seed', resolution: 'absent', query: 'жердь' };
  const positive = { ...negative, resolution: 'materialized', display_name: 'короткая жердь' };
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => assert.fail('unexpected fallback') } });
  for (const seed of [{ ...negative, display_name: 'лишнее' },
    { ...positive, extra: true }, { ...positive, display_name: '' },
    { ...positive, display_name: null }, { ...negative, resolution: 'materialized' }]) {
    await assert.rejects(projector.project({ retrieved_state: committedState(),
      consequence: { visible_seed: { ordinary_presence_seed: seed } } }),
    { code: 'TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID' });
  }
});

for (const fire of [false, true]) {
  test(`authored projection retains findings, body and utterance with remaining intent (fire=${fire})`, async () => {
    const state = committedState();
    const base = { ...state.current_visible_context,
      visible_changes: ['На доске видна зарубка.'], known_context: ['energy:83'] };
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => base }
    });
    const spoken = 'Отзовитесь!';
    const visible = await projector.project({ retrieved_state: state,
      consequence: { phase2_kind: 'inspect', status: 'partial', visible_seed:
        fire ? { turn_step_world_process_2: {
          schema: 'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1',
          process_kind: 'fire', action: 'start', outcome: 'started', status: 'active'
        } } : {} }, mode_resolution: { decision_trace: {
        remaining_intent: 'Проверить пространство под настилом.',
        step_traces: [{ applied: true, approved_plan: {
          resolution: 'direct', direct_result_kind: 'player_utterance',
          utterance: { speaker_ref: 'player', utterance_text: spoken }
        } }] } } });
    assert.ok(visible.visible_changes.includes('На доске видна зарубка.'));
    assert.ok(visible.visible_changes.includes(`Вы произнесли: «${spoken}»`));
    assert.deepEqual(visible.known_context, ['energy:83']);
    assert.ok(visible.uncertainties.includes(
      'Ещё не выполнено: «Проверить пространство под настилом.». Результат этой попытки не установлен.'));
    assert.ok(visible.do_not_imply.includes('uncompleted_remaining_intent'));
    assert.ok(visible.do_not_imply.includes('unconfirmed_speech_audience_or_response'));
    assert.equal(JSON.stringify(visible).includes('никто'), false);
  });
}

function committedState() {
  return { current_visible_context: { version: 1, schema: 'visible_context_package',
    visible_scene: 'Берег.', visible_changes: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [],
    do_not_imply: [] } };
}

for (const [scene, detail, query] of [
  ['Берег у воды.', 'Мокрые доски лежат у кромки воды.', 'Бумаги или вещи, которые могли быть при мне.'],
  ['Гончарный навес.', 'На полке стоят пустые обожжённые чаши.', 'Найти шнур или полоску ткани.']
]) {
  test(`charged discovery preserves committed scene and exact unresolved remainder: ${scene}`, async () => {
    const state = committedState();
    Object.assign(state.current_visible_context, { visible_scene: scene,
      sensory_details: [detail], visible_objects: [{ display_label: 'деревянная полка',
        entity_ref: { entity_kind: 'item', entity_id: 'shelf' } }] });
    const original = structuredClone(state);
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => assert.fail('no domain-native projection') }
    });
    const remaining = 'После поиска связать свёрток.';
    for (const resolution of ['no_change', 'authority_required', 'absent']) {
      const visible = await projector.project({ retrieved_state: state,
        consequence: { status: 'partial', visible_seed: { completed_steps: [],
          turn_step_search: { kind: 'semantic_activity', duration_minutes: 15, discovery_kind: 'search' },
          ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution, query } } },
        mode_resolution: { decision_trace: { remaining_intent: remaining,
          step_traces: [{ applied: true, approved_plan: { resolution: 'domain_request',
            goal_result: 'pending', operations: [{ op: 'request_discovery' }], check: null } }] } } });
      assert.equal(visible.visible_scene, scene);
      assert.deepEqual(visible.sensory_details, [detail]);
      assert.deepEqual(visible.visible_objects, state.current_visible_context.visible_objects);
      assert.ok(visible.visible_changes.includes('Поиск занял 15 минут.'));
      assert.ok(visible[resolution === 'absent' ? 'visible_changes' : 'uncertainties']
        .some(value => value.includes(`«${query}»`)));
      assert.ok(visible.uncertainties.includes(`Ещё не выполнено: «${remaining}». Результат этой попытки не установлен.`));
      assert.ok(visible.do_not_imply.includes('uncompleted_remaining_intent'));
      assert.ok(!JSON.stringify(visible).includes('Удалось осуществить лишь часть'));
    }
    const activity = await projector.project({ retrieved_state: state,
      consequence: { status: 'resolved', visible_seed: { completed_steps: [],
        turn_step_rest: { kind: 'semantic_activity', duration_minutes: 5 } } } });
    assert.equal(activity.visible_scene, scene);
    assert.deepEqual(activity.visible_changes, ['Прошло 5 минут.']);
    assert.deepEqual(state, original);
  });
}


for (const sample of [
  { speech: 'Отзовитесь!', speechMinutes: 1, speechUnit: 'минуту',
    action: 'Осторожно касаюсь концом прута воды.', minutes: 5, unit: 'минут' },
  { speech: 'Оставьте место у двери.', speechMinutes: 2, speechUnit: 'минуты',
    action: 'Провожу краем лоскута по шероховатой чаше.', minutes: 21, unit: 'минуты' }
]) test(`applied durations bind their own speech step and transient action: ${sample.speech}`, async () => {
  const speechSeeds = { turn_step_1: { kind: 'semantic_activity', duration_minutes: sample.speechMinutes } };
  const actionSeeds = { turn_step_item_use_2: { kind: 'transient_item_use', description: sample.action },
    turn_step_2: { kind: 'semantic_activity', duration_minutes: sample.minutes } };
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: { project: async () => assert.fail() } })
    .project({ retrieved_state: committedState(), consequence: { status: 'resolved',
      visible_seed: { ...actionSeeds, ...speechSeeds } },
    time_update: { prepared_effect_ledger: { slices: [
      { step_index: 1, consequence: { visible_seed: speechSeeds } },
      { step_index: 2, consequence: { visible_seed: actionSeeds } } ] } },
    mode_resolution: { decision_trace: { remaining_intent: null, step_traces: [
      { step_index: 1, applied: true, approved_plan: { resolution: 'direct', direct_result_kind: 'player_utterance',
        utterance: { utterance_text: sample.speech } } },
      { step_index: 2, applied: true, approved_plan: { resolution: 'domain_request', goal_result: 'pending',
        operations: [{ op: 'request_item_use', use_kind: 'other', description: sample.action }] } } ] } } });
  assert.deepEqual(visible.visible_changes, [
    `Вы произнесли: «${sample.speech}»; этот шаг занял ${sample.speechMinutes} ${sample.speechUnit}.`,
    `Вы в течение ${sample.minutes} ${sample.unit} выполняли попытку: «${sample.action}».`,
    'В ходе этой попытки результат наблюдения не установлен.'
  ]);
  assert.deepEqual(visible.uncertainties, []);
  assert.equal(visible.visible_changes.some(change => /Прошл[ао]/u.test(change)), false);
});
