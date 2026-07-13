import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MODULAR_NEW_GAME_STAGE_PLAN,
  createModularNewGameContext,
  runModularNewGamePipeline,
  validateModularStagePlan
} from '@rus/new-game/orchestrator';

function stagePlan(factory = null) {
  return Array.from({ length: 25 }, (_, index) => {
    const id = index + 2;
    return {
      id,
      name: `stage-${id}`,
      async execute(args) {
        return factory ? factory(id, args) : { status: 'approved', artifact: { version: 1, schema: `stage_${id}_artifact`, stage_id: id } };
      }
    };
  });
}

function inputBuilders(events = []) {
  return Object.fromEntries(Array.from({ length: 25 }, (_, index) => {
    const id = index + 2;
    return [id, (context) => {
      events.push(id);
      return { request_id: context.requestId, prior_stage: id === 2 ? 1 : context.getStageOutput(id - 1)?.stage_id ?? null };
    }];
  }));
}

test('default modular plan contains executable Stages 2-26 in exact order', () => {
  assert.equal(validateModularStagePlan(MODULAR_NEW_GAME_STAGE_PLAN), MODULAR_NEW_GAME_STAGE_PLAN);
  assert.deepEqual(MODULAR_NEW_GAME_STAGE_PLAN.map((stage) => stage.id), Array.from({ length: 25 }, (_, index) => index + 2));
  assert.ok(MODULAR_NEW_GAME_STAGE_PLAN.every((stage) => typeof stage.execute === 'function'));
});

test('orchestrator executes the complete Stage 2-26 chain and checkpoints every approval', async () => {
  const builtInputs = [];
  const saved = [];
  const result = await runModularNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req-orchestrator-full',
    stages: stagePlan(),
    stageInputBuilders: inputBuilders(builtInputs),
    checkpointStore: { save: async (checkpoint, meta) => saved.push({ checkpoint, meta }) }
  });

  assert.equal(result.status, 'approved');
  assert.equal(result.stage_id, 26);
  assert.deepEqual(builtInputs, Array.from({ length: 25 }, (_, index) => index + 2));
  assert.equal(saved.length, 25);
  assert.equal(result.checkpoint.last_completed_stage, 26);
  assert.equal(result.checkpoint.outputs['26'].schema, 'stage_26_artifact');
});

test('repair route clears downstream state and reruns from the declared upstream stage', async () => {
  const calls = new Map();
  const stages = stagePlan((id) => {
    calls.set(id, (calls.get(id) ?? 0) + 1);
    if (id === 10 && calls.get(id) === 1) {
      return {
        status: 'repair_required',
        artifact: { repair_route: { return_to_stage: 8, rerun_from_stage: 8, reason_code: 'REBUILD_CANDIDATES' } }
      };
    }
    return { status: 'approved', artifact: { version: 1, schema: `stage_${id}_artifact`, stage_id: id, attempt: calls.get(id) } };
  });

  const result = await runModularNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req-orchestrator-repair',
    stages,
    stageInputBuilders: inputBuilders(),
    maxRepairCycles: 2
  });

  assert.equal(result.status, 'approved');
  assert.equal(calls.get(7), 1);
  assert.equal(calls.get(8), 2);
  assert.equal(calls.get(9), 2);
  assert.equal(calls.get(10), 2);
  assert.equal(result.checkpoint.repairs['10'].length, 1);
});

test('checkpoint resume skips already approved stages without re-executing them', async () => {
  const firstCalls = [];
  const first = await runModularNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req-orchestrator-resume',
    stages: stagePlan((id) => {
      firstCalls.push(id);
      if (id === 15) return { status: 'blocked', artifact: { reason: 'external_dependency_missing' } };
      return { status: 'approved', artifact: { version: 1, schema: `stage_${id}_artifact`, stage_id: id } };
    }),
    stageInputBuilders: inputBuilders()
  });
  assert.equal(first.status, 'blocked');
  assert.equal(first.stage_id, 15);

  const resumedCalls = [];
  const resumed = await runModularNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req-orchestrator-resume',
    checkpoint: first.checkpoint,
    stages: stagePlan((id) => {
      resumedCalls.push(id);
      return { status: 'approved', artifact: { version: 1, schema: `stage_${id}_artifact`, stage_id: id } };
    }),
    stageInputBuilders: inputBuilders()
  });
  assert.equal(resumed.status, 'approved');
  assert.deepEqual(resumedCalls, Array.from({ length: 12 }, (_, index) => index + 15));
});

test('orchestrator context snapshots and restores isolated outputs and frozen artifacts', () => {
  const context = createModularNewGameContext({ requestId: 'req-context' });
  context.setStageOutput(2, { schema: 'example', value: 1 });
  context.freezeArtifact({ artifactId: 'example:1', artifact: { schema: 'example', value: 1 }, stageId: 2 });
  const restored = createModularNewGameContext({ requestId: 'req-context', checkpoint: context.snapshot() });
  assert.deepEqual(restored.getStageOutput(2), { schema: 'example', value: 1 });
  assert.equal(restored.getFrozenArtifact('example:1').schema, 'example');
});

test('modular orchestrator has no legacy imports', async () => {
  for (const file of ['context.js', 'stage-plan.js', 'commit.js', 'run.js', 'index.js']) {
    const text = await readFile(`packages/new-game/src/orchestrator/${file}`, 'utf8');
    assert.doesNotMatch(text, /legacy\//u);
    assert.doesNotMatch(text, /legacy-adapter/u);
  }
});
