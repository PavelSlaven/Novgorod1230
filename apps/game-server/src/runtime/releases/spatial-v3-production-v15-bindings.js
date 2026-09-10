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
        !== 'e3f9ed3adf251dc6b55e1d55df7fb42af11761d10db9e04672203b8ad50d8872'
      || pins?.phase_1a_package_id !== 'lower_dvina_trace_phase_1a_v24'
      || pins?.phase_1a_manifest_digest
        !== '6b6351c6cec4a814966691e123887d8e96ab2b2ee3189c2ac2a754bb049fb80e'
      || pins?.phase_1b_package_id !== 'lower_dvina_trace_phase_1b_v28'
      || pins?.phase_1b_manifest_digest
        !== '2324ce6b41d3bda293900aaa135411e2554c5bbe0ca56736fb1c0938c62aa88d'
      || pins?.phase_1b_binding_digest
        !== 'c700fe1bc61808258cd6a66826fb8f45026f2e0735a833dfb01d804c2d87a1db'
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
