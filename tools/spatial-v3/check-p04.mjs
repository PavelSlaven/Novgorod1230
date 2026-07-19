import { readFile } from 'node:fs/promises';

const files = {
  world: 'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  ux: 'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  catalog: 'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md',
  navigation: 'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md',
  registry: 'docs/migration/spatial-v3/target-registries.md'
};
const docs = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));

for (const [key, text] of Object.entries(docs)) {
  if (!text.includes('target') || !text.includes('P28')) throw new Error(`${key}: target/active boundary missing`);
}
for (const token of ['G3', 'G4', 'G5', 'G6', 'scene_position', 'typed data gap', 'NPC', 'items', 'candidate set']) {
  if (!docs.world.includes(token)) throw new Error(`world_generation_and_turns: ${token} missing`);
}
for (const token of ['mechanical_readiness', 'knowledge_visibility', 'hidden topology', 'layout', 'stranded', 'diagnostics']) {
  if (!docs.ux.includes(token)) throw new Error(`interface_ux: ${token} missing`);
}
for (const token of ['195 G4', 'canonical G5 inventory', 'directional', 'Name-based migration запрещён', 'typed gap', 'not_verified']) {
  if (!docs.catalog.includes(token)) throw new Error(`Novgorod catalog: ${token} missing`);
}
for (const token of ['spatial_architecture_standard_g0_g6.md', 'world_generation_and_turns.txt', 'interface_ux.md']) {
  if (!docs.navigation.includes(token)) throw new Error(`navigation: ${token} missing`);
}
for (const token of ['generated target contract registry', '@rus/space-map', '@rus/movement-routes', '@rus/materialization', 'player-safe projection']) {
  if (!docs.registry.includes(token)) throw new Error(`target registry: ${token} missing`);
}
if (/automatic migration/i.test(docs.catalog) && !docs.catalog.includes('Name-based migration запрещён')) throw new Error('Novgorod catalog: unsafe automatic migration assertion');
console.log('P04 checks passed: target world/UX/catalog/navigation registries preserve the active-v2 boundary and hidden-information rule.');
