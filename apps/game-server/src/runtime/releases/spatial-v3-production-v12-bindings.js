import { createSpatialV3ProductionBindings } from
  './spatial-v3-production-binding-shared.js';
import {
  createLowerDvinaTraceNpcAutonomousModel,
  createLowerDvinaTraceNpcCombatModel,
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel
} from '../lower-dvina-trace-phase-2-llm.js';

export { firstPlayableCommitRecheck } from
  './spatial-v3-production-binding-shared.js';

export function createSpatialV3RuntimeBindings(context = {}) {
  if (context.release?.release_id !== 'spatial-v3-production-v12'
      || context.release?.npc_conversation_capability
        !== 'ready_for_runtime_acceptance'
      || context.release?.npc_autonomous_capability
        !== 'ready_for_runtime_acceptance'
      || context.release?.npc_combat_capability
        !== 'ready_for_runtime_acceptance') {
    throw new TypeError('exact spatial-v3-production-v12 semantic release is required');
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v12',
    createNpcRuntimePorts: ({ roleRunner }) => ({
      playerConversationModel: createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel: createLowerDvinaTraceNpcSemanticModel({ roleRunner }),
      npcAutonomousModel: createLowerDvinaTraceNpcAutonomousModel({ roleRunner }),
      npcCombatModel: createLowerDvinaTraceNpcCombatModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
