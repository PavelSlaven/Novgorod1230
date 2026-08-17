import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  './lower-dvina-trace-ordinary-materialization-profile.js';
import { loadLowerDvinaTraceO2bProfile } from './lower-dvina-trace-o2b-profile.js';
import { loadLowerDvinaTraceA1Profile } from './lower-dvina-trace-a1-profile.js';
import { loadLowerDvinaTraceLocalFireProfile } from
  './lower-dvina-trace-local-fire-profile.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  './lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTraceNpcSemanticProfile } from
  './lower-dvina-trace-npc-semantic-profile.js';

export async function loadLowerDvinaTraceProductionMaterializationProfiles({
  rootDir = process.cwd()
} = {}) {
  const [ordinaryMaterializationProfile,ordinaryContainerContentsProfile,
    actionProductionProfile, localFireProfile, spatialSemanticProfile,
    npcSemanticProfile] =
    await Promise.all([
      loadLowerDvinaTraceOrdinaryMaterializationProfile({rootDir}),
      loadLowerDvinaTraceO2bProfile({rootDir}),
      loadLowerDvinaTraceA1Profile({rootDir}),
      loadLowerDvinaTraceLocalFireProfile({rootDir}),
      loadLowerDvinaTraceSpatialSemanticProfile({rootDir}),
      loadLowerDvinaTraceNpcSemanticProfile({rootDir})
    ]);
  return Object.freeze({ordinaryMaterializationProfile,
    ordinaryContainerContentsProfile, actionProductionProfile,
    localFireProfile, spatialSemanticProfile,npcSemanticProfile});
}
