import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstGameScreenProjection,
  buildNarratorProseApproval,
  buildStage26Input,
  validateStage26Input
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { buildStage25Approval, runStage25PartyCommitBlock } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { computeNarratorStartingProseDigest } from '../src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';
import { computeVisibleContextPackageDigest } from '../src/world/new-game-pipeline/stages/visible-context-digest.js';
import {
  makeDryRunResult,
  makeIdempotencyResult,
  makePostcommitState,
  makeStage25Input,
  makeTransactionResult
} from './stage25-fixtures.mjs';

async function committedInput() {
  const { stage25Input } = await makeStage25Input();
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest),
    dryRunExecutor: async (payload) => makeDryRunResult(payload),
    transactionExecutor: async (payload) => makeTransactionResult(payload),
    postcommitReader: async (payload) => makePostcommitState(payload)
  });
  assert.equal(result.pass, true, JSON.stringify(result.concerns));
  const narrator = {
    version: 1, schema: 'narrator_starting_prose', request_id: result.request_id,
    narrator_output_id: result.party_start_committed.player_output_ref.narrator_output_id,
    prose_status: 'drafted', prose: 'Ты стоишь у ворот.',
    action_options: [{ option_id: 'option-look', label: 'Осмотреть ворота', action_kind: 'inspect', basis: 'visible', risk_hint: 'low', target_ref: { anchor_id: 'anchor-1' }, must_not_reveal_hidden_truth: true }],
    used_visible_context_refs: ['anchor-1'],
    self_constraints_check: { no_new_world_facts: true, no_hidden_state_leak: true, no_private_motive_claims: true, no_closed_container_contents: true, no_future_event_claims: true }
  };
  const visible = {
    version: 1, schema: 'visible_context_package', request_id: result.request_id, visible_context_status: 'formed',
    visible_anchors: [{ anchor_id: 'anchor-1' }], visible_exits: [], visible_npcs: [], visible_items: [], visible_containers: [], audible_context: [],
    available_actions_context: [{ action_id: 'action-look', action_kind: 'inspect', basis: 'visible', risk_hint: 'low', target_ref: { anchor_id: 'anchor-1' } }]
  };
  const narratorDigest = computeNarratorStartingProseDigest(narrator);
  const visibleDigest = computeVisibleContextPackageDigest(visible);
  const input = buildStage26Input({
    request_id: result.request_id,
    stage25_party_commit_approval: buildStage25Approval(result),
    party_start_committed: result.party_start_committed,
    committed_public_read_model: result.party_public_state,
    approved_narrator_output: narrator,
    narrator_output_digest: narratorDigest,
    narrator_prose_approval: buildNarratorProseApproval({ request_id: result.request_id, pass: true, narrator_starting_prose_digest: narratorDigest, visible_context_package_digest: visibleDigest, repair_route: null, narrator_prose_audit: { pass: true }, commit_permission: { can_show_to_player: true, can_write_player_visible_message: true, can_mark_opening_scene_presented: true } }),
    approved_visible_context: visible,
    visible_context_package_digest: visibleDigest,
    visible_context_approval: {
      version: 1, schema: 'visible_context_audit_approval', request_id: result.request_id, pass: true,
      visible_context_package_digest: visibleDigest,
      commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    }
  });
  return { result, input };
}

test('Stage 26 accepts exact digest-bound handoff from successful real Stage 25 commit', async () => {
  const { result, input } = await committedInput();
  assert.deepEqual(validateStage26Input(input), []);
  const screen = buildFirstGameScreenProjection(input);
  assert.equal(screen.screen_status, 'ready');
  assert.equal(screen.party_id, result.party_id);
});

test('Stage 26 rejects synthetic committed state without Stage 25 approval', async () => {
  const { input } = await committedInput();
  const invalid = { ...input, stage25_party_commit_approval: null };
  assert.ok(validateStage26Input(invalid).some((item) => item.code === 'FIRST_SCREEN_STAGE25_APPROVAL_INVALID'));
});

test('Stage 26 rejects approval whose transaction binding differs', async () => {
  const { input } = await committedInput();
  const invalid = structuredClone(input);
  invalid.stage25_party_commit_approval.transaction_id = 'tx-stale';
  assert.ok(validateStage26Input(invalid).some((item) => item.code === 'FIRST_SCREEN_STAGE25_APPROVAL_INVALID'));
});
