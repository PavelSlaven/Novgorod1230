import {
  createSpatialV3ProductionBindings
} from './spatial-v3-production-binding-shared.js';
import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel
} from '../lower-dvina-trace-phase-2-llm.js';

export {
  firstPlayableCommitRecheck
} from './spatial-v3-production-binding-shared.js';

/**
 * Exact production-v4 binding for the accepted NPC conversation capability.
 * This release uses only the semantic conversation ports and cannot fall back
 * to the historical bounded NPC selector.
 */
export function createSpatialV3RuntimeBindings(context = {}) {
  if (context.release?.release_id !== 'spatial-v3-production-v4'
      || context.release?.npc_conversation_capability
        !== 'ready_for_runtime_acceptance') {
    throw new TypeError(
      'exact spatial-v3-production-v4 NPC conversation release is required'
    );
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v4',
    createNpcRuntimePorts: ({ roleRunner }) => ({
      playerConversationModel:
        createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel:
        createLowerDvinaTraceNpcSemanticModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
