import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage26-baseline/stage26-first-game-screen-0.2.0.js';
import * as modular from '@rus/new-game/stages/stage-26/compat';
import { stage26Definition } from '@rus/new-game/stages/stage-26';
import { makeActionAudit, makeSafetyAudit, makeStage26Artifacts, makeStage26Input } from '../fixtures/stage26-fixtures.mjs';

function rawInputValues() {
  const a = makeStage26Artifacts();
  return {
    request_id: a.requestId,
    stage25_party_commit_approval: a.stage25Approval,
    party_start_committed: a.partyStartCommitted,
    committed_public_read_model: a.publicState,
    approved_narrator_output: a.narrator,
    narrator_output_digest: a.narratorDigest,
    narrator_prose_approval: a.narratorApproval,
    approved_visible_context: a.visible,
    visible_context_package_digest: a.visibleDigest,
    visible_context_approval: a.visibleApproval,
    screen_policy: {}
  };
}

function executors(input) {
  return {
    safetyAuditor: async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen, input),
    actionLabelAuditor: async ({ input: roleInput }) => makeActionAudit(roleInput.screen_digest, input)
  };
}

test('legacy facade preserves every Stage 26 baseline export', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
});

test('Stage 26 constants and policy are byte-compatible', () => {
  for (const key of [
    'REQUIRED_SCREEN_POLICY', 'STAGE26_CONCERN_CODES', 'STAGE26_REPAIR_ROUTES', 'STAGE26_SEVERITIES',
    'STAGE26_INPUT_SCHEMA', 'STAGE26_PRECHECK_SCHEMA', 'STAGE26_SCREEN_SCHEMA',
    'STAGE26_CODE_VALIDATION_SCHEMA', 'STAGE26_SAFETY_AUDIT_SCHEMA', 'STAGE26_ACTION_AUDIT_SCHEMA',
    'STAGE26_RESULT_SCHEMA', 'STAGE26_APPROVAL_SCHEMA', 'STAGE26_NARRATOR_APPROVAL_SCHEMA',
    'STAGE26_DELIVERY_POLICY_SCHEMA'
  ]) assert.deepEqual(modular[key], baseline[key], key);
});

test('Stage 26 input builder remains structurally identical', () => {
  assert.deepEqual(modular.buildStage26Input(rawInputValues()), baseline.buildStage26Input(rawInputValues()));
});

test('Stage 26 input validation and precheck remain identical', () => {
  const input = makeStage26Input();
  assert.deepEqual(modular.validateStage26Input(input), baseline.validateStage26Input(input));
  assert.deepEqual(modular.buildFirstScreenCodePrecheck(input), baseline.buildFirstScreenCodePrecheck(input));
});

test('Stage 26 reference index remains identical', () => {
  const input = makeStage26Input();
  assert.deepEqual(modular.buildStage26ReferenceIndex(input), baseline.buildStage26ReferenceIndex(input));
});

test('Stage 26 screen projection and deterministic validation remain identical', () => {
  const input = makeStage26Input();
  const oldScreen = baseline.buildFirstGameScreenProjection(input);
  const newScreen = modular.buildFirstGameScreenProjection(input);
  assert.deepEqual(newScreen, oldScreen);
  assert.equal(modular.computeStage26Digest(newScreen), baseline.computeStage26Digest(oldScreen));
  assert.deepEqual(modular.validateFirstGameScreen(newScreen, input), baseline.validateFirstGameScreen(oldScreen, input));
});

test('Stage 26 full successful orchestration remains identical', async () => {
  const input = makeStage26Input();
  const oldResult = await baseline.runStage26FirstGameScreenBlock({ input, ...executors(input) });
  const newResult = await modular.runStage26FirstGameScreenBlock({ input, ...executors(input) });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, true);
  assert.deepEqual(modular.buildStage26Approval(newResult), baseline.buildStage26Approval(oldResult));
  assert.deepEqual(modular.validateStage26ToStage27Handoff(newResult), baseline.validateStage26ToStage27Handoff(oldResult));
});

test('Stage 26 invalid binding concerns preserve code, order and severity', () => {
  const input = structuredClone(makeStage26Input());
  input.stage25_party_commit_approval.request_id = 'wrong-request';
  input.narrator_prose_approval.pass = false;
  assert.deepEqual(modular.validateStage26Input(input), baseline.validateStage26Input(input));
});

test('declarative Stage 26 definition executes the modular runner', async () => {
  const input = makeStage26Input();
  const result = await stage26Definition.execute({ input, services: { stage26: executors(input) } });
  assert.equal(result.status, 'approved');
  assert.equal(result.artifact.pass, true);
});
