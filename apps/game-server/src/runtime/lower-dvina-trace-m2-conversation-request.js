import { buildPlayerConversationInput } from '@rus/npc-runtime';
import {
  allowedPlayerContributionReferences,
  committedPlayerKnowledgeRefs
} from
  './lower-dvina-trace-m2-conversation-projections.js';
import {
  npcRef,
  ref,
  requiredRawText,
  requiredVerbatimUtteranceText
} from
  './lower-dvina-trace-m2-conversation-shared.js';

export function buildPlayerRequest(context) {
  const playerRef = ref('player_character', context.state.actor_id);
  const presentListenerRefs = context.actualNpcActors.map(
    ({ instance_id: instanceId }) => npcRef(instanceId)
  );
  return buildPlayerConversationInput({
    schema: 'player_conversation_input_v1',
    request_id: `player-conversation-request:${context.inputDigest}`,
    conversation_id: context.conversationId,
    state_version: context.stateVersion,
    speaker_ref: playerRef,
    raw_text: requiredRawText(context.playerInput),
    received_at: `turn-input:${context.inputDigest}`,
    player_safe_context: {
      phase: context.phase,
      location_ref: context.state.position.location_ref,
      target_npc_ref: context.targetRef,
      verbatim_utterance_text: requiredVerbatimUtteranceText(
        context.playerInput
      ),
      present_listener_refs: presentListenerRefs,
      committed_knowledge_refs: committedPlayerKnowledgeRefs(context.state),
      allowed_duration_classes: ['domain_owned'],
      allowed_references: allowedPlayerContributionReferences(context),
      available_check: {
        attribute_ref: context.contracts.check.attribute,
        skill_ref: context.contracts.check.skill,
        difficulty_band: context.contracts.check.check_id
      },
      ...(context.phase === 'phase_3' && context.availableEvidence !== null
        ? { available_evidence: structuredClone(context.availableEvidence) }
        : {}),
      ...(context.requiredSupportingOperation != null ? {
        required_supporting_operation: context.requiredSupportingOperation
      } : {}),
      ...(context.phase === 'phase_4' ? {
        offer_policy_ref: context.contracts.promisePolicy.policy_id
      } : {})
    },
    operation_contract: context.playerOperationContract
  });
}
