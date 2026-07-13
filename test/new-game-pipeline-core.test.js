import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewGamePipelineContext,
  getNewGamePhaseId,
  getNewGameStageRegistry,
  runCodeGate
} from '../src/world/new-game-pipeline/index.js';
import { getPartyDbConfig, isPartyDbEnabled, withPartyTransaction } from '../src/world/party-db.js';

test('new-game registry exposes canonical 26 stage order', () => {
  const registry = getNewGameStageRegistry();
  assert.equal(registry.length, 26);
  assert.equal(registry[0].slug, 'player_request');
  assert.equal(registry[3].slug, 'regional_context');
  assert.equal(registry[4].requiresWorldBase, true);
  assert.equal(registry[24].kind, 'commit');
  assert.equal(getNewGamePhaseId(8), 'ng_stage_08');
});

test('pipeline context stores stage outputs and gate snapshots', () => {
  const context = createNewGamePipelineContext({ requestId: 'req_001', startText: 'start', playerName: 'Игрок' });
  context.setStageOutput(4, { schema: 'regional_context_package' });
  context.setGateResult(4, { pass: true });
  context.setStageMeta(4, { attempt_index: 1, repair_attempt_index: 0, model_tier: 'tier_2_standard' });

  assert.deepEqual(context.requireStageOutput(4), { schema: 'regional_context_package' });
  assert.equal(context.snapshot().request_id, 'req_001');
  assert.equal(context.snapshot().outputs[4].schema, 'regional_context_package');
  assert.equal(context.snapshot().gates[4].pass, true);
  assert.equal(context.snapshot().stage_meta[4].model_tier, 'tier_2_standard');
});

test('pipeline context can clear downstream checkpoints for rerun-from-stage recovery', () => {
  const context = createNewGamePipelineContext({ requestId: 'req_002' });
  context.setStageOutput(20, { schema: 'visible_context_package' });
  context.setStageOutput(21, { schema: 'visible_context_audit' });
  context.setGateResult(20, { pass: true });
  context.setGateResult(21, { pass: false });
  context.addRepairAttempt(21, { route: { rerun_from_stage: 20 } });
  context.setStageMeta(21, { attempt_index: 1, repair_attempt_index: 1 });

  context.clearFromStage(20);

  assert.equal(context.getStageOutput(20), null);
  assert.equal(context.getStageOutput(21), null);
  assert.equal(context.getGateResult(21), null);
  assert.equal(context.snapshot().repair_history[21], undefined);
});

test('pipeline context keeps validated_player_seed when clearing later narrator stages', () => {
  const context = createNewGamePipelineContext({ requestId: 'req_002_seed' });
  context.setStageOutput(1400, { schema: 'approved_start_position', anchor_id: 'anchor_001' });
  context.freezeArtifact({
    artifact_id: 'approved_start_position:req_002_seed',
    stage_id: 1400,
    schema: 'approved_start_position',
    version: 1,
    hash: 'start-position',
    frozen_paths: ['root.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'passed',
    dependency_status: 'passed',
    artifact: { anchor_id: 'anchor_001' }
  });
  context.setStageOutput(1401, { schema: 'player_seed_contract', current_position: { anchor_id: 'anchor_001' } });
  context.freezeArtifact({
    artifact_id: 'validated_player_seed:req_002_seed',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'seed',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: { current_position: { anchor_id: 'anchor_001' } }
  });
  context.setStageOutput(22, { schema: 'narrator_starting_prose' });

  context.clearFromStage(22);

  assert.equal(context.getStageOutput(22), null);
  assert.equal(context.getStageOutput(1400)?.schema, 'approved_start_position');
  assert.equal(context.getStageOutput(1401)?.schema, 'player_seed_contract');
  assert.equal(context.getFrozenArtifactBySchema('approved_start_position')?.artifact_id, 'approved_start_position:req_002_seed');
  assert.equal(context.getFrozenArtifactBySchema('player_seed_contract')?.artifact_id, 'validated_player_seed:req_002_seed');
});

test('code gate blocks empty critical retriever arrays', () => {
  const result = runCodeGate({
    stageId: 5,
    stageSlug: 'start_candidates',
    output: { candidates: [] },
    requiredArrays: ['candidates']
  });

  assert.equal(result.pass, false);
  assert.equal(result.concerns[0].code, 'NEW_GAME_GATE_EMPTY_REQUIRED_SET');
});

test('party db config follows prerequisite fallback and transaction wrapper rolls back', async () => {
  assert.equal(isPartyDbEnabled({ PARTY_DATABASE_URL: 'postgresql://party' }), true);
  assert.deepEqual(getPartyDbConfig({ DATABASE_URL: 'postgresql://world' }), {
    url: 'postgresql://world',
    source: 'DATABASE_URL',
    usesFallback: true
  });

  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
    }
  };
  await assert.rejects(
    withPartyTransaction(async () => {
      throw new Error('fail');
    }, { client }),
    /fail/u
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});
