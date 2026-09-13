import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { applyOrdinaryMaterializationProjection } from
  '../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';

test('projects a committed ordinary item without its materialization internals', () => {
  const committedState = {
    party_id: 'party', actor_id: 'mikula', player_profile: {},
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor',
      position_id: 'shed-position' },
    items: [], visible_context: { visible_objects: [] },
    ordinary_materialization: { remaining_identity_budget: 0,
      background_groups: ['group-private'], supporting_basis_catalog: ['basis-private'],
      negative_presence_record: 'negative-presence' }
  };
  const ordinaryPlan = { party_id: 'party', item: { item_id: 'ordinary-spoon',
    property_basis_ref: 'basis-private', supporting_basis_ref: 'basis-private',
    runtime_placement: { scene_position_id: 'shed-position' },
    item_proposal: { scope_ref: { entity_kind: 'g6', entity_id: 'shed' },
      semantic_descriptor: { semantic_type: 'household_tool', name: 'wooden spoon' },
      placement: { scope_ref: 'shed', position_ref: 'bench' },
      property_placement_evidence: { permission_ref: 'permission-private',
        property_basis_class: 'occupied_site_default',
        property_source_ref: 'basis-private' } },
    mechanics_snapshot: {
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
      provenance: { source_kind: 'ordinary_world_materialization',
        causal_ref: 'cause', request_id: 'request', candidate_key: 'candidate',
        coverage_key: 'coverage', context_version: 'context',
        policy_ref: 'policy', source_refs: ['basis-private'] },
      mechanics: { mass_grams: 80, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 5, unit: 'item' }, container: null }
    } } };
  committedState.visible_context = applyOrdinaryMaterializationProjection({
    next: committedState, visibleContext: committedState.visible_context, ordinaryPlan
  });

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState, actor_id: 'mikula' });
  assert.deepEqual(result.player_safe_state.items, [{
    item_id: 'ordinary-spoon', name: 'wooden spoon',
    quantity: 5, quantity_unit_id: 'item',
    condition_state: 'ordinary_runtime_instance',
    legal_status: 'ordinary_world_property_bound',
    placement: { scene_position_id: 'shed-position' },
    state: { semantic_category: 'household_tool' }
  }]);
  const playerSafe = JSON.stringify(result.player_safe_state);
  for (const privateValue of ['remaining_identity_budget', 'background_groups',
    'basis-private', 'permission-private', 'negative-presence']) {
    assert.equal(playerSafe.includes(privateValue), false);
  }
});
