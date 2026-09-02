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
  const pins = context.release?.scenario_profile_exact_pins;
  if (context.release?.release_id !== 'spatial-v3-production-v14'
      || pins?.scenario_definition_revision !== 32
      || pins?.scenario_definition_digest
        !== '30608c3dff4406175100352cdd95c1d0d4fffef2f8fc6be0700fe41f89326635'
      || pins?.phase_1a_package_id !== 'lower_dvina_trace_phase_1a_v23'
      || pins?.phase_1a_manifest_digest
        !== '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101'
      || pins?.phase_1b_package_id !== 'lower_dvina_trace_phase_1b_v27'
      || pins?.phase_1b_manifest_digest
        !== 'feeea173c07a430d7eff230aa95d949c46d06d5a31fb71c662a9e804d2e315f8'
      || pins?.phase_1b_binding_digest
        !== '9af689725c97d657e04cbd76f703517ed1d0f254329c268092b1e2c8a79b1921'
      || pins?.n1_profile_id !== 'lower_dvina_trace_n1_background_npc_v1'
      || pins?.n1_profile_revision !== 1
      || pins?.n1_profile_scenario_definition_revision !== 31
      || pins?.n1_profile_digest
        !== '0e44bc05cd6e27aa962eee7d3114209a1b9959d447fc72679e743c16176d4aeb'
      || context.npcSemanticRemainderProfile?.digest !== pins.n1_profile_digest
      || context.npcSemanticRemainderProfile?.profile?.profile_id
        !== pins.n1_profile_id
      || context.npcSemanticRemainderProfile?.profile?.revision
        !== pins.n1_profile_revision
      || context.npcSemanticRemainderProfile?.profile?.scenario_definition_revision
        !== pins.n1_profile_scenario_definition_revision
      || context.release?.npc_conversation_capability !== 'ready_for_runtime_acceptance'
      || context.release?.npc_autonomous_capability !== 'ready_for_runtime_acceptance'
      || context.release?.npc_combat_capability !== 'ready_for_runtime_acceptance') {
    throw new TypeError('exact spatial-v3-production-v14 semantic release is required');
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v14',
    createNpcRuntimePorts: ({ roleRunner }) => ({
      playerConversationModel: createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel: createLowerDvinaTraceNpcSemanticModel({ roleRunner }),
      npcAutonomousModel: createLowerDvinaTraceNpcAutonomousModel({ roleRunner }),
      npcCombatModel: createLowerDvinaTraceNpcCombatModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
