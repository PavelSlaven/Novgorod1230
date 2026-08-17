import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  './lower-dvina-trace-ordinary-materialization-profile.js';
import { loadLowerDvinaTraceO2bProfile } from './lower-dvina-trace-o2b-profile.js';

export async function loadLowerDvinaTraceProductionMaterializationProfiles({
  rootDir = process.cwd()
} = {}) {
  const [ordinaryMaterializationProfile,ordinaryContainerContentsProfile] =
    await Promise.all([
      loadLowerDvinaTraceOrdinaryMaterializationProfile({rootDir}),
      loadLowerDvinaTraceO2bProfile({rootDir})
    ]);
  return Object.freeze({ordinaryMaterializationProfile,
    ordinaryContainerContentsProfile});
}
