import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage26FirstGameScreenBlock } from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { computeStage25Digest } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from './stage26-fixtures.mjs';

test('invalid committed public read model routes upstream, not to local label repair', async () => {
  const input = structuredClone(makeStage26Input());
  input.committed_public_read_model.read_model_source = 'caller_override';
  input.stage25_party_commit_approval.party_public_state_digest = computeStage25Digest(input.committed_public_read_model);
  const result = await runStage26FirstGameScreenBlock({ input, safetyAuditor: async () => ({}), actionLabelAuditor: async () => ({}) });
  assert.equal(result.pass, false);
  assert.equal(result.repair_route.return_to_stage, 'party_public_read_model_repair');
});

test('stale narrator approval routes to narrator repair', async () => {
  const input = structuredClone(makeStage26Input());
  input.narrator_prose_approval.permissions.can_show_to_player = false;
  const result = await runStage26FirstGameScreenBlock({ input, safetyAuditor: async () => ({}), actionLabelAuditor: async () => ({}) });
  assert.equal(result.repair_route.return_to_stage, 'narrator_prose_repair');
});

test('delivery binding failure routes to delivery repair', async () => {
  const input = structuredClone(makeStage26Input());
  input.party_start_committed.player_output_ref.narrator_output_id = '';
  input.stage25_party_commit_approval.party_start_committed_digest = computeStage25Digest(input.party_start_committed);
  const result = await runStage26FirstGameScreenBlock({ input, safetyAuditor: async () => ({}), actionLabelAuditor: async () => ({}) });
  assert.equal(result.repair_route.return_to_stage, 'delivery_state_repair');
});

test('unsafe action-label audit routes to targeted action repair', async () => {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input),
    actionLabelAuditor: async ({ input: role }) => makeActionAudit(role.screen_digest, input, false, [{
      code: 'FIRST_SCREEN_ACTION_PROMISES_OUTCOME', severity: 'repairable', message: 'Promises success.'
    }])
  });
  assert.equal(result.pass, false);
  assert.equal(result.repair_route.return_to_stage, 'first_screen_action_label_repair');
});
