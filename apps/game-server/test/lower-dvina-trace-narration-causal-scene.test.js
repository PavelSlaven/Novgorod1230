import assert from 'node:assert/strict';
import test from 'node:test';
import { createTracePhase3VisibleProjector } from '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { createTracePhase6VisibleProjector } from '../src/runtime/lower-dvina-trace-phase-6-effects.js';
import { projectCurrentSceneForNoOperationDirect } from '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { lowerDvinaTraceVisibleSceneItems } from '../src/runtime/lower-dvina-trace-visible-scene-items.js';

const fallback = { project: async () => assert.fail('unexpected fallback') };
const destination = { location_ref: 'unseen-landing', g5_anchor_id: 'landing',
  display_name: 'Пристань за излучиной' };
const scenePresentation = {
  locations: [{ location_ref: destination.location_ref,
    display_name: destination.display_name, player_visible_physical_facts: [
      'У воды лежит свежий настил.', 'За пристанью видны тёмные ели.' ] }],
  route_presentations: [{ route_ref: 'unseen-route',
    route_fact_ref: 'trace_ld_v1_route_wreck_to_camp_committed',
    visible_scene: destination.display_name,
    visible_change: 'Вы вышли к пристани за излучиной.',
    known_context: 'Обратный путь идёт вдоль берега.',
    source_basis: 'committed_route_arrival',
    perception_requirement: 'committed_route_movement' }]
};
const contracts = { actors: [{ ref: 'eremey_fisher', instance_id: 'fisher',
  anchor_id: 'landing' }] };

function currentScene() {
  return { version: 1, schema: 'visible_context_package', visible_scene: 'Берег',
    visible_changes: [], sensory_details: ['У воды виден надломленный колышек.'],
    visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'fisher' },
      display_label: 'рыбак', recognition: 'unrecognized',
      visible_status: 'сидит у навеса' }], visible_objects: [],
    known_context: ['При вас есть хозяйственный нож.'], uncertainties: [],
    allowed_tensions: [], do_not_imply: [] };
}

async function assertCurrentWire(visible, required, omitted = []) {
  let calls = 0;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls += 1;
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.optional_support, { visible_scene: visible.visible_scene, sensory_details: visible.sensory_details });
    const facts = wire.required_current_beat.changes.map(({ text }) => text);
    for (const fact of required) assert.ok(facts.includes(fact), fact);
    for (const fact of omitted) assert.equal(call.messages[1].content.includes(fact), false, fact);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: 'Вы смотрите на берег.', action_options: [], used_references: [] } };
    return { output: {} };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: 'causal-scene', surface: 'turn', visible_context: visible, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 2);
}

for (const generic of [false, true]) {
  test(`real phase3 ${generic ? 'known ordinary route' : 'authored'} arrival reaches narrator as current facts`, async () => {
    const visible = await createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: createTracePhase3VisibleProjector({
      phase2Projector: fallback, contracts, scenePresentation
    }) }).project({ consequence: { phase3_kind: 'movement', generic_known_route: generic,
      movement: { destination, route_ref: 'unseen-route' } },
      retrieved_state: { npcs: [{ instance_id: 'fisher', semantic_state: { n1_remainder: {
        schema: 'rus.n1_npc_semantic_remainder.v1', version: 1, profile_ref: 'n1-profile',
        npc_ref: 'fisher', ordinary_descriptor: 'На рукавах налипли стружки.',
        ordinary_activity: 'Перебирает обрезки досок.', causal_basis_refs: ['scene', 'npc']
      } } }] } });
    await assertCurrentWire(visible, [...scenePresentation.locations[0].player_visible_physical_facts,
      'В поле зрения — Еремей.', 'Обратный путь идёт вдоль берега.',
      'Еремей: На рукавах налипли стружки.', 'Еремей: Перебирает обрезки досок.']);
    assert.equal(visible.visible_changes.filter((fact) =>
      fact === 'Еремей: На рукавах налипли стружки.').length, 1);
  });
}

test('real historical phase3 arrival keeps destination, NPC and discovered return route', async () => {
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: createTracePhase3VisibleProjector({
    phase2Projector: fallback, contracts
  }) }).project({ consequence: { phase3_kind: 'movement' } });
  await assertCurrentWire(visible, ['Рабочий стан стоит у берега Нижней Двины.',
    'В поле зрения — Еремей.', 'Обратная тропа к месту крушения теперь известна.']);
});

