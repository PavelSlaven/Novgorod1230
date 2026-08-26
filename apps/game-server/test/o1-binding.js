import assert from 'node:assert/strict';
import { phase7OwnerOutputPlans } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-owner-output.js';
import { createOrdinaryMaterializationAtomicWritePlan } from
  '../src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';

export default function bindO1(plan) {
  assert.equal(plan.semantic_target_ref, 'source-b');
  const operation = { op: 'request_discovery', actor_ref: 'npc-1',
    discovery_kind: 'inspect', target_refs: ['source-b'],
    query: 'взять вторую порцию' };
  const input = (ordinaryPlan) => ({ ownerOutputs: {
    write_fragments: [], consequence_fragment: null,
    ordinary_materialization_atomic_write_plan: ordinaryPlan,
    action_production_atomic_write_plans: [], local_fire_atomic_write_plans: [],
    spatial_semantic_atomic_write_plan: null
  }, partyId: 'party', changeSetId: 'change:party:1', npcRef: 'npc-1',
  temporalPlans: [], rootTurnId: 'turn:party:1', committedStateVersion: 1,
  semanticOperations: [operation], semanticPlan: { operations: [operation] },
  semanticRequest: { request_id: 'decision-1', root_turn_id: 'turn:party:1',
    decision_index: 1, npc_ref: 'npc-1' }, registeredOwner: '@rus/turn',
  fail(code) { throw Object.assign(new Error(code), { code }); } });
  assert.doesNotThrow(() => phase7OwnerOutputPlans(input(plan)));
  const { schema: _, write_plan_digest: __, ...raw } = structuredClone(plan);
  const substituted = createOrdinaryMaterializationAtomicWritePlan({
    ...raw, semantic_target_ref: 'source-a' });
  assert.throws(() => phase7OwnerOutputPlans(input(substituted)),
    { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
}
