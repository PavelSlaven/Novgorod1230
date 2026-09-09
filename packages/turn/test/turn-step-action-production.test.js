import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '../src/turn-step-contracts.js';
import { plan, request } from './turn-step-contracts-fixture.js';

test('sole turn plan boundary admits qualitative action production', () => {
  const source = request();
  source.player_safe_state.visible_objects = [
    { entity_ref: { entity_kind: 'item', entity_id: 'item:pole' } },
    { entity_ref: { entity_kind: 'item', entity_id: 'item:knife' } },
    { entity_ref: { entity_kind: 'item', entity_id: 'item:stone' } }
  ];
  const action = plan({
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{
      op: 'request_item_use', actor_ref: 'actor_mikula',
      item_ref: 'item:pole', use_kind: 'other',
      target_refs: ['item:knife', 'item:stone'],
      action_production: {
        source_refs: ['item:pole'],
        tool_refs: ['item:knife', 'item:stone'], requested_output_count: null,
        identity_mode: 'preserve_source', origin: null,
        result_class: 'partial_transformation', material_extent: null,
        result_descriptor: {
          display_name: 'заострённая жердь',
          physical_description: 'конец жерди физически заострён',
          qualitative_facts: ['на конце видны свежие срезы'],
          removed_physical_fact_refs: [], inscription_text: null,
          physical_form: 'long', source_fact_delta: null
        },
        output_class: 'weapon_capable'
      }
    }],
    continuation: null
  });
  assert.deepEqual(validateTurnStepPlan(action, { request: source }), {
    ok: true, errors: []
  });
  const preparedAction = structuredClone(action);
  preparedAction.operations.unshift({ op: 'move_entity',
    entity_ref: 'item:pole', placement: {
      relation: 'held_by', target_ref: 'actor_mikula' } });
  const preparedValidation = validateTurnStepPlan(preparedAction,
    { request: source });
  assert.equal(preparedValidation.ok, false);
  assert.equal(preparedValidation.errors.some(({ message }) =>
    message.includes('does not support direct preparation')), true);

  const unrelated = plan({
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' }
  });
  assert.equal(validateTurnStepPlan(unrelated, { request: source }).ok, false);

  source.player_safe_state.items = [{ item_id: 'item:pole',
    physical_fact_records: [{ fact_ref: 'fact:sharp',
      text: 'конец заострён' }] }];
  action.operations[0].action_production.result_descriptor
    .removed_physical_fact_refs = ['fact:sharp'];
  assert.equal(validateTurnStepPlan(action, { request: source }).ok, true);
  action.operations[0].action_production.result_descriptor
    .removed_physical_fact_refs = ['fact:unknown'];
  assert.equal(validateTurnStepPlan(action, { request: source }).ok, false);
  action.operations[0].action_production.result_descriptor
    .removed_physical_fact_refs = [];

  action.operations[0].action_production.result_descriptor.physical_form =
    'forged_form';
  assert.equal(validateTurnStepPlan(action, { request: source }).ok, false);

  const partition = structuredClone(action);
  partition.operations[0].action_production.result_descriptor.physical_form =
    'compact';
  partition.operations[0].action_production = {
    ...partition.operations[0].action_production,
    source_refs: ['item:pole'], tool_refs: ['item:knife', 'item:stone'],
    requested_output_count: 2, identity_mode: 'independent_outputs',
    origin: 'crafted', material_extent: 'minor'
  };
  partition.operations[0].action_production.result_descriptor
    .source_fact_delta = {
      physical_description: 'с жерди снята часть материала',
      qualitative_facts: [], removed_physical_fact_refs: [],
      physical_form: 'regular'
    };
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, true);
  const multiPartial = structuredClone(partition);
  multiPartial.operations[0].action_production.source_refs = [
    'item:pole', 'item:stone'
  ];
  multiPartial.operations[0].action_production.tool_refs = ['item:knife'];
  assert.equal(validateTurnStepPlan(multiPartial, { request: source }).ok,
    false);
  partition.operations[0].action_production.result_descriptor.display_name =
    null;
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, false);
  partition.operations[0].action_production.result_descriptor.display_name =
    'деревянный клин';
  partition.operations[0].action_production.result_descriptor
    .physical_description = null;
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, true);
  partition.operations[0].action_production.tool_refs = ['item:stone'];
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, false);
});
