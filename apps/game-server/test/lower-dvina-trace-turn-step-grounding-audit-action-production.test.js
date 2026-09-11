import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { assembleTurnStepPlan } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';

for (const [material, tool, intent, physicalDescription] of [
  ['branch', 'knife', 'Ножом надрезаю ветку. Затем разжигаю огонь.',
    'На ветке сделаны надрезы.'],
  ['cloth', 'needle', 'Иглой прокалываю лоскут. Затем разжигаю огонь.',
    'На лоскуте сделаны проколы.']
]) test(`grounding auditor accepts canonical ${material} carrier and ${tool} tool before independent fire continuation`, async () => {
  const rawOperation = { op: 'request_item_use', actor_ref: 'actor:1', item_ref: tool,
    use_kind: 'other', target_refs: [material], action_production: {
      source_refs: [material], tool_refs: [tool], identity_mode: 'preserve_source',
      result_descriptor: { physical_description: physicalDescription }
    } };
  const continuation = { remaining_intent: 'Затем разжигаю огонь.', depends_on_refs: [] };
  const actionRequest = { request_id: `blind-trace:${material}-${tool}`,
    root_player_action: intent, remaining_intent: intent,
    committed_state_version: 1, working_revision: 0, step_index: 1,
    actor: { actor_ref: 'actor:1' }, player_safe_state: { actor_id: 'actor:1',
      position: { position_id: 'shore' }, items: [
        { item_id: tool, name: tool === 'knife' ? 'нож' : 'игла' },
        { item_id: material, name: material === 'branch' ? 'ветка' : 'лоскут' }
      ] } };
  const rawPlan = { operations: [rawOperation], continuation };
  const canonicalPlan = assembleTurnStepPlan(rawPlan, actionRequest);
  const operation = { ...rawOperation, item_ref: material, target_refs: [tool] };
  assert.equal(rawPlan.operations[0].item_ref, tool);
  assert.deepEqual(rawPlan.operations[0].target_refs, [material]);
  assert.deepEqual(canonicalPlan.operations, [operation]);
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      assert.equal(call.role_id, 'turn_step_grounding_auditor');
      assert.match(call.messages[0].content,
        /semantic roles come only from action_production[\s\S]*source_refs are changed materials[\s\S]*tool_refs are unchanged implements/u);
      assert.match(call.messages[0].content,
        /carrier fields are code-normalized: item_ref equals the first source_ref[\s\S]*target_refs equal the remaining source_refs followed by tool_refs/u);
      const payload = JSON.parse(call.messages[1].content);
      assert.deepEqual(payload.operations, [{ path: '$.operations.0', operation }]);
      assert.deepEqual(payload.continuation, continuation);
      assert.deepEqual(payload.player_safe_state.items.map(({ item_id, name }) => ({ item_id, name })), [
        { item_id: tool, name: tool === 'knife' ? 'нож' : 'игла' },
        { item_id: material, name: material === 'branch' ? 'ветка' : 'лоскут' }
      ]);
      return { output: { pass: true, concerns: [] } };
    } }
  });
  assert.equal(await validate({ request: actionRequest, plan: canonicalPlan }), true);
});
