import { createSpatialV3ProductionBindings } from
  './spatial-v3-production-binding-shared.js';
import { loadLowerDvinaTraceRevision34Publication } from
  '../../internal/lower-dvina-trace-revision-32-publication.js';
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
  if (context.release?.release_id !== 'spatial-v3-production-v15'
      || context.release?.world_knowledge_pack_ref
        !== 'wk-pack:novgorod-1230'
      || context.release?.world_knowledge_pack_revision
        !== 'revision:production-v1'
      || context.release?.world_knowledge_embedding_profile_ref
        !== 'wk-embedding:giga-480m-0826:v1'
      || context.worldKnowledge?.bundle?.manifest?.pack_ref
        !== context.release.world_knowledge_pack_ref
      || context.worldKnowledge?.bundle?.manifest?.revision_id
        !== context.release.world_knowledge_pack_revision
      || context.worldKnowledge?.embedding_profile?.embedding_profile_ref
        !== context.release.world_knowledge_embedding_profile_ref
      || pins?.scenario_definition_revision !== 34
      || pins?.scenario_definition_digest
        !== 'c04d7032bfbea2fb7e1458fb59014e8168a258a3a2890475628a983702568b0f'
      || pins?.phase_1a_package_id !== 'lower_dvina_trace_phase_1a_v24'
      || pins?.phase_1a_manifest_digest
        !== 'c1c6feaa072bc334a12703df17fe97df057c741cebc0ce0cf078527df87ee66b'
      || pins?.phase_1b_package_id !== 'lower_dvina_trace_phase_1b_v29'
      || pins?.phase_1b_manifest_digest
        !== '4839c288013913d6a7c7aa91c58cb2c2431c6f8b2b255f3f36f8bc657131dc1b'
      || pins?.phase_1b_binding_digest
        !== 'ecca45b05b55e8e893b5f8ee0a42b2d62cb75b78a7516b8512bca7df7945ac2a'
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
      || context.release?.npc_conversation_capability
        !== 'ready_for_runtime_acceptance'
      || context.release?.npc_autonomous_capability
        !== 'ready_for_runtime_acceptance'
      || context.release?.npc_combat_capability
        !== 'ready_for_runtime_acceptance') {
    throw new TypeError('exact spatial-v3-production-v15 semantic release is required');
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v15',
    publicationLoader: (options) => loadLowerDvinaTraceRevision34Publication({
      ...options, publicationRevision: 29 }),
    createNpcRuntimePorts: ({ roleRunner, worldKnowledgeGrounder }) => ({
      playerConversationModel:
        createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel: createLowerDvinaTraceNpcSemanticModel({ roleRunner,
        worldKnowledgeGrounder }),
      npcAutonomousModel: createLowerDvinaTraceNpcAutonomousModel({ roleRunner,
        worldKnowledgeGrounder }),
      npcCombatModel: createLowerDvinaTraceNpcCombatModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
