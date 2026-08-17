import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  './lower-dvina-trace-ordinary-materialization-profile.js';
import { loadLowerDvinaTraceO2bProfile } from './lower-dvina-trace-o2b-profile.js';
import { loadLowerDvinaTraceA1Profile } from './lower-dvina-trace-a1-profile.js';

export async function loadLowerDvinaTraceProductionMaterializationProfiles({
  rootDir = process.cwd()
} = {}) {
  const [ordinaryMaterializationProfile,ordinaryContainerContentsProfile,
    actionProductionProfile] =
    await Promise.all([
      loadLowerDvinaTraceOrdinaryMaterializationProfile({rootDir}),
      loadLowerDvinaTraceO2bProfile({rootDir}),
      loadLowerDvinaTraceA1Profile({rootDir})
    ]);
  return Object.freeze({ordinaryMaterializationProfile,
    ordinaryContainerContentsProfile, actionProductionProfile});
}
