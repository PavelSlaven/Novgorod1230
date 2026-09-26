import { createSpatialV3ProductionBindings } from './spatial-v3-production-binding-shared.js';
import { createLowerDvinaTraceNpcAutonomousModel, createLowerDvinaTraceNpcCombatModel,
  createLowerDvinaTraceNpcSemanticModel, createLowerDvinaTracePlayerConversationModel } from '../lower-dvina-trace-phase-2-llm.js';
import { serverError } from '../../errors.js';

export function createSpatialV3RuntimeBindings(context = {}) {
  const { release, targetStartRuntime: runtime, targetRuntimeProfiles: profiles, worldKnowledge } = context;
  if (release?.release_id !== 'spatial-v3-production-v17'
    || !runtime?.starts?.length
    || release.scenario_binding_id !== runtime.starts[0].profile.scenario_id
    || release.scenario_binding_ids?.length !== runtime.starts.length
    || runtime.starts.some((start, index) => release.scenario_binding_ids[index] !== start.profile.scenario_id
      || release.scenario_profile_exact_pins_by_id?.[start.profile.scenario_id]?.phase_1a_manifest_digest
        !== start.profile.manifest_digest)
    || runtime?.itemPin?.compatible_world_revision_id !== release.world_revision_id
    || runtime?.itemPin?.compatible_world_catalog_digest !== release.world_catalog_digest) {
    throw serverError('SPATIAL_V3_TARGET_START_BINDING_REQUIRED', 'Exact loaded target start and release pins are required.');
  }
  if (profiles?.schema !== 'rus.live_world_runtime.target_runtime_profiles_loaded.v1'
    || profiles.world_revision_id !== release.world_revision_id) {
    throw serverError('SPATIAL_V3_TARGET_RUNTIME_PROFILE_APPROVAL_REQUIRED', 'Target runtime applicability requires its exact separate data approval.');
  }
  if (worldKnowledge?.bundle?.manifest?.pack_ref !== release.world_knowledge_pack_ref
    || worldKnowledge?.bundle?.manifest?.revision_id !== release.world_knowledge_pack_revision
    || worldKnowledge?.embedding_profile?.embedding_profile_ref !== release.world_knowledge_embedding_profile_ref) {
    throw serverError('SPATIAL_V3_TARGET_WORLD_KNOWLEDGE_REQUIRED', 'Exact production World Knowledge pins are required.');
  }
  return createSpatialV3ProductionBindings(context, {
    technicalCommandBoundary: 'production-v17',
    publicationLoader: async () => { throw serverError('SPATIAL_V3_TARGET_START_BINDING_REQUIRED', 'An approved authored target publication is required.'); },
    createNpcRuntimePorts: ({ roleRunner, worldKnowledgeGrounder }) => ({
      playerConversationModel: createLowerDvinaTracePlayerConversationModel({ roleRunner }),
      npcSemanticModel: createLowerDvinaTraceNpcSemanticModel({ roleRunner, worldKnowledgeGrounder }),
      npcAutonomousModel: createLowerDvinaTraceNpcAutonomousModel({ roleRunner, worldKnowledgeGrounder }),
      npcCombatModel: createLowerDvinaTraceNpcCombatModel({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
