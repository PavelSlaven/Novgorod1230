import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage19 from '@rus/new-game/stages/stage-19';
import { makeHiddenState, makeStage19Audit, makeStage19Input } from '../fixtures/stage17-19-fixtures.mjs';

test('Stage 19 hard-blocks malformed code state without LLM state repair', async () => {
  let repairCalls = 0;
  await assert.rejects(stage19.runStage19HiddenState({ input: makeStage19Input(), build: async () => ({ broken: true }), audit: async () => makeStage19Audit(), formatRepair: async () => { repairCalls += 1; return makeHiddenState(); } }), /failed validation/u);
  assert.equal(repairCalls, 0);
});

test('Stage 19 hard-blocks forbidden narrator text without semantic repair', async () => {
  let repairCalls = 0;
  const input = makeStage19Input();
  await assert.rejects(stage19.runStage19HiddenState({ input, build: async () => makeHiddenState(input, { narrator_text: 'Запрещённая проза.' }), audit: async () => makeStage19Audit(), semanticRepair: async () => { repairCalls += 1; return makeHiddenState(input); } }), /failed validation/u);
  assert.equal(repairCalls, 0);
});

test('Stage 19 code projection copies approved hidden projections from materialized instances', () => {
  const input = makeStage19Input((values) => {
    values.initial_npc_placement.npc_instances = [{
      npc_instance_id: 'npc-background-1', profile_level: 'background', source_trace: [{ source_id: 'npc-rule-1' }],
      hidden_state_projection: { forbidden_output_rules: [{ forbidden_rule_id: 'rule-1', forbidden_surface: 'player_facing', reason: 'approved_private_state' }] }
    }];
  });
  const output = stage19.buildHiddenStateFromApprovedInputs(input);
  assert.equal(output.hidden_state_status, 'formed');
  assert.equal(output.forbidden_output_rules[0].forbidden_rule_id, 'rule-1');
});

test('Stage 19 blocks scene NPC without approved hidden projection', () => {
  const input = makeStage19Input((values) => {
    values.initial_npc_placement.npc_instances = [{ npc_instance_id: 'npc-scene-1', profile_level: 'scene' }];
  });
  assert.throws(() => stage19.buildHiddenStateFromApprovedInputs(input), (error) => error.code === 'HIDDEN_STATE_PROJECTION_MISSING');
});

test('Stage 19 cannot mask an entity missing hidden projection with another entity projection', () => {
  const input = makeStage19Input((values) => {
    values.initial_npc_placement.npc_instances = [
      { npc_instance_id: 'npc-scene-covered', profile_level: 'scene', hidden_state_projection: { hidden_npc_state: [{ hidden_npc_state_id: 'hidden-npc-covered', npc_instance_id: 'npc-scene-covered', state: 'watching' }] } },
      { npc_instance_id: 'npc-scene-missing', profile_level: 'scene' }
    ];
  });
  assert.throws(() => stage19.buildHiddenStateFromApprovedInputs(input), (error) => error.code === 'HIDDEN_STATE_PROJECTION_MISSING' && /npc-scene-missing/u.test(error.message));
});
