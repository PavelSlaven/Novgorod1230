import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstGameScreenProjection,
  computeStage26Digest,
  runStage26FirstGameScreenBlock
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { computeNarratorStartingProseDigest } from '../src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from './stage26-fixtures.mjs';

function passSafety(input) {
  return async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input);
}
function passAction(input) {
  return async ({ input: role }) => makeActionAudit(role.screen_digest, input);
}

test('safety audit malformed JSON shape is repaired only by format repairer', async () => {
  const input = makeStage26Input();
  let formatCalls = 0;
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async () => ({ pass: true }),
    actionLabelAuditor: passAction(input),
    formatRepairer: async ({ input: role }) => {
      formatCalls += 1;
      assert.equal(role.artifact_kind, 'first_screen_safety_audit');
      const screen = buildFirstGameScreenProjection(input);
      return makeSafetyAudit(screen, input);
    }
  });
  assert.equal(result.pass, true, JSON.stringify(result.concerns));
  assert.equal(formatCalls, 1);
  assert.equal(result.diagnostics.format_repair_attempts, 1);
});

test('semantic action-label repair is revalidated and re-audited', async () => {
  const input = makeStage26Input();
  let actionCalls = 0;
  let repairCalls = 0;
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: passSafety(input),
    actionLabelAuditor: async ({ input: role }) => {
      actionCalls += 1;
      if (actionCalls === 1) return makeActionAudit(role.screen_digest, input, false, [{
        code: 'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK',
        severity: 'repairable',
        message: 'Action label implies hidden truth.',
        path: 'action_panel.suggested_actions[0].label'
      }]);
      return makeActionAudit(role.screen_digest, input);
    },
    semanticRepairer: async ({ input: role }) => {
      repairCalls += 1;
      const repaired = structuredClone(role.first_game_screen);
      repaired.action_panel.suggested_actions[0].label = 'Внимательнее осмотреть ворота';
      return repaired;
    }
  });
  assert.equal(result.pass, true, JSON.stringify(result.concerns));
  assert.equal(actionCalls, 2);
  assert.equal(repairCalls, 1);
  assert.equal(result.repair_history.length, 1);
  assert.equal(result.audit_history.length, 4);
});

test('senior repair is used after normal repair budget', async () => {
  const input = makeStage26Input();
  let seniorCalls = 0;
  let actionCalls = 0;
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: passSafety(input),
    actionLabelAuditor: async ({ input: role }) => {
      actionCalls += 1;
      if (actionCalls === 1) return makeActionAudit(role.screen_digest, input, false, [{
        code: 'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK', severity: 'repairable', message: 'Needs senior repair.'
      }]);
      return makeActionAudit(role.screen_digest, input);
    },
    seniorRepairer: async ({ input: role }) => {
      seniorCalls += 1;
      const repaired = structuredClone(role.first_game_screen);
      repaired.action_panel.suggested_actions[0].label = 'Осмотреть ворота без предположений';
      return repaired;
    },
    maxRepairCycles: 0
  });
  assert.equal(result.pass, true, JSON.stringify(result.concerns));
  assert.equal(seniorCalls, 1);
  assert.equal(result.diagnostics.senior_repair_attempts, 1);
});

test('raw IDs in main prose are blocked before LLM audits', async () => {
  const input = structuredClone(makeStage26Input());
  input.approved_narrator_output.prose += ' Рядом стоит npc_secret_44.';
  input.narrator_output_digest = computeNarratorStartingProseDigest(input.approved_narrator_output);
  input.narrator_prose_approval.narrator_output_digest = input.narrator_output_digest;
  let auditorCalled = false;
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async () => { auditorCalled = true; return {}; },
    actionLabelAuditor: async () => { auditorCalled = true; return {}; }
  });
  assert.equal(result.pass, false);
  assert.equal(auditorCalled, false);
  assert.ok(result.concerns.some((item) => item.code === 'FIRST_SCREEN_RAW_ID_LEAK'));
});

test('UI safety flags are computed after both audits', async () => {
  const input = makeStage26Input();
  const projected = buildFirstGameScreenProjection(input);
  assert.equal(projected.ui_safety_boundary.player_sees_only_character_safe_context, false);
  const result = await runStage26FirstGameScreenBlock({ input, safetyAuditor: passSafety(input), actionLabelAuditor: passAction(input) });
  assert.equal(result.first_game_screen.ui_safety_boundary.hidden_state_not_included, true);
  assert.equal(result.first_game_screen.ui_safety_boundary.raw_ids_not_included, true);
  assert.equal(result.first_game_screen.ui_safety_boundary.player_sees_only_character_safe_context, true);
  assert.equal(result.screen_digest, computeStage26Digest(result.first_game_screen));
});
