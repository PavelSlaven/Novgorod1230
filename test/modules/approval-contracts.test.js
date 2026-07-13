import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNarratorProseAuditApproval,
  buildStage25PartyCommitApproval,
  buildVisibleContextAuditApproval,
  computeNarratorStartingProseDigest,
  computeStage25ArtifactDigest,
  computeVisibleContextPackageDigest,
  validateNarratorProseAuditApproval,
  validateStage25PartyCommitApproval,
  validateVisibleContextAuditApproval
} from '@rus/contracts';

test('visible-context approval preserves the Stage 21 permission boundary', () => {
  const visible = { version: 1, schema: 'visible_context_package', request_id: 'req-1', visible_context_status: 'formed' };
  const digest = computeVisibleContextPackageDigest(visible);
  const approval = buildVisibleContextAuditApproval({
    request_id: 'req-1',
    pass: true,
    visible_context_audit: { pass: true },
    visible_context_package_digest: digest,
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  });
  assert.equal(approval.visible_context_package_digest, digest);
  assert.deepEqual(validateVisibleContextAuditApproval(approval, { request_id: 'req-1', visible_context_package_digest: digest }), []);
});

test('narrator approval binds prose and visible-context digests', () => {
  const prose = { version: 1, schema: 'narrator_starting_prose', request_id: 'req-2', prose_status: 'drafted', prose: 'Text', action_options: [] };
  const proseDigest = computeNarratorStartingProseDigest(prose);
  const visibleDigest = computeVisibleContextPackageDigest({ request_id: 'req-2' });
  const approval = buildNarratorProseAuditApproval({
    request_id: 'req-2',
    pass: true,
    narrator_prose_audit: { pass: true },
    narrator_starting_prose_digest: proseDigest,
    visible_context_package_digest: visibleDigest,
    repair_route: null,
    commit_permission: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  });
  assert.deepEqual(validateNarratorProseAuditApproval(approval, {
    request_id: 'req-2',
    narrator_output_digest: proseDigest,
    visible_context_package_digest: visibleDigest
  }), []);
});

test('party commit approval is bound to committed artifacts', () => {
  const committed = { schema: 'party_start_committed', party_id: 'party-1' };
  const publicState = { schema: 'party_public_state', party_id: 'party-1' };
  const approval = buildStage25PartyCommitApproval({
    request_id: 'req-3',
    pass: true,
    commit_status: 'committed',
    party_id: 'party-1',
    transaction_id: 'tx-1',
    physical_plan_digest: computeStage25ArtifactDigest({ plan: 1 }),
    postcommit_state_digest: computeStage25ArtifactDigest({ state: 1 }),
    party_start_committed_digest: computeStage25ArtifactDigest(committed),
    party_public_state_digest: computeStage25ArtifactDigest(publicState),
    handoff_permission: {
      can_start_stage_26: true,
      can_show_player_output: true,
      can_accept_player_input: true
    }
  });
  assert.deepEqual(validateStage25PartyCommitApproval(approval, {
    request_id: 'req-3',
    party_id: 'party-1',
    transaction_id: 'tx-1',
    party_start_committed_digest: computeStage25ArtifactDigest(committed),
    party_public_state_digest: computeStage25ArtifactDigest(publicState)
  }), []);
});
