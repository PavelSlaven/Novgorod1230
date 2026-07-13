import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstScreenCodePrecheck,
  buildStage26Input,
  computeStage26Digest,
  normalizeStage26ScreenPolicy,
  validateStage26Input
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { computeStage25Digest } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { computeNarratorStartingProseDigest } from '../src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';
import { computeVisibleContextPackageDigest } from '../src/world/new-game-pipeline/stages/visible-context-digest.js';
import { makeStage26Artifacts, makeStage26Input } from './stage26-fixtures.mjs';

function rawInput() {
  return structuredClone(makeStage26Input());
}

test('screen policy cannot be weakened', () => {
  assert.throws(() => normalizeStage26ScreenPolicy({ show_hidden_state: true }), /cannot weaken/u);
  assert.throws(() => normalizeStage26ScreenPolicy({ require_delivery_ack_before_presented: false }), /cannot weaken/u);
});

test('Stage 25 approval and all four digests are required', () => {
  const input = rawInput();
  input.stage25_party_commit_approval.party_public_state_digest = computeStage25Digest({ stale: true });
  const issues = validateStage26Input(input);
  assert.ok(issues.some((item) => item.code === 'FIRST_SCREEN_PUBLIC_STATE_DIGEST_MISMATCH'));

  const input2 = rawInput();
  input2.stage25_party_commit_approval.permissions.can_show_player_output = false;
  assert.ok(validateStage26Input(input2).some((item) => item.code === 'FIRST_SCREEN_STAGE25_PERMISSION_DENIED'));
});

test('party_start_committed schema, request, turn and message readiness are strict', () => {
  const input = rawInput();
  input.party_start_committed.schema = 'wrong';
  input.party_start_committed.party_state.current_turn_number = 7;
  input.party_start_committed.player_output_ref.player_visible_message_ready = false;
  input.stage25_party_commit_approval.party_start_committed_digest = computeStage25Digest(input.party_start_committed);
  const issues = validateStage26Input(input);
  assert.ok(issues.some((item) => item.code === 'FIRST_SCREEN_PARTY_NOT_COMMITTED'));
});

test('committed public read model must be live, current and complete; Stage 20 fallback is forbidden', () => {
  const input = rawInput();
  delete input.committed_public_read_model.public_position_label;
  input.approved_visible_context.public_position_label = 'Fallback should not be used';
  input.stage25_party_commit_approval.party_public_state_digest = computeStage25Digest(input.committed_public_read_model);
  const precheck = buildFirstScreenCodePrecheck(input);
  assert.equal(precheck.pass, false);
  assert.ok(precheck.concerns.some((item) => item.code === 'FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID'));
  assert.equal(precheck.checks.no_precommit_visible_fallback.pass, true);
});

test('narrator approval checks digest and all permissions', () => {
  const input = rawInput();
  input.narrator_prose_approval.permissions.can_show_to_player = false;
  assert.ok(validateStage26Input(input).some((item) => item.code === 'FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED'));

  const input2 = rawInput();
  input2.approved_narrator_output.prose += ' Подмена.';
  input2.narrator_output_digest = computeNarratorStartingProseDigest(input2.approved_narrator_output);
  // Approval is intentionally stale.
  assert.ok(validateStage26Input(input2).some((item) => item.code === 'FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED'));
});

test('visible-context approval is bound to current package digest and permissions', () => {
  const input = rawInput();
  input.approved_visible_context.visible_npcs.push({ npc_instance_id: 'npc-new' });
  input.visible_context_package_digest = computeVisibleContextPackageDigest(input.approved_visible_context);
  assert.ok(validateStage26Input(input).some((item) => item.code === 'FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED'));

  const input2 = rawInput();
  input2.visible_context_approval.commit_permission.can_generate_player_facing_prose = false;
  assert.ok(validateStage26Input(input2).some((item) => item.code === 'FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED'));
});

test('exact input rejects unexpected/global fields', () => {
  const input = rawInput();
  input.context = { hidden: true };
  input.full_hidden_scene_state = { secret: true };
  const issues = validateStage26Input(input);
  assert.equal(issues.filter((item) => item.code === 'FIRST_SCREEN_FORBIDDEN_INPUT_FIELD').length, 2);
});

test('buildStage26Input creates an immutable exact contract', () => {
  const a = makeStage26Artifacts();
  const input = buildStage26Input({
    request_id: a.requestId,
    stage25_party_commit_approval: a.stage25Approval,
    party_start_committed: a.partyStartCommitted,
    committed_public_read_model: a.publicState,
    approved_narrator_output: a.narrator,
    narrator_output_digest: a.narratorDigest,
    narrator_prose_approval: a.narratorApproval,
    approved_visible_context: a.visible,
    visible_context_package_digest: a.visibleDigest,
    visible_context_approval: a.visibleApproval
  });
  assert.equal(validateStage26Input(input).length, 0);
  assert.equal(Object.isFrozen(input), true);
  assert.match(computeStage26Digest(input), /^sha256:/u);
});
