export default async function createRuntimeBindings({ ports }) {
  const document = await ports.knowledgeSource.getDocument({ document_id: 'world-regions' });
  if (!document.text.includes('Регионы')) throw new Error('knowledge-source port returned unexpected source');
  return {
    newGameOptionsFactory: async () => ({ stages: [], services: {} }),
    turnServicesFactory: async () => ({}),
    stage25PostcommitProjector: async () => ({ schema: 'fixture' }),
    newGameRunner: async ({ requestId }) => ({ party_id: 'party-knowledge', checkpoint: { outputs: {} }, first_game_screen: { schema: 'first_game_screen', request_id: requestId } }),
    turnRunner: async () => ({ screen: { schema: 'turn_screen' } })
  };
}
