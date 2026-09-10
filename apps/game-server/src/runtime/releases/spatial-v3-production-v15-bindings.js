import { createSpatialV3ProductionBindings } from
  './spatial-v3-production-binding-shared.js';
import { loadLowerDvinaTraceRevision33Publication } from
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
      || pins?.scenario_definition_revision !== 33
      || pins?.scenario_definition_digest
        !== '220b872de6b470c8482c982019f9e20e23422927018357fca2a2f07cc2308d5c'
      || pins?.phase_1a_package_id !== 'lower_dvina_trace_phase_1a_v24'
      || pins?.phase_1a_manifest_digest
        !== 'c1c6feaa072bc334a12703df17fe97df057c741cebc0ce0cf078527df87ee66b'
      || pins?.phase_1b_package_id !== 'lower_dvina_trace_phase_1b_v28'
      || pins?.phase_1b_manifest_digest
        !== '23fa6c3bc5b2716b148a69c22bbbb6efdac9e88ebd068fe58782067a73e8aa6c'
      || pins?.phase_1b_binding_digest
        !== '3311695c856a1d25a981838bc40fb38b26389ce274c74c9574481e1cf7635ffd'
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
    publicationLoader: (options) => loadLowerDvinaTraceRevision33Publication({
      ...options, publicationRevision: 28 }),
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