test('real terminal carrying arrival exposes destination facts without source snapshot', async () => {
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: createTracePhase6VisibleProjector({ fallback, scenePresentation }) })
    .project({ consequence: { phase6_kind: 'synchronized_carry', carry: { intent: {
      execution_after: { status: 'completed' }, terminal_group_position: destination,
      terminal_group_ids: ['fisher'] } } },
    retrieved_state: { current_visible_context: currentScene() } });
  await assertCurrentWire(visible, scenePresentation.locations[0].player_visible_physical_facts,
    ['При вас есть хозяйственный нож.']);
});

test('applied player-safe observation exposes perceived facts and not static self knowledge', async () => {
  const input = { consequence: { visible_seed: {} },
    retrieved_state: { current_visible_context: currentScene() },
    mode_resolution: { decision_trace: { step_traces: [{ applied: true, approved_plan: {
      resolution: 'direct', goal_result: 'achieved', operations: [], check: null,
      direct_result_kind: 'player_safe_observation' } }] } } };
  const visible = projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} });
  await assertCurrentWire(visible, ['У воды виден надломленный колышек.',
    'В поле зрения — рыбак: сидит у навеса.'], ['При вас есть хозяйственный нож.']);
  input.mode_resolution.decision_trace.step_traces[0].applied = false;
  const unapplied = projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} });
  assert.deepEqual(unapplied.visible_changes, []);
});

test('ordinary seed keeps new observation and drops elapsed prose and old snapshot', async () => {
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback }).project({
    consequence: { status: 'resolved', visible_seed: {
      turn_step_1: { kind: 'semantic_activity', duration_minutes: 2 },
      ordinary_scene_seed: { kind: 'ordinary_scene_seed',
        sensory_details: ['Под навесом видны свежие стружки.'] }
    } }, retrieved_state: { current_visible_context: currentScene() },
    body_update: { state_after: {} },
    mode_resolution: { decision_trace: { remaining_intent: null, step_traces: [{
      approved_plan: { resolution: 'domain_request', goal_result: 'pending',
        operations: [{ op: 'request_discovery' }], check: null } }] } }
  });
  await assertCurrentWire(visible, ['Под навесом видны свежие стружки.'],
    ['Прошло 2 минуты.', 'При вас есть хозяйственный нож.']);
});

test('real observation promotes an object-only result and unseen safe sibling without metadata', async () => {
  for (const [label, status] of [['перевёрнутая лодка', 'у воды'],
    ['плетёная корзина', 'на краю настила'], ['связка жердей', 'available']]) {
    const scene = currentScene();
    scene.sensory_details = [];
    scene.visible_npc = [];
    scene.visible_objects = [{ entity_ref: { entity_kind: 'item', entity_id: 'unseen-object' },
      display_label: label, recognition: 'recognized', visible_status: status,
      unsupported_detail: { explanation: 'НЕПОДТВЕРЖДЁННОЕ СОДЕРЖИМОЕ' } }];
    const input = { consequence: { visible_seed: {} },
      retrieved_state: { current_visible_context: scene },
      mode_resolution: { decision_trace: { step_traces: [{ applied: true, approved_plan: {
        resolution: 'direct', goal_result: 'achieved', operations: [], check: null,
        direct_result_kind: 'player_safe_observation' } }] } } };
    const visible = projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} });
    await assertCurrentWire(visible,
      [`В поле зрения — ${label}${status === 'available' ? '' : `: ${status}`}.`],
      ['НЕПОДТВЕРЖДЁННОЕ СОДЕРЖИМОЕ', 'unsupported_detail', 'unseen-object']);
    scene.visible_objects[0].hidden_state = { contents: 'secret cargo' };
    assert.equal(projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} }), null);
  }
});

