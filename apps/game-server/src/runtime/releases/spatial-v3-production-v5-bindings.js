import {
  createSpatialV3ProductionBindings
} from './spatial-v3-production-binding-shared.js';
import {
  createLowerDvinaTraceNpcAutonomousModel,
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel
} from '../lower-dvina-trace-phase-2-llm.js';

export {
  firstPlayableCommitRecheck
} from './spatial-v3-production-binding-shared.js';

/** Exact production-v5 binding for player, conversation and autonomous paths. */
export function createSpatialV3RuntimeBindings(context = {}) {
  if (context.release?.release_id !== 'spatial-v3-production-v6'
      || context.release?.npc_conversation_capability
        !== 'ready_for_runtime_acceptance'
      || context.release?.npc_autonomous_capability
        !== 'ready_for_runtime_acceptance') {
    throw new TypeError(
      'exact spatial-v3-production-v6 semantic NPC release is required'
    );
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v6',
    createNpcRuntimePorts: ({ roleRunner }) => ({
      playerConversationModel:
        createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel:
        createLowerDvinaTraceNpcSemanticModel({ roleRunner }),
      npcAutonomousModel:
        createLowerDvinaTraceNpcAutonomousModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
