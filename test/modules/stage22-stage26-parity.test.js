import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNarratorProseAuditApproval,
  buildStage25PartyCommitApproval,
  buildVisibleContextAuditApproval,
  computeNarratorStartingProseDigest as contractNarratorDigest,
  computeStage25ArtifactDigest,
  computeVisibleContextPackageDigest as contractVisibleDigest
} from '@rus/contracts';
import {
  buildStage21Approval
} from '../../legacy/src/world/new-game-pipeline/stages/stage22-narrator-prose.js';
import {
  computeVisibleContextPackageDigest as stage22VisibleDigest
} from '../../legacy/src/world/new-game-pipeline/stages/visible-context-digest.js';
import {
  buildStage25Approval,
  computeStage25Digest
} from '../../legacy/src/world/new-game-pipeline/stages/stage25-party-commit.js';
import {
  buildNarratorProseApproval
} from '../../legacy/src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import {
  computeNarratorStartingProseDigest as stage23NarratorDigest
} from '../../legacy/src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';

test('Stage 21 approval compatibility facade matches canonical contract', () => {
  const input = {
    request_id: 'req-parity-1',
    pass: true,
    visible_context_audit: { pass: true },
    visible_context_package_digest: 'sha256:' + 'a'.repeat(64),
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
  assert.deepEqual(buildStage21Approval(input), buildVisibleContextAuditApproval(input));
});

test('Stage 25 approval compatibility facade matches canonical contract', () => {
  const input = {
    request_id: 'req-parity-2',
    pass: true,
    commit_status: 'committed',
    party_id: 'party-2',
    transaction_id: 'tx-2',
    physical_plan_digest: 'sha256:' + 'a'.repeat(64),
    postcommit_state_digest: 'sha256:' + 'b'.repeat(64),
    party_start_committed_digest: 'sha256:' + 'c'.repeat(64),
    party_public_state_digest: 'sha256:' + 'd'.repeat(64),
    handoff_permission: {
      can_start_stage_26: true,
      can_show_player_output: true,
      can_accept_player_input: true
    }
  };
  assert.deepEqual(buildStage25Approval(input), buildStage25PartyCommitApproval(input));
});

test('Stage 26 narrator approval compatibility facade matches canonical contract', () => {
  const input = {
    request_id: 'req-parity-3',
    pass: true,
    narrator_prose_audit: { pass: true },
    narrator_starting_prose_digest: 'sha256:' + 'e'.repeat(64),
    visible_context_package_digest: 'sha256:' + 'f'.repeat(64),
    repair_route: null,
    commit_permission: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  };
  assert.deepEqual(buildNarratorProseApproval(input), buildNarratorProseAuditApproval(input));
});

test('legacy and canonical digest functions remain byte-compatible', () => {
  const value = { z: [{ b: 2, a: 1 }], a: { y: true, x: null } };
  assert.equal(stage22VisibleDigest(value), contractVisibleDigest(value));
  assert.equal(stage23NarratorDigest(value), contractNarratorDigest(value));
  assert.equal(computeStage25Digest(value), computeStage25ArtifactDigest(value));
});
