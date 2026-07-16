import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeApprovedItems } from '../../packages/materialization/src/stage-helpers.js';
import { runStage16ItemPlacementBlock } from '@rus/new-game/stages/stage-16/compat';
import { makeStage16Audit, makeStage16Draft, makeStage16Input } from '../fixtures/stage13-16-fixtures.mjs';

function requirement(overrides = {}) {
  return { quantity_requirement_id: 'quantity-1', status: 'approved', world_revision_id: 'revision-1', item_template_id: 'item-template-1', minimum_quantity: 1, maximum_quantity: 2, quantity_unit_id: 'piece', quantity_dimension: 'count', mass_grams_per_unit: 100, default_quantity_policy: { mode: 'explicit_only' }, ...overrides };
}

function candidate(overrides = {}) {
  return { item_profile_candidate_id: 'item-1', item_profile_id: 'profile-1', item_template_id: 'item-template-1', item_category_id: 'tool', status: 'approved', required: true, slot_rule_id: 'slot-1', quantity: 1, quantity_requirement_id: 'quantity-1', quantity_unit_id: 'piece', condition_state: 'intact', legal_status: 'unowned', causal_basis: { causal_basis_type: 'place_function', causal_basis_id: 'rule-1' }, placement: { g5_anchor_id: 'anchor-1', parent_g4_node_id: 'g4' }, physical_state: { condition: 'intact', mass_grams_per_unit: 100, external_hand_cost: 0 }, property_state: { owner_model: 'none', holder_model: 'place', controller_model: 'none' }, visibility_state: {}, access_state: {}, risk_state: {}, source_trace: [{ source_id: 'item-1' }], ...overrides };
}

function context({ quantity = requirement(), equipment = [], candidateOverrides = {} } = {}) {
  return { input: { item_profile_candidate_set: { world_revision_id: 'revision-1' } }, partyId: 'party-1', runId: 'run-1', anchors: new Map([['anchor-1', { anchor_id: 'anchor-1', supports: { can_hold_item: true } }]]), kind: 'item', quantityRequirements: new Map([[quantity.quantity_requirement_id, quantity]]), equipmentCandidates: new Map(equipment.map((record) => [record.equipment_candidate_id, record])), candidateOverrides };
}

function materialize(options = {}) {
  const value = candidate(options.candidateOverrides);
  const state = context(options);
  return materializeApprovedItems([value], state);
}

test('Stage 16 approved catalog rejects an unapproved or foreign quantity requirement', () => {
  for (const quantity of [requirement({ status: 'draft' }), requirement({ world_revision_id: 'other-revision' })]) {
    assert.throws(() => materialize({ quantity }), (error) => error.code === 'QUANTITY_REQUIREMENT_NOT_APPROVED');
  }
});

test('Stage 16 approved catalog rejects a quantity requirement for another template', () => {
  assert.throws(() => materialize({ quantity: requirement({ item_template_id: 'other-template' }) }), (error) => error.code === 'QUANTITY_REQUIREMENT_TEMPLATE_MISMATCH');
});

test('Stage 16 approved catalog rejects quantity outside bounds, unit mismatch, mass/hand mismatch and incomplete ownership', () => {
  const cases = [
    [{ quantity: 3 }, 'QUANTITY_OUTSIDE_APPROVED_RANGE'],
    [{ quantity_unit_id: 'gram' }, 'QUANTITY_UNIT_MISMATCH'],
    [{ physical_state: { condition: 'intact', mass_grams_per_unit: 99, external_hand_cost: 0 } }, 'PHYSICAL_PROFILE_MISMATCH'],
    [{ physical_state: { condition: 'intact', mass_grams_per_unit: 100 } }, 'PHYSICAL_PROFILE_MISMATCH'],
    [{ property_state: { owner_model: 'none', holder_model: 'place' } }, 'PROPERTY_RELATION_INCOMPLETE']
  ];
  for (const [candidateOverrides, code] of cases) assert.throws(() => materialize({ candidateOverrides }), (error) => error.code === code);
});

test('Stage 16 approved catalog rejects an unapproved or foreign-revision equipment candidate', () => {
  for (const equipment of [[{ equipment_candidate_id: 'equipment-1', status: 'draft', world_revision_id: 'revision-1' }], [{ equipment_candidate_id: 'equipment-1', status: 'approved', world_revision_id: 'other-revision' }]]) {
    assert.throws(() => materialize({ candidateOverrides: { equipment_candidate_id: 'equipment-1' }, equipment }), (error) => error.code === 'EQUIPMENT_CANDIDATE_NOT_APPROVED');
  }
});

test('Stage 16 approved catalog accepts mutually pinned quantity, equipment and item records', () => {
  const output = materialize({ candidateOverrides: { equipment_candidate_id: 'equipment-1' }, equipment: [{ equipment_candidate_id: 'equipment-1', status: 'approved', world_revision_id: 'revision-1' }] });
  assert.equal(output[0].quantity_unit_id, 'piece');
  assert.equal(output[0].total_mass_grams, 100);
});

test('Stage 16 input gate rejects missing approved catalog blocks before a custom materializer can bypass them', async () => {
  const input = makeStage16Input();
  delete input.item_profile_candidate_set.quantity_requirements;
  delete input.item_profile_candidate_set.equipment_candidates;
  await assert.rejects(
    () => runStage16ItemPlacementBlock({ input, materialize: async () => makeStage16Draft(), audit: async () => makeStage16Audit() }),
    (error) => error.lifecycle?.concerns?.some((concern) => concern.code === 'ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING')
  );
});
