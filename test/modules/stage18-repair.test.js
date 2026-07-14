import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage18 from '@rus/new-game/stages/stage-18/compat';
import { makeStage18Audit, makeStage18Input, makeKnowledgeMap } from '../fixtures/stage17-19-fixtures.mjs';

test('Stage 18 repairs malformed builder JSON without changing knowledge semantics', async () => {
  const input = makeStage18Input();
  const output = makeKnowledgeMap(input);
  const result = await stage18.runStage18CharacterKnowledgeMapBlock({
    input,
    build: async () => '{not-json',
    audit: async () => makeStage18Audit(),
    formatRepair: async (repairInput) => {
      assert.equal(repairInput.target, stage18.STAGE18_OUTPUT_SCHEMA);
      assert.equal(repairInput.constraints.change_format_only, true);
      return output;
    },
    semanticRepair: async () => output,
    seniorRepair: async () => output
  });
  assert.equal(result.pass, true);
  assert.equal(result.repair_history[0].kind, 'format');
  assert.deepEqual(result.character_knowledge_map, output);
});

test('Stage 18 semantic repair removes an unapproved full-map grant', async () => {
  const input = makeStage18Input();
  const invalid = makeKnowledgeMap(input, { knowledge_scope_summary: { map_detail_level: 'full_map', route_knowledge_level: 'all' } });
  const valid = makeKnowledgeMap(input);
  let semanticCalls = 0;
  const result = await stage18.runStage18CharacterKnowledgeMapBlock({
    input,
    build: async () => invalid,
    audit: async () => makeStage18Audit(),
    formatRepair: async () => valid,
    semanticRepair: async (repairInput) => {
      semanticCalls += 1;
      assert.ok(repairInput.validationErrors.some((item) => item.code === 'KNOWLEDGE_MAP_FULL_MAP_GRANTED'));
      return valid;
    },
    seniorRepair: async () => valid
  });
  assert.equal(semanticCalls, 1);
  assert.equal(result.repair_history[0].kind, 'semantic');
  assert.deepEqual(result.character_knowledge_map, valid);
});
