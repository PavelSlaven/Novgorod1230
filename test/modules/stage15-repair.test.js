import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage15NpcPlacementBlock } from '@rus/new-game/stages/stage-15/compat';
import { makeStage15Input, makeStage15Draft, makeStage15Audit } from '../fixtures/stage13-16-fixtures.mjs';
import { applyStage15NpcSemanticRemainder } from '../../packages/new-game/src/stages/stage-15-npc-placement/orchestration/semantic-remainder.js';

test('Stage 15 hard-blocks malformed code materialization without LLM draft repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage15NpcPlacementBlock({ input: makeStage15Input(), materialize: async () => ({}), formatRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, semanticRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, audit: async () => makeStage15Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});

test('Stage 15 hard-blocks forbidden instance content without semantic repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage15NpcPlacementBlock({ input: makeStage15Input(), materialize: async () => makeStage15Draft({ items: { id: 'forbidden' } }), semanticRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, audit: async () => makeStage15Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});

test('N1 fills exact declared ordinary gaps for every materialized NPC', async () => {
  const input = makeStage15Input();
  const candidate = (id, fields) => ({
    npc_candidate_id: id, profile_level: 'background', social_role_id: 'role',
    occupation_id: 'occupation', npc_archetype_id: 'archetype',
    place_template_ids: ['place-template-1'], allowed_seasons: ['spring'],
    allowed_time_of_day: ['day'], ordinary_semantic_remainder_fields: fields
  });
  input.npc_candidate_set.npc_candidates = [
    candidate('candidate-1', ['display_name']),
    candidate('candidate-2', ['visible_descriptor'])
  ];
  const npc = (id, candidateId) => ({
    npc_instance_id: id, npc_candidate_id: candidateId, profile_level: 'background',
    base_refs: { social_role_id: 'role', occupation_id: 'occupation', npc_archetype_id: 'archetype', key_npc_seed_id: null },
    placement: { g5_anchor_id: 'a1', g5_minilocation_id: 'mini-1', parent_g4_node_id: 'g4', presence_reason: 'approved presence' },
    identity: { name_status: 'visible_label', identity_known_to_player: false },
    visibility_state: { visible_to_player: false, hidden_from_player: false },
    interaction_state: {}, machine_state: {}, knowledge_scope: {}, source_trace: [{ source_id: candidateId }]
  });
  const draft = makeStage15Draft({
    placement_status: 'placed', empty_scene_reason: undefined,
    npc_instances: [npc('npc-1', 'candidate-1'), npc('npc-2', 'candidate-2')],
    npc_anchor_bindings: [{ npc_instance_id: 'npc-1', g5_anchor_id: 'a1' }, { npc_instance_id: 'npc-2', g5_anchor_id: 'a1' }],
    npc_visibility_state: [{ npc_instance_id: 'npc-1' }, { npc_instance_id: 'npc-2' }],
    npc_attention_and_witness_state: [{ npc_instance_id: 'npc-1' }, { npc_instance_id: 'npc-2' }],
    npc_schedule_state: []
  });
  let request;
  const result = await runStage15NpcPlacementBlock({
    input, materialize: async () => draft,
    semanticRemainder: async (value) => {
      request = value;
      return { version: 1, schema: 'stage15_npc_semantic_remainder_plan_v1', request_id: input.request_id, npc_remainders: [
        { npc_instance_id: 'npc-1', fields: { display_name: 'лодочник' } },
        { npc_instance_id: 'npc-2', fields: { visible_descriptor: 'мужчина у пешни' } }
      ] };
    },
    audit: async () => makeStage15Audit()
  });
  assert.deepEqual(request.npc_remainders.map(({ npc_instance_id, allowed_fields }) => [npc_instance_id, allowed_fields]), [
    ['npc-1', ['display_name']], ['npc-2', ['visible_descriptor']]
  ]);
  assert.deepEqual(result.draft.npc_instances.map((value) => value.ordinary_semantic), [
    { display_name: 'лодочник' }, { visible_descriptor: 'мужчина у пешни' }
  ]);
});

test('N1 rejects extra or non-plain semantic fields', () => {
  const request = { npc_remainders: [{ npc_instance_id: 'npc-1', allowed_fields: ['display_name'] }] };
  const draft = { npc_instances: [{ npc_instance_id: 'npc-1' }] };
  assert.throws(() => applyStage15NpcSemanticRemainder(draft, {
    version: 1, schema: 'stage15_npc_semantic_remainder_plan_v1', request_id: 'req',
    npc_remainders: [{ npc_instance_id: 'npc-1', fields: { display_name: 'лодочник', social_role: 'лишнее' } }]
  }, { ...request, request_id: 'req' }), (error) => error.code === 'NPC_SEMANTIC_REMAINDER_PLAN_INVALID');
  const fields = {};
  Object.defineProperty(fields, 'display_name', { enumerable: true, get: () => 'лодочник' });
  assert.throws(() => applyStage15NpcSemanticRemainder(draft, {
    version: 1, schema: 'stage15_npc_semantic_remainder_plan_v1', request_id: 'req',
    npc_remainders: [{ npc_instance_id: 'npc-1', fields }]
  }, { ...request, request_id: 'req' }), (error) => error.code === 'NPC_SEMANTIC_REMAINDER_PLAN_INVALID');
});

test('N1 does not call resolver when materializer has no declared gap', async () => {
  let calls = 0;
  await runStage15NpcPlacementBlock({
    input: makeStage15Input(), materialize: async () => makeStage15Draft(),
    semanticRemainder: async () => { calls += 1; return {}; }, audit: async () => makeStage15Audit()
  });
  assert.equal(calls, 0);
});
