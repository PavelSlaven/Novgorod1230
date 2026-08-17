import { createPostgresOrdinaryContainerContentsLoader } from
  '../../infrastructure/postgres/ordinary-container-contents-loader.js';
import { createLowerDvinaTraceO2bContainerResolver } from
  '../lower-dvina-trace-o2b-container-resolver.js';

export function createLowerDvinaTraceO2bProductionResolverFactory({pool,
  loadedProfile,ordinaryMaterializationModel}) {
  const loadCommittedContainer =
    createPostgresOrdinaryContainerContentsLoader({pool});
  return ({partyId,inputDigest}) => createLowerDvinaTraceO2bContainerResolver({
    partyId,inputDigest,loadedProfile,loadCommittedContainer,
    ordinaryMaterializationModel});
}
