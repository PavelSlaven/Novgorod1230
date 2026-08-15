import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeApprovedItems } from '../../packages/materialization/src/stage-helpers.js';
import { materializeItemPlacement } from '@rus/materialization';
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

test('Stage 16 preserves fractional grams-per-unit for approved volume quantities', () => {
  const quantity = requirement({ minimum_quantity: 100, maximum_quantity: 5000, quantity_unit_id: 'millilitre', quantity_dimension: 'volume', mass_grams_per_unit: 1.4 });
  const output = materialize({ quantity, candidateOverrides: { quantity: 100, quantity_unit_id: 'millilitre', physical_state: { condition: 'intact', mass_grams_per_unit: 1.4, external_hand_cost: 0 } } });
  assert.equal(output[0].total_mass_grams, 140);
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

test('Stage 16 resolves approved equipment candidates to NPC and player actor holders', () => {
  const npc = materializeItemPlacement(equipmentPlacementInput({
    target_npc_candidate_ids: ['npc-candidate-1']
  })).item_instances[0];
  assert.equal(npc.placement.holder_npc_instance_id, 'npc-instance-1');
  assert.equal(npc.property_state.owner_model, 'npc');
  assert.equal(npc.property_state.controller_id, 'npc-instance-1');

  const player = materializeItemPlacement(equipmentPlacementInput({
    target_player_character: true,
    target_npc_candidate_ids: []
  })).item_instances[0];
  assert.equal(player.placement.holder_player_character_id, 'player-1');
  assert.equal(player.property_state.owner_model, 'player');
  assert.equal(player.property_state.controller_id, 'player-1');
});

test('Stage 16 hard-blocks an approved equipment candidate whose NPC target was not materialized', () => {
  const input = equipmentPlacementInput({
    target_npc_candidate_ids: ['missing-npc-candidate']
  });
  assert.throws(() => materializeItemPlacement(input), (error) =>
    error.code === 'EQUIPMENT_TARGET_ACTOR_UNRESOLVED');
});

function equipmentPlacementInput(target) {
  const item = candidate({
    required: false,
    placement: undefined,
    property_state: {
      owner_model: 'pending_actor_binding',
      holder_model: 'pending_actor_binding',
      controller_model: 'pending_actor_binding',
      legal_or_social_status: 'established'
    },
    visual_profile_snapshot: {
      schema: 'item_visual_profile_snapshot_v1', version: 1,
      equipment_slot: 'outer_garment', garment_kind: 'outer_garment'
    }
  });
  const equipment = {
    equipment_candidate_id: 'equipment-1',
    item_profile_candidate_id: item.item_profile_candidate_id,
    item_template_id: item.item_template_id,
    equipment_slot_category_id: 'outer_garment',
    status: 'approved', required: true, world_revision_id: 'revision-1',
    ...target
  };
  return {
    request_id: 'stage16-equipment-test',
    selected_start_node: { selected_node_chain: { g4_node_id: 'g4' } },
    player_character: { character_id: 'player-1' },
    g5_scene_graph: {
      item_materialization_slots: [],
      materialization_run: {
        run_id: 'run-1',
        seed_context: { party_id: 'party-1', g4_id: 'g4', world_revision_id: 'revision-1' }
      }
    },
    initial_npc_placement: {
      npc_candidate_instance_map: [{
        npc_candidate_id: 'npc-candidate-1', npc_instance_id: 'npc-instance-1'
      }]
    },
    item_profile_candidate_set: {
      world_revision_id: 'revision-1', catalog_digest: 'a'.repeat(64),
      item_profile_candidates: [item], container_profile_candidates: [],
      property_rule_candidates: [], quantity_requirements: [requirement()],
      equipment_candidates: [equipment], empty_allowed: false
    },
    eligible_item_profile_candidates: [item],
    eligible_container_profile_candidates: [],
    eligible_property_rule_candidates: [],
    eligible_g5_item_anchors: [], eligible_g5_container_anchors: []
  };
}
