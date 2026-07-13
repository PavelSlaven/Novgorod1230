import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as baseline9 from '../fixtures/stage9-12-baseline/stage9-start-node-selection-0.10.1-recovery.js';
import * as baseline10 from '../fixtures/stage9-12-baseline/stage10-start-place-audit-0.10.1-recovery.js';
import * as baseline11 from '../fixtures/stage9-12-baseline/stage11-player-character-0.10.1-recovery.js';
import * as baseline12 from '../fixtures/stage9-12-baseline/stage12-player-character-audit-0.10.1-recovery.js';
import * as stage9 from '@rus/new-game/stages/stage-9/compat';
import * as stage10 from '@rus/new-game/stages/stage-10/compat';
import * as stage11 from '@rus/new-game/stages/stage-11/compat';
import * as stage12 from '@rus/new-game/stages/stage-12/compat';
import { stage9Definition, stage10Definition, stage11Definition, stage12Definition } from '@rus/new-game';

const sortedKeys = (value) => Object.keys(value).sort();

test('Stages 9-12 preserve baseline compatibility exports', () => {
  assert.deepEqual(sortedKeys(stage9), sortedKeys(baseline9));
  assert.deepEqual(sortedKeys(stage10), sortedKeys(baseline10));
  assert.deepEqual(sortedKeys(stage11), sortedKeys(baseline11));
  assert.deepEqual(sortedKeys(stage12), sortedKeys(baseline12));
});

test('Stage 9 preserves policy, input gate and managed repair behavior', () => {
  assert.deepEqual(stage9.normalizeStage9SelectionPolicy({ max_selector_attempts: 0 }), baseline9.normalizeStage9SelectionPolicy({ max_selector_attempts: 0 }));
  assert.deepEqual(stage9.validateStage9StartNodeSelectorInput({}), baseline9.validateStage9StartNodeSelectorInput({}));
  const gate = { pass: false, concerns: [{ code: 'X' }], evidence: [] };
  assert.deepEqual(stage9.buildStage9ManagedPipelineResult({ input: {}, output: null, gate }), baseline9.buildStage9ManagedPipelineResult({ input: {}, output: null, gate }));
});

test('Stage 10 preserves audit policy, input gate and managed result', () => {
  assert.deepEqual(stage10.normalizeStage10AuditPolicy({}), baseline10.normalizeStage10AuditPolicy({}));
  assert.deepEqual(stage10.validateStage10StartPlaceAuditInput({}), baseline10.validateStage10StartPlaceAuditInput({}));
  const gate = { pass: false, concerns: [{ code: 'X', severity: 'hard_block' }], evidence: [] };
  assert.deepEqual(stage10.buildStage10ManagedPipelineResult({ input: {}, output: {}, gate }), baseline10.buildStage10ManagedPipelineResult({ input: {}, output: {}, gate }));
});

test('Stage 11 preserves generation policy and validation behavior', async () => {
  assert.deepEqual(stage11.normalizeCharacterGenerationPolicy({}), baseline11.normalizeCharacterGenerationPolicy({}));
  assert.deepEqual(stage11.validateStage11PlayerCharacterInput({}), baseline11.validateStage11PlayerCharacterInput({}));
  assert.deepEqual(stage11.validateStage11PlayerCharacterOutput({}, {}), baseline11.validateStage11PlayerCharacterOutput({}, {}));
  const input = {};
  assert.deepEqual(
    await stage11.runStage11PlayerCharacterBlock({ input, executor: async () => ({}) }),
    await baseline11.runStage11PlayerCharacterBlock({ input, executor: async () => ({}) })
  );
});

test('Stage 12 preserves code precheck, input validation and failed audit shape', () => {
  assert.deepEqual(stage12.normalizeStage12AuditPolicy({}), baseline12.normalizeStage12AuditPolicy({}));
  assert.deepEqual(stage12.buildStage12CodePrecheck({}), baseline12.buildStage12CodePrecheck({}));
  assert.deepEqual(stage12.validateStage12PlayerCharacterAuditInput({}), baseline12.validateStage12PlayerCharacterAuditInput({}));
  assert.deepEqual(stage12.buildStage12FailedAuditFromPrecheck({}), baseline12.buildStage12FailedAuditFromPrecheck({}));
});

test('Stages 9-12 expose executable modular definitions', () => {
  for (const [id, definition] of [[9, stage9Definition], [10, stage10Definition], [11, stage11Definition], [12, stage12Definition]]) {
    assert.equal(definition.id, id);
    assert.equal(typeof definition.execute, 'function');
  }
});

test('legacy Stages 9-12 are one-line compatibility facades', async () => {
  const files = [
    ['stage9-start-node-selection.js', '@rus/new-game/stages/stage-9/compat'],
    ['stage10-start-place-audit.js', '@rus/new-game/stages/stage-10/compat'],
    ['stage11-player-character.js', '@rus/new-game/stages/stage-11/compat'],
    ['stage12-player-character-audit.js', '@rus/new-game/stages/stage-12/compat']
  ];
  for (const base of ['legacy/src/world/new-game-pipeline/stages', 'legacy/dist/release/src/world/new-game-pipeline/stages']) {
    for (const [file, target] of files) {
      let source = null;
      try {
        source = await readFile(`${base}/${file}`, 'utf8');
      } catch (error) {
        if (base.startsWith('legacy/dist/') && error?.code === 'ENOENT') continue;
        throw error;
      }
      assert.match(source, new RegExp(target.replaceAll('/', '\\/').replaceAll('-', '\\-')));
      assert.equal(source.trim().split('\n').length, 1);
      assert.doesNotMatch(source, /function\s/u);
    }
  }
});
