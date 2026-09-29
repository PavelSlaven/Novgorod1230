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