test('general scene observation excludes every native carried placement; explicit item observation owns it', async () => {
  const items = ['hands', 'equipped', 'worn', 'worn_quick', 'external', 'external_load']
    .map((position, index) => ({ item_id: `held-${index}`, name: `вещь ${index}`,
      condition_state: 'serviceable', placement: {
        holder_character_id: 'player', physical_position: position } }));
  const carried = lowerDvinaTraceVisibleSceneItems(items,
    { location_ref: 'shore', g5_anchor_id: 'shore-anchor' }, 'player');
  assert.deepEqual([...new Set(carried.map(({ visibleObject }) => visibleObject.visible_status))],
    ['у вас в руках', 'при вас']);
  for (const nearby of [[], [{ entity_ref: { entity_kind: 'item', entity_id: 'boat' },
    display_label: 'перевёрнутая лодка', recognition: 'recognized', visible_status: 'у воды' }]]) {
    const scene = currentScene();
    scene.sensory_details = [];
    scene.visible_npc = [];
    scene.visible_objects = [...nearby, ...carried.map(({ visibleObject }) => visibleObject)];
    const plan = { resolution: 'direct', goal_result: 'achieved', operations: [], check: null,
      direct_result_kind: 'player_safe_observation' };
    const input = { consequence: { visible_seed: {} },
      retrieved_state: { current_visible_context: scene, items },
      mode_resolution: { decision_trace: { step_traces: [{ applied: true, approved_plan: plan }] } } };
    const visible = projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} });
    await assertCurrentWire(visible, nearby.length ? ['В поле зрения — перевёрнутая лодка: у воды.'] : [],
      items.map(({ name }) => name));
    if (!nearby.length) assert.deepEqual(visible.visible_changes,
      ['Вы внимательно изучили обстановку.']);
    plan.direct_result_kind = 'player_safe_item_observation';
    const inspected = projectCurrentSceneForNoOperationDirect({ input, directSeedKeys: [], body: {} });
    for (const { name } of items) assert.ok(inspected.visible_changes.some((fact) => fact.includes(name)));
    await assertCurrentWire(inspected, inspected.visible_changes, ['перевёрнутая лодка']);
  }
});

test('real observation preserves entity-bound human N1 cues without translating portrait enums', async () => {
  const scene = currentScene();
  scene.visible_npc[0].observable_cues = {
    ordinary_remainder: { ordinary_descriptor: 'На рукавах налипли стружки.',
      ordinary_activity: 'Перебирает обрезки досок.' },
    identity: { sex_category: 'male', appearance: { build: 'stocky' } },
    outward_presentation: { body_pose: 'three_quarter' },
    unsupported_detail: 'НЕПОДТВЕРЖДЁННЫЙ МОТИВ'
  };
  const visible = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: { visible_seed: {} }, retrieved_state: { current_visible_context: scene },
    mode_resolution: { decision_trace: { step_traces: [{ applied: true, approved_plan: {
      resolution: 'direct', goal_result: 'achieved', operations: [], check: null,
      direct_result_kind: 'player_safe_observation' } }] } }
  }, directSeedKeys: [], body: {} });
  await assertCurrentWire(visible, ['В поле зрения — рыбак: сидит у навеса.',
    'рыбак: На рукавах налипли стружки.', 'рыбак: Перебирает обрезки досок.'],
  ['three_quarter', 'stocky', 'НЕПОДТВЕРЖДЁННЫЙ МОТИВ']);
});


test('compound direct speech and failed later action preserve results without elapsed prose', async () => {
  const speech = 'Онисим!';
  const goal = 'длинной ветвью прощупать воду между обломками';
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project() { throw new Error('Direct steps use the current scene owner.'); } }
  }).project({ retrieved_state: { current_visible_context: currentScene() },
    consequence: { status: 'resolved', visible_seed: {
      turn_step_1: { kind: 'semantic_activity', duration_minutes: 1 },
      turn_step_2: { kind: 'semantic_activity', duration_minutes: 1 }
    } }, mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [{ applied: true, approved_plan: { resolution: 'direct',
        goal_result: 'achieved', operations: [], check: null,
        direct_result_kind: 'player_utterance', utterance: { utterance_text: speech } } },
      { applied: true, approved_plan: { resolution: 'direct', goal_result: 'not_achieved',
        operations: [], check: null, interpretation: { player_goal: goal } } }] }
    } });
  assert.deepEqual(visible.visible_changes, [
    `Вы произнесли: «${speech}»`, `Не удалось достичь цели «${goal}».`]);
  assert.deepEqual(visible.uncertainties, []);
});


test('unapplied direct failures never become visible results', async () => {
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => currentScene() }
  }).project({
    retrieved_state: { current_visible_context: currentScene() },
    consequence: { status: 'resolved', visible_seed: {} },
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [{ applied: false, approved_plan: { resolution: 'direct',
        goal_result: 'not_achieved', operations: [], check: null,
        interpretation: { player_goal: 'перебраться через воду' } } }] } }
  });
  assert.deepEqual(visible.visible_changes, []);
});
