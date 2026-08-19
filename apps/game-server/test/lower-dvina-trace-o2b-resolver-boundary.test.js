import assert from 'node:assert/strict'; import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { createContainerAccessHandler } from '../src/runtime/lower-dvina-trace-turn-step-container-access.js';
import { initializeRuntimeState } from '../src/runtime/lower-dvina-trace-turn-step-item-operations.js';

const op = { op: 'request_container_access', actor_ref: 'actor', container_ref: 'chest', access_kind: 'open_and_view' };
function context(overrides = {}) { return { container_ref: 'chest', template_id: 'chest-template', mechanics_profile_ref: 'mechanics', owner_controller_ref: 'owner', property_ref: 'property', site_function_ref: 'site', economic_context_ref: 'economy', context_bound_permission_refs: [], ordinary_policy: { schema: 'rus.items.existing_container_ordinary_policy.v2', version: 2, unresolved_ordinary_contents: true, technical_limits: { schema: 'rus.items.existing_container_ordinary_limits.v1', version: 1, max_new_entities: 4 } }, authoritative_status: 'absent', ...overrides }; }
function child(id = 'ordinary') { return { item_id: id, semantic_type: 'material_portion', authority: 'ordinary', disclosure: 'concealed', admission_class: 'common_mundane', is_container: false, evidence: false, authentic_document: false, hidden_history: false, secret_cache: false, placement: { container_id: 'chest' } }; }
function setup(resolver, ctx = context(), extra = []) { const chest = { item_id: 'chest', template_id: 'chest-template', mechanics_profile_ref: 'mechanics', commit_state: 'committed', visible: true, open_state: 'closed', contents_state: 'contents_hidden', placement: { location_ref: 'shore' }, ordinary_contents_context: ctx }; const items = [chest, ...extra]; const ports = createLowerDvinaTraceTurnStepRuntimePorts({ committedState: { actor_id: 'actor', items }, ordinaryContainerContentsResolver: resolver, workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority() }); return { ports, projection: { actor_id: 'actor', position: { location_ref: 'shore' }, items: [chest], inventory: { items: [], total_weight: { grams: 0 }, load_category: 'light', occupied_hands: 0 }, knowledge: [] } }; }
async function open(fixture) { return fixture.ports.executionRegistry.domain(op)({ plan: {}, request: { root_turn_id: 'turn', step_index: 1, actor: { actor_id: 'actor' } }, operation: op, working_projection: fixture.projection, check_result: null }); }
const good = (items) => ({ pass: true, materialized_items: items,
  ordinary_materialization_atomic_write_plan: {
    schema: 'ordinary_container_contents_atomic_write_plan_v2',
    write_plan_digest: 'sealed-test-plan',
    scope_ref: { entity_kind: 'container', entity_id: 'chest' },
    items: items.map(({ item_id }) => runtimeItem(item_id))
  }, errors: [] });
function runtimeItem(item_id) { return { item_id,
  runtime_mechanics_snapshot:{ schema:
    'rus.items.runtime_instance_mechanics_snapshot.v1', version:1,
  provenance:{ source_kind:'ordinary_world_materialization',
    root_turn_id:'turn', step_index:1,
    operation_ref:'request_container_access:chest',
    origin_kind:'existing_container_ordinary', source_refs:['basis:stored'] },
  mechanics:{ mass_grams:80, external_hand_cost:0, carry_form:'compact',
    packing_slot_cost:1, quantity:{ value:1, unit:'item' },
    container:null } } }; }

