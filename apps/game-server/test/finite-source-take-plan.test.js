import test from 'node:test';
import assert from 'node:assert/strict';
import { bindOrdinaryMaterializationPlan } from '../src/runtime/ordinary-materialization-llm.js';
import { presenceRequest } from './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';

const output = { resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
  semantic_admission_class: 'common_mundane', world_knowledge_claim_refs: [],
  world_knowledge_constraint_refs: [], world_knowledge_constraint_verdict: 'clear',
  reason_code: 'materialize', entities: [{ semantic_type: 'deadwood_material_portion',
    name: 'валежник', presence_expectation: 'routine', mechanics_proposal: {
      mass_grams: 50, external_hand_cost: 1, carry_form: 'regular', packing_slot_cost: 0,
      quantity: { value: 1, unit: 'item' }, container: null } }] };

test('Stage B plan for a finite-source candidate carries a finite_source causal basis', () => {
  const base = presenceRequest('валежник');
  const finite = structuredClone(base);
  finite.authority_envelope.candidate.coverage_kind = 'finite_source';
  const plan = bindOrdinaryMaterializationPlan(finite, output);
  assert.equal(plan.entities[0].causal_basis.basis_kind, 'finite_source');
  assert.deepEqual(plan.entities[0].causal_basis.basis_refs,
    [finite.authority_envelope.selected_supporting_basis_ref]);
  const ordinary = bindOrdinaryMaterializationPlan(base, output);
  assert.equal(ordinary.entities[0].causal_basis.basis_kind, 'ordinary_presence');
});

test('physical keys of an ordinary plan lock the finite resource node it decrements', async () => {
  const { ordinaryPhysicalKeys } = await import(
    '../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js');
  const plan = { schema: 'ordinary_materialization_atomic_write_plan_v1', party_id: 'party-1',
    scope_ref: { entity_kind: 'g6', entity_id: 'g6-1' }, request_identity: 'req-1',
    item: { item_id: 'ordinary_item_1' },
    finite_resource_transition: { source_resource_node_id: 'm2c_finite_deadwood_v1:abc' } };
  assert.ok(ordinaryPhysicalKeys(plan).includes(
    'party_runtime.party_resource_nodes:party-1:m2c_finite_deadwood_v1:abc'));
  assert.equal(ordinaryPhysicalKeys({ ...plan, finite_resource_transition: null })
    .some((key) => key.includes('party_resource_nodes')), false);
});

test('spatial v3 position (site_id, no g5_anchor_id) still yields committed inventory load', async () => {
  const { createRuntimeInstanceMechanicsSnapshot } = await import('@rus/items-property');
  const { projectLowerDvinaTracePlayerSafeState } = await import(
    '../src/runtime/lower-dvina-trace-player-safe-state.js');
  const { richCommittedState } = await import('./lower-dvina-trace-player-safe-state-fixture.js');
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result', root_turn_id: 'turn:party:0',
      step_index: 1, operation_ref: 'op:create', origin_kind: 'ambient_ordinary',
      source_refs: ['site'] },
    mechanics: { mass_grams: 300, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null } });
  const state = richCommittedState();
  state.party_state = { state_version: 2 };
  state.position = { location_ref: 'shed', site_id: 'site-1', position_id: 'pos-1' };
  state.items = [{ item_id: 'runtime-wood', quantity: 1,
    runtime_instance_mechanics_snapshot: snapshot,
    placement: { holder_character_id: 'mikula', physical_position: 'hands' } }];
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: 'mikula' });
  assert.equal(projected.player_safe_state.inventory?.total_weight?.grams, 300);
  assert.equal(projected.player_safe_state.inventory?.occupied_hands, 1);
});
