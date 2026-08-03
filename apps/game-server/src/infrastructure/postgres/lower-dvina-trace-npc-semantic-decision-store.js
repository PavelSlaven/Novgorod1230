import { canonicalDigest } from '@rus/materialization';
import {
  validateConversationContributionPlan,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import { serverError } from '../../errors.js';
import { json } from '../../runtime/first-playable/shared.js';

export function createNpcSemanticDecisionStore({ partyPool, partyId } = {}) {
  if (!partyPool?.query || !text(partyId)) {
    throw new TypeError('NPC semantic decision store requires pool and party.');
  }
  return Object.freeze({
    async resolve({ boundary, request, semanticModel }) {
      if (!text(boundary?.boundary_id)
          || !text(boundary?.npc_ref?.entity_id)
          || !text(boundary?.same_time_batch_ref?.entity_id)) {
        fail('NPC_SEMANTIC_DECISION_CLAIM_INVALID', 500);
      }
      const inputDigest = canonicalDigest({ boundary, request });
      if (typeof semanticModel !== 'function') {
        const existing = await readClaim(partyPool, partyId, boundary);
        return replayClaim(existing, boundary, inputDigest, request, {
          missingCode: 'NPC_SEMANTIC_DECISION_CLAIM_INVALID',
          missingStatus: 500
        });
      }
      const inserted = await partyPool.query(
        `INSERT INTO party_runtime.party_npc_semantic_decision_claims (
           boundary_id,party_id,npc_id,same_time_batch_id,decision_mode,
           canonical_input_digest,status
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT DO NOTHING
         RETURNING boundary_id`,
        [
          boundary.boundary_id,
          partyId,
          boundary.npc_ref.entity_id,
          boundary.same_time_batch_ref.entity_id,
          boundary.decision_mode,
          inputDigest
        ]
      );
      if (inserted.rowCount === 0) {
        const existing = await readClaim(partyPool, partyId, boundary);
        return replayClaim(existing, boundary, inputDigest, request);
      }

      const plan = await semanticModel(structuredClone(request));
      assertValidPlan(plan, request);
      const completed = await partyPool.query(
        `UPDATE party_runtime.party_npc_semantic_decision_claims
            SET semantic_plan=$4::jsonb,status='completed',completed_at=now()
          WHERE party_id=$1 AND boundary_id=$2
            AND canonical_input_digest=$3 AND status='pending'`,
        [partyId, boundary.boundary_id, inputDigest, json(plan)]
      );
      if (completed.rowCount !== 1) {
        fail('NPC_SEMANTIC_DECISION_COMPLETION_CONFLICT', 409);
      }
      return structuredClone(plan);
    }
  });
}

function readClaim(partyPool, partyId, boundary) {
  return partyPool.query(
    `SELECT boundary_id,decision_mode,canonical_input_digest,
            semantic_plan,status
       FROM party_runtime.party_npc_semantic_decision_claims
      WHERE party_id=$1 AND npc_id=$2 AND same_time_batch_id=$3`,
    [
      partyId,
      boundary.npc_ref.entity_id,
      boundary.same_time_batch_ref.entity_id
    ]
  );
}

function replayClaim(existing, boundary, inputDigest, request, {
  missingCode = 'NPC_SEMANTIC_DECISION_IDENTITY_CONFLICT',
  missingStatus = 409
} = {}) {
  if (existing.rowCount !== 1) {
    fail(missingCode, missingStatus);
  }
  const claim = existing.rows[0];
  if (claim.boundary_id !== boundary.boundary_id
      || claim.decision_mode !== boundary.decision_mode
      || claim.canonical_input_digest !== inputDigest) {
    fail('NPC_SEMANTIC_DECISION_IDENTITY_CONFLICT', 409);
  }
  if (claim.status === 'completed' && claim.semantic_plan) {
    assertValidPlan(claim.semantic_plan, request);
    return structuredClone(claim.semantic_plan);
  }
  fail('NPC_SEMANTIC_DECISION_PENDING', 409);
}

function assertValidPlan(plan, request) {
  const validPlan = request.schema === 'npc_action_decision_request_v1'
    ? validateNpcStepPlan(plan, request)
    : validateConversationContributionPlan(plan, request);
  if (!validPlan) {
    fail('NPC_SEMANTIC_DECISION_PLAN_INVALID', 502);
  }
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function fail(code, status) {
  throw serverError(code, 'NPC semantic decision claim failed closed.', { status });
}
