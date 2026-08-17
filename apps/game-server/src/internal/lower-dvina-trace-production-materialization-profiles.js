import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  './lower-dvina-trace-ordinary-materialization-profile.js';
import { loadLowerDvinaTraceO2bProfile } from './lower-dvina-trace-o2b-profile.js';
import { loadLowerDvinaTraceA1Profile } from './lower-dvina-trace-a1-profile.js';
import { loadLowerDvinaTraceLocalFireProfile } from
  './lower-dvina-trace-local-fire-profile.js';

export async function loadLowerDvinaTraceProductionMaterializationProfiles({
  rootDir = process.cwd()
} = {}) {
  const [ordinaryMaterializationProfile,ordinaryContainerContentsProfile,
    actionProductionProfile, localFireProfile] =
    await Promise.all([
      loadLowerDvinaTraceOrdinaryMaterializationProfile({rootDir}),
      loadLowerDvinaTraceO2bProfile({rootDir}),
      loadLowerDvinaTraceA1Profile({rootDir}),
      loadLowerDvinaTraceLocalFireProfile({rootDir})
    ]);
  return Object.freeze({ordinaryMaterializationProfile,
    ordinaryContainerContentsProfile, actionProductionProfile,
    localFireProfile});
}
