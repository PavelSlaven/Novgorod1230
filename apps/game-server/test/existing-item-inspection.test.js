import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from '@rus/turn';
import { basePlan, input, ports } from '../../../packages/turn/test/turn-step-loop-fixture.js';
import { projectItems } from '../src/runtime/lower-dvina-trace-player-safe-items.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

const query = 'Осмотреть предметы и понять, откуда появились повреждения.';
const items = [
  { item_id: 'tool', name: 'Деревянная колотушка', condition_state: 'damaged',
    placement: { holder_character_id: 'actor-1', physical_position: 'hands' },
    physical_facts: ['На рукояти видна продольная трещина.'] },
  { item_id: 'cord', name: 'Плетёный шнур', condition_state: 'serviceable',
    placement: { holder_character_id: 'actor-1', physical_position: 'worn_quick' } }
];
function safe(records = items) {
  return { actor_id: 'actor-1', items: projectItems(records, {
    actorId: 'actor-1', position: { location_ref: 'shore' }, visibleNpcIds: new Set() }),
    visible_entities: records.filter(item => item.item_id !== 'hidden')
      .map(item => ({ entity_ref: item.item_id })),
    ordinary_resolution: { discovery_available: true,
      container_resolution_available: false, scene_seed_available: true } };
}
function resolver() {
  return createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'inspection', verifyStageBCutover: () => true,
    loadEnablement: async () => null,
    ordinaryMaterializationModel: async () => assert.fail('No materialization call for known item state')
  });
}
function execution(target = 'tool', projection = safe()) {
  return { request: { root_turn_id: 'turn-1', step_index: 1, player_safe_state: projection },
    operation: { op: 'request_discovery', discovery_kind: 'inspect', target_refs: [target], query },
    plan: { continuation: null }, working_projection: projection,
    committed_state: { items: [{ ...items[0], condition_state: 'serviceable' }] } };
}
function currentScene() {
  return { version: 1, schema: 'visible_context_package', visible_scene: 'Берег.',
    sensory_details: ['Рядом лежит мокрая ветвь.'], visible_changes: [],
    visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: [] };
}

test('existing inspection reads current exact target without ordinary enablement or new truth', async () => {
  const request = execution();
  const before = structuredClone(request);
  const result = await resolver()(request);
  assert.deepEqual(request, before);
  assert.equal(result.duration_minutes, 0);
  assert.deepEqual(result.write_fragments, []);
  assert.equal(result.ordinary_materialization_atomic_write_plan, undefined);
  const seed = result.consequence_fragment.visible_seed.turn_step_item_inspection_1;
  assert.ok(seed.visible_changes.some(text => text.includes('повреждено')));
  assert.ok(seed.visible_changes.some(text => text.includes('у вас в руках')));
  assert.ok(seed.visible_changes.some(text => text.includes(items[0].physical_facts[0])));
  assert.ok(seed.visible_changes.every(text => !text.includes(items[1].name)));
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => assert.fail('Inspection preserves the current scene') } });
  const renderInput = { retrieved_state: { actor_id: 'actor-1',
    current_visible_context: currentScene() }, consequence: {
      status: 'partial', visible_seed: result.consequence_fragment.visible_seed } };
  const visible = await projector.project(renderInput);
  assert.equal(visible.visible_scene, 'Берег.');
  assert.deepEqual(visible.sensory_details, currentScene().sensory_details);
  assert.deepEqual(visible.visible_changes, seed.visible_changes);
  const applied = await projector.project({ ...renderInput,
    mode_resolution: { decision_trace: { step_traces: [{ applied: true, step_index: 1,
      approved_plan: { resolution: 'domain_request', operations: [request.operation] } }] } } });
  assert.deepEqual(applied.visible_changes, seed.visible_changes);
  assert.deepEqual(applied.uncertainties, visible.uncertainties);
  assert.ok(visible.uncertainties.some(text => text.includes(query)));
  assert.deepEqual(await projector.project(JSON.parse(JSON.stringify(renderInput))), visible);
  const native = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => ({ ...currentScene(), visible_scene: 'У навеса.',
      visible_changes: ['Вы подошли к навесу.'] }) } });
  const combined = await native.project({ ...renderInput, consequence: {
    ...renderInput.consequence, phase3_kind: 'movement' } });
  assert.equal(combined.visible_scene, 'У навеса.');
  assert.deepEqual(combined.visible_changes, ['Вы подошли к навесу.', ...currentScene().sensory_details, ...seed.visible_changes]);
});

test('concealed or closed-container contents never enter the existing inspection path', async () => {
  const records = [...items, { item_id: 'bag', open_state: 'closed',
    placement: { holder_character_id: 'actor-1', physical_position: 'hands' } },
  { item_id: 'hidden', name: 'Скрытый предмет', placement: { container_id: 'bag' } }];
  const projection = safe(records);
  assert.equal(projection.items.some(item => item.item_id === 'hidden'), false);
  const result = await resolver()(execution('hidden', projection));
  assert.equal(result.summary, 'ordinary discovery unavailable');
  assert.equal(Object.values(result.consequence_fragment.visible_seed)
    .some(seed => seed.kind === 'existing_item_inspection'), false);
});

test('two existing targets preserve ordered observations and the exact later intention', async () => {
  let modelCalls = 0;
  const after = { remaining_intent: 'Положить предметы рядом и позвать лодочника.', depends_on_refs: [] };
  const projection = safe();
  const result = await runTurnStepLoop(input({ initialWorkingProjection: projection,
    rootPlayerAction: query }), ports({
    projectPlayerSafeState: async ({ working_projection: state }) => structuredClone(state),
    executionRegistry: createTurnStepExecutionRegistry({ domain: {
      request_discovery: resolver() } }),
    turnStepModel: async request => {
      modelCalls += 1;
      return basePlan(request, { resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor-1',
          discovery_kind: 'inspect', target_refs: ['tool'], query }],
        continuation: { remaining_intent: query, depends_on_refs: [], pending_discovery: {
          remaining_target_refs: ['cord'], after } } });
    }
  }));
  assert.equal(modelCalls, 1);
  assert.equal(result.step_traces.length, 2);
  assert.deepEqual(result.step_traces.map(trace => trace.approved_plan.operations[0].target_refs[0]), ['tool', 'cord']);
  assert.equal(result.remaining_intent, after.remaining_intent);
  assert.deepEqual(result.working_projection, projection);
  const seeds = result.consequence_fragments.flatMap(fragment => Object.values(fragment.visible_seed));
  assert.deepEqual(seeds.map(seed => seed.target_ref), ['tool', 'cord']);
  assert.ok(seeds[0].visible_changes.some(text => text.includes('повреждено')));
  assert.ok(seeds[1].visible_changes.some(text => text.includes('пригодно')));
});
