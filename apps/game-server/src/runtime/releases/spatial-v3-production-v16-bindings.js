import { createSpatialV3ProductionBindings } from
  './spatial-v3-production-binding-shared.js';
import { loadLowerDvinaTraceRevision35Publication } from
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
  if (context.release?.release_id !== 'spatial-v3-production-v16'
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
      || pins?.scenario_definition_revision !== 35
      || pins?.scenario_definition_digest
        !== '807596c419fc6a0f9d676d7c57daba6672c6f95d1b1ead767bee6c7e28aced6f'
      || pins?.phase_1a_package_id !== 'lower_dvina_trace_phase_1a_v25'
      || pins?.phase_1a_manifest_digest
        !== '986fd4fa149997ed9581924b13f502b6f9eafff640b31d390b4347f113c500e6'
      || pins?.phase_1b_package_id !== 'lower_dvina_trace_phase_1b_v30'
      || pins?.phase_1b_manifest_digest
        !== 'ad0ae1b1ab66c2713e17de0cb85861932759e763ed4ffdd3123a96a50e4f32f4'
      || pins?.phase_1b_binding_digest
        !== 'e2a3c0d8af00f061b403ae0931934a63c38f5bcabaa5940d7b07bbe8de06d1a9'
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
    throw new TypeError('exact spatial-v3-production-v16 semantic release is required');
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v16',
    publicationLoader: (options) => loadLowerDvinaTraceRevision35Publication({
      ...options, publicationRevision: 30 }),
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
