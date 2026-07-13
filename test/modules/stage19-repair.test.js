import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage19 from '@rus/new-game/stages/stage-19/compat';
import { makeHiddenState, makeStage19Audit, makeStage19Input } from '../fixtures/stage17-19-fixtures.mjs';

test('Stage 19 repairs malformed hidden-state JSON as format only', async () => {
  const input = makeStage19Input();
  const output = makeHiddenState(input);
  const result = await stage19.runStage19HiddenStateBlock({
    input,
    build: async () => '{not-json',
    audit: async () => makeStage19Audit(),
    formatRepair: async (repairInput) => {
      assert.equal(repairInput.target, stage19.STAGE19_OUTPUT_SCHEMA);
      assert.equal(repairInput.constraints.change_format_only, true);
      return output;
    },
    semanticRepair: async () => output,
    seniorRepair: async () => output
  });
  assert.equal(result.pass, true);
  assert.equal(result.repair_history[0].kind, 'format');
  assert.deepEqual(result.full_hidden_scene_state, output);
});

test('Stage 19 semantic repair removes player-facing narrator text', async () => {
  const input = makeStage19Input();
  const invalid = makeHiddenState(input, { narrator_text: 'Запрещённая проза.' });
  const valid = makeHiddenState(input);
  let semanticCalls = 0;
  const result = await stage19.runStage19HiddenStateBlock({
    input,
    build: async () => invalid,
    audit: async () => makeStage19Audit(),
    formatRepair: async () => valid,
    semanticRepair: async (repairInput) => {
      semanticCalls += 1;
      assert.ok(repairInput.validationErrors.some((item) => item.code === 'HIDDEN_STATE_CREATED_NARRATOR_TEXT'));
      return valid;
    },
    seniorRepair: async () => valid
  });
  assert.equal(semanticCalls, 1);
  assert.equal(result.repair_history[0].kind, 'semantic');
  assert.deepEqual(result.full_hidden_scene_state, valid);
});
