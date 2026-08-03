export const CONVERSATION_PROGRESS_EFFECT_REF = Object.freeze({
  entity_ref: {
    entity_kind: 'temporal_effect',
    entity_id: 'conversation-activity-progress'
  },
  authoring_version: '1'
});

export function lowerDvinaTraceConversationTemporalEffectRegistrations() {
  return [{
    effect_ref: CONVERSATION_PROGRESS_EFFECT_REF,
    resolve({ slice, context }) {
      return {
        proposals: [{
          proposal_id: `${slice.slice_id}:conversation-progress`,
          write_target: `conversation-progress:${slice.slice_id}`
        }],
        state_projection: context.projection
      };
    }
  }];
}