test('mismatch, throw, duplicate, collision and invalid second child do not reveal or leak a batch', async () => {
  for (const [ctx, result, code] of [
    [context({ template_id: 'other' }), good([child()]), 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID'],
    [context(), good([child('a'), { ...child('b'), evidence: true }]), 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_INVALID'],
    [context(), good([child('a'), child('a')]), 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_COLLISION'],
    [context(), good([child('chest')]), 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_COLLISION']
  ]) { const f = setup(async () => result, ctx); await assert.rejects(() => open(f), { code }); assert.equal(f.projection.items.length, 1); }
  const f = setup(async () => { throw new Error('x'); }); await assert.rejects(() => open(f), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_FAILED' }); assert.equal(f.projection.items.length, 1);
});

test('hostile result/child descriptors read no getters and authoritative path calls no resolver', async () => {
  let reads = 0, calls = 0; const bad = good([child()]); Object.defineProperty(bad, 'errors', { enumerable: true, get() { reads++; return []; } });
  await assert.rejects(() => open(setup(async () => bad)), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID' }); assert.equal(reads, 0);
  const c = child(); Object.defineProperty(c.placement, 'container_id', { enumerable: true, get() { reads++; return 'chest'; } });
  await assert.rejects(() => open(setup(async () => good([c]))), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID' }); assert.equal(reads, 0);
  const f = setup(async () => { calls++; return good([child()]); }, context({ authoritative_status: 'present', ordinary_policy: null })); await open(f); assert.equal(calls, 0);
});

test('valid concealed child is absent before access and visible only after access apply', async () => {
  const f = setup(async () => good([child()])); assert.equal(f.projection.items.some(({ item_id }) => item_id === 'ordinary'), false);
  const result = await open(f); assert.equal(result.working_projection.items.some(({ item_id }) => item_id === 'ordinary'), true);
  assert.equal(result.write_fragments.length, 0);
  assert.equal(result.ordinary_materialization_atomic_write_plan.schema,
    'ordinary_container_contents_atomic_write_plan_v2');
});

test('failed partial batch leaks no item and a retry on the same ports materializes only retry child', async () => {
  let attempt = 0; const f = setup(async () => ++attempt === 1
    ? good([child('leak'), { ...child('bad'), evidence: true }]) : good([child('retry')]));
  await assert.rejects(() => open(f), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_INVALID' });
  assert.equal(f.projection.items.some(({ item_id }) => item_id === 'leak'), false);
  const result = await open({ ...f, projection: { ...f.projection, items: [{ ...f.projection.items[0], open_state: 'closed', contents_state: 'contents_hidden' }] } });
  assert.equal(result.working_projection.items.some(({ item_id }) => item_id === 'leak'), false);
  assert.equal(result.working_projection.items.some(({ item_id }) => item_id === 'retry'), true);
});

test('ordinary child is still concealed at state insertion and only access apply reveals it', async () => {
  const chest = { item_id: 'chest', template_id: 'chest-template', mechanics_profile_ref: 'mechanics', commit_state: 'committed', visible: true, open_state: 'closed', contents_state: 'contents_hidden', placement: { location_ref: 'shore' }, ordinary_contents_context: context() };
  const state = initializeRuntimeState({ actor_id: 'actor', items: [chest] }); let inserted = null;
  const original = state.materializedItems.set.bind(state.materializedItems); state.materializedItems.set = (id, value) => { if (id === 'ordinary') inserted = structuredClone(value); return original(id, value); };
  const handler = createContainerAccessHandler(state, { ordinaryContainerContentsResolver: async () => good([child()]) });
  const result = await handler({ plan: {}, request: { root_turn_id: 'turn', step_index: 1, actor: { actor_id: 'actor' } }, operation: op, check_result: null, working_projection: { actor_id: 'actor', position: { location_ref: 'shore' }, items: [chest], inventory: { items: [], total_weight: { grams: 0 }, load_category: 'light', occupied_hands: 0 }, knowledge: [] } });
  assert.equal(inserted.disclosure, 'concealed'); assert.equal('disclosure_state' in inserted, false);
  assert.equal(result.working_projection.items.some(({ item_id }) => item_id === 'ordinary'), true);
});

test('resolver boundary rejects prototype, alias, cycle and extra envelope shapes', async () => {
  const alias = child('alias'); const cycle = good([child('cycle')]); cycle.self = cycle;
  const proto = Object.create({ inherited: true }); Object.assign(proto, good([child('proto')]));
  for (const value of [proto, cycle, { ...good([child('extra')]), extra: true }, good([alias, alias])]) {
    await assert.rejects(() => open(setup(async () => value)), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID' });
  }
});
