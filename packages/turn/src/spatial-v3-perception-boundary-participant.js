import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { compareGameTimestamp } from '@rus/time-events-history';
import {
  resolveSpatialV3PerceptionReactionBoundary
} from './spatial-v3-perception-reaction-cycle.js';
import {
  buildSpatialV3PerceptionReactionWriteSet,
  buildSpatialV3ReactionDecisionCompletionWriteSet
} from './spatial-v3-perception-reaction-write-set.js';

const clone = (value) => structuredClone(value);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const refEqual = (left, right) =>
  left?.entity_kind === right?.entity_kind
  && left?.entity_id === right?.entity_id;
const hardBlock = (code = 'perception_policy_gap') =>
  freeze({ disposition: 'hard_block', code });

/**
 * Adapts the pure perception/reaction owners to the existing Temporal World
 * boundary callback. The work item is part of the sealed turn projection; this
 * adapter performs no reads, writes, clock changes or external decisions.
 */
export function createSpatialV3PerceptionBoundaryParticipant({
  resolveBoundary = resolveSpatialV3PerceptionReactionBoundary,
  buildInitialWriteSet = buildSpatialV3PerceptionReactionWriteSet,
  buildCompletionWriteSet =
    buildSpatialV3ReactionDecisionCompletionWriteSet
} = {}) {
  if (![resolveBoundary, buildInitialWriteSet, buildCompletionWriteSet]
    .every((value) => typeof value === 'function')) {
    throw new TypeError('Perception boundary participant requires pure owner adapters.');
  }
  return freeze({
    resolve(candidate, context = {}) {
      const candidateErrors = validateSpatialV3Contract(
        'temporal_boundary_candidate',
        candidate
      );
      if (candidateErrors.length > 0
        || candidate.boundary_kind !== 'perception_follow_up'
        || compareGameTimestamp(candidate.scheduled_at, context.clock_before) !== 0
        || !record(context.projection)) {
        return hardBlock(candidateErrors[0]?.code ?? 'temporal_candidate_stale');
      }
      const workItems = context.projection.perception_boundary_work_items;
      if (!Array.isArray(workItems)) return hardBlock();
      const matches = workItems.filter(
        (item) => item?.boundary_id === candidate.boundary_id
      );
      if (matches.length !== 1) return hardBlock('temporal_candidate_stale');
      const work = matches[0];
      if (!record(work.cycle_input)
        || !record(work.write_context)
        || work.write_context.party_id !== context.request?.party_id
        || !refEqual(
          work.cycle_input.perception_request?.perceiver_ref,
          candidate.primary_subject_ref
        )
        || !refEqual(
          work.cycle_input.perception_request?.event_ref,
          candidate.source_ref
        )
        || compareGameTimestamp(
          work.cycle_input.perception_request?.perceived_at,
          candidate.scheduled_at
        ) !== 0) {
        return hardBlock();
      }
      const outcome = resolveBoundary(freeze(clone(work.cycle_input)));
      if (outcome instanceof Promise || !outcome?.ok) {
        return hardBlock(outcome?.error?.code ?? 'perception_policy_gap');
      }
      const isCompletion = Boolean(
        work.cycle_input.persisted_reaction_option_proposal
        && outcome.status === 'completed'
      );
      const mapped = isCompletion
        ? buildCompletionWriteSet({
            party_id: work.write_context.party_id,
            change_set_id: work.write_context.change_set_id,
            persisted_perception_result: outcome.perception_result,
            persisted_reaction_option_proposal:
              outcome.reaction_option_proposal,
            reaction_proposal: outcome.reaction_proposal
          })
        : buildInitialWriteSet({
            party_id: work.write_context.party_id,
            change_set_id: work.write_context.change_set_id,
            idempotency_record_id:
              work.write_context.idempotency_record_id,
            perception_result: outcome.perception_result,
            perception_replay_evidence:
              outcome.perception_replay_evidence,
            knowledge_merge_result: outcome.knowledge_merge_result,
            reaction_option_proposal:
              outcome.reaction_option_proposal,
            reaction_proposal: outcome.reaction_proposal
          });
      if (!mapped?.ok) {
        return hardBlock(mapped?.error?.code ?? 'generated_schema_mismatch');
      }
      const proposalPayload = {
        proposal_id: `${candidate.boundary_id}:perception-reaction`,
        write_target:
          `perception-reaction:${outcome.reaction_option_proposal.request_id}`,
        boundary_id: candidate.boundary_id,
        status: outcome.status,
        decision_mode: outcome.decision_mode,
        perception_reaction_result: outcome,
        write_set: mapped.write_set,
        expected_state_versions: mapped.expected_state_versions,
        physical_keys: mapped.physical_keys
      };
      const remaining = workItems.filter(
        (item) => item.boundary_id !== candidate.boundary_id
      );
      return freeze({
        disposition: 'execute',
        proposals: [{
          ...proposalPayload,
          canonical_digest:
            computeSpatialV3CanonicalDigest(proposalPayload)
        }],
        follow_up_candidates: [],
        state_projection: {
          ...clone(context.projection),
          perception_boundary_work_items: remaining,
          ...(outcome.status === 'awaiting_bounded_decision'
            ? {
                pending_npc_decision_request:
                  clone(outcome.decision_request)
              }
            : { pending_npc_decision_request: null })
        }
      });
    }
  });
}
