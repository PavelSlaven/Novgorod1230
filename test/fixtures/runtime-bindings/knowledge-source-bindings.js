export default async function createRuntimeBindings({ ports }) {
  const document = await ports.knowledgeSource.getDocument({ document_id: 'world-regions' });
  if (!document.text.includes('Регионы')) throw new Error('knowledge-source port returned unexpected source');
  return {
    newGameOptionsFactory: async () => ({ stages: [], services: {} }),
    turnServicesFactory: async () => ({}),
    stage25PostcommitProjector: async () => ({ schema: 'fixture' }),
    createTravelPorts: async () => travelPorts(),
    newGameRunner: async ({ requestId }) => ({ party_id: 'party-knowledge', checkpoint: { outputs: {} }, first_game_screen: { schema: 'first_game_screen', request_id: requestId } }),
    turnRunner: async () => ({ screen: { schema: 'turn_screen' } })
  };
}

function travelPorts() {
  return {
    travelContextReader: { read: async () => ({}) },
    travelRulesBundleReader: { read: async () => ({}) },
    environmentBundleReader: { read: async () => ({}) },
    journeyRepository: { read: async () => ({}) },
    environmentRepository: { read: async () => ({}) },
    routeGraphReader: { read: async () => ({}) },
    clock: { read: async () => ({}) },
    randomSourceFactory: { create: () => ({ next: () => 0 }) },
    partyStore: { commit: async () => ({}) }
  };
}
