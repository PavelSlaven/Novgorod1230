import { readFile } from 'node:fs/promises';

const files = [
  'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md',
  'data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt'
];
const docs = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]));
for (const [file, text] of docs) {
  if (!text.includes('target') || !text.includes('P28') || !text.includes('v2')) throw new Error(`${file}: active/target boundary missing`);
  if (!text.includes('G5') || !text.includes('G6')) throw new Error(`${file}: G5/G6 coverage missing`);
  if (/G7|G8/.test(text) && !text.includes('не вводит G7/G8') && !text.includes('G7/G8 запрещены')) throw new Error(`${file}: invalid extra G-level`);
}
const [architecture, requirements, graph, workflow] = docs.map(([, text]) => text);
if (!architecture.includes('canonical G0–G5') || !architecture.includes('finite party-generated G5') || !architecture.includes('scene_position_node')) throw new Error('architecture: target spatial model incomplete');
if (!architecture.includes('hard block') || !architecture.includes('candidate set')) throw new Error('architecture: data-gap rule missing');
if (!requirements.includes('controlled vocabularies') || !requirements.includes('Import order')) throw new Error('requirements: v3 authoring/import coverage missing');
if (!graph.includes('bare ID') || !graph.toLowerCase().includes('layout-derived topology') || !graph.includes('exact versioned refs')) throw new Error('graph: source/pin/layout boundary missing');
if (!workflow.includes('canonical G5 inventory') || !workflow.includes('directional') || !workflow.includes('G7/G8')) throw new Error('workflow: map readiness/boundary coverage missing');
const targetPhrase = 'G5 only party';
if (architecture.includes(targetPhrase) || graph.includes(targetPhrase) || workflow.includes(targetPhrase)) throw new Error('legacy party-only G5 assertion leaked into target norms');
console.log('P02 checks passed: target/active boundary, G0–G6 ownership, data gaps, DB pins and G0–G5 workflow.');
