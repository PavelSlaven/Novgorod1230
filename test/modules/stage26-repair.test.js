import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStage26FirstGameScreenBlock,
  STAGE26_SAFETY_AUDIT_SCHEMA
} from '@rus/new-game/stages/stage-26/compat';
import { routeForStage26Concerns } from '../../packages/new-game/src/stages/stage-26-first-game-screen/repair/routing.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from '../fixtures/stage26-fixtures.mjs';

function passAction(input) {
  return async ({ input: roleInput }) => makeActionAudit(roleInput.screen_digest, input);
}

function concern(code, severity = 'repairable') {
  return { code, severity, message: `Synthetic audit concern for ${code}.`, path: 'screen' };
}

test('repair routing preserves Stage 26 priority table', () => {
  const cases = [
    ['FIRST_SCREEN_ACTION_PROMISES_OUTCOME', 'first_screen_action_label_repair'],
    ['FIRST_SCREEN_RAW_ID_LEAK', 'first_screen_label_semantic_repair'],
    ['FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', 'party_public_read_model_repair'],
    ['FIRST_SCREEN_DELIVERY_ID_MISSING', 'delivery_state_repair'],
    ['FIRST_SCREEN_STAGE25_DIGEST_MISMATCH', 'stage25_postcommit_repair'],
    ['FIRST_SCREEN_NARRATOR_DIGEST_MISMATCH', 'narrator_prose_repair'],
    ['FIRST_SCREEN_VISIBLE_CONTEXT_DIGEST_MISMATCH', 'visible_context_repair'],
    ['FIRST_SCREEN_SCHEMA_MISMATCH', 'first_screen_format_repair']
  ];
  for (const [code, expected] of cases) assert.equal(routeForStage26Concerns([concern(code)]).return_to_stage, expected, code);
});

test('malformed safety audit can be repaired only as format', async () => {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async () => ({ version: 1, schema: STAGE26_SAFETY_AUDIT_SCHEMA, request_id: input.request_id }),
    actionLabelAuditor: passAction(input),
    formatRepairer: async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen_digest, input)
  });
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.format_repair_attempts, 1);
});

test('semantic label repair may change visible text but not reference topology', async () => {
  const input = makeStage26Input();
  let auditAttempt = 0;
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: roleInput }) => {
      auditAttempt += 1;
      return auditAttempt === 1
        ? makeSafetyAudit(roleInput.first_game_screen, input, false, [concern('FIRST_SCREEN_RAW_ID_LEAK')])
        : makeSafetyAudit(roleInput.first_game_screen, input, true, []);
    },
    actionLabelAuditor: passAction(input),
    semanticRepairer: async ({ input: roleInput }) => {
      const screen = structuredClone(roleInput.first_game_screen);
      screen.action_panel.suggested_actions[0].label = 'Внимательно осмотреть ворота';
      return screen;
    }
  });
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.semantic_repair_attempts, 1);
  assert.equal(result.first_game_screen.action_panel.suggested_actions[0].label, 'Внимательно осмотреть ворота');
});

test('semantic repair changing immutable prose is rejected', async () => {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen, input, false, [concern('FIRST_SCREEN_RAW_ID_LEAK')]),
    actionLabelAuditor: passAction(input),
    semanticRepairer: async ({ input: roleInput }) => {
      const screen = structuredClone(roleInput.first_game_screen);
      screen.main_prose = 'Подменённая проза.';
      return screen;
    }
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'semantic_repair');
  assert.ok(result.concerns.some((item) => item.code === 'FIRST_SCREEN_REPAIR_INVALID'));
});

test('upstream visible-context concern is routed without local semantic repair', async () => {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen, input, false, [concern('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED', 'upstream_block')]),
    actionLabelAuditor: passAction(input)
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'semantic_audit');
  assert.equal(result.repair_route.return_to_stage, 'visible_context_repair');
});

test('repeated failed semantic audits exhaust normal and senior repair', async () => {
  const input = makeStage26Input();
  const failedSafety = async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen, input, false, [concern('FIRST_SCREEN_RAW_ID_LEAK')]);
  const unchanged = async ({ input: roleInput }) => structuredClone(roleInput.first_game_screen);
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: failedSafety,
    actionLabelAuditor: passAction(input),
    semanticRepairer: unchanged,
    seniorRepairer: unchanged,
    maxRepairCycles: 1
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'repair_exhausted');
  assert.ok(result.diagnostics.semantic_repair_attempts >= 1);
  assert.ok(result.diagnostics.senior_repair_attempts >= 1);
  assert.ok(result.concerns.some((item) => item.code === 'FIRST_SCREEN_REPAIR_EXHAUSTED'));
});
