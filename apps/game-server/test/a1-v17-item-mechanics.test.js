import assert from 'node:assert/strict';
import test from 'node:test';
import { committedMechanics } from '../src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js';

// item-container-120-v5 inventory profiles (v17 start clothing) carry only mass, hands and carry form.
const shirt = { template_id: 'item_tpl_nov_linen_shirt_v1', state: { display_name: 'нижняя рубаха',
  inventory_profile_snapshot: { status: 'approved', carry_form: 'regular', mass_grams: 600,
    item_template_ref: 'item_tpl_nov_linen_shirt_v1', external_hand_cost: 0,
    inventory_profile_id: 'inventory_item_tpl_nov_linen_shirt_v1' } } };

test('A1 accepts a v5 inventory profile without packing, quantity or container fields', () => {
  assert.deepEqual(committedMechanics(shirt), { mass_grams: 600, external_hand_cost: 0,
    carry_form: 'regular', packing_slot_cost: 0, quantity: null, container: null });
});

test('A1 still refuses a container profile and a broken profile', () => {
  const container = structuredClone(shirt);
  container.state.inventory_profile_snapshot.container = { capacity: 3 };
  assert.throws(() => committedMechanics(container), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
  const broken = structuredClone(shirt);
  broken.state.inventory_profile_snapshot.mass_grams = -1;
  assert.throws(() => committedMechanics(broken), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
});

test('the persistence-side conservation check reads the same v5 profile the same way', async () => {
  const { committedMechanics: conserved } = await import(
    '../src/infrastructure/postgres/action-produced-mass-conservation.js');
  assert.deepEqual(conserved({ ...shirt, template_id: shirt.template_id }),
    committedMechanics(shirt));
});

test('the A1 plan-profile check admits the v17 target profile pins, not arbitrary ones', async () => {
  const { validLowerDvinaTraceActionProductionPlanProfile: valid } = await import(
    '../src/internal/lower-dvina-trace-a1-bundle.js');
  const plan = (context_ref, profile_ref, policy_ref) => ({ transition_proposal: {
    context_pin: { context_ref, profile_ref, profile_version: '1' },
    technical_policy_pin: { policy_ref, version: 1, max_new_entities: 4 },
    identity_mode: 'independent_outputs', origin: 'direct_partition',
    result_class: 'partial_transformation', qualitative_result: { output_class: 'ordinary_mundane' } } });
  assert.equal(valid(plan('lower_dvina_trace:a1:personal_tool_transform',
    'lower_dvina_trace_a1_open_physical_action_profile_v1',
    'lower_dvina_trace:a1:personal_tool_policy_v1')), true);
  assert.equal(valid(plan('novgorod_target:a1:committed_accessible_sources',
    'novgorod_target_open_physical_action_profile_v1',
    'novgorod_target:a1:ordinary_physical_action_v1')), true);
  assert.equal(valid(plan('novgorod_target:a1:committed_accessible_sources',
    'lower_dvina_trace_a1_open_physical_action_profile_v1',
    'novgorod_target:a1:ordinary_physical_action_v1')), false);
  assert.equal(valid(plan('other', 'other', 'other')), false);
});
