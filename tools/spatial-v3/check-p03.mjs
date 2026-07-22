import { readFile } from 'node:fs/promises';

const files = {
  movement: 'data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt',
  time: 'data/knowledge-source/corpus/DOCUMENTS/time_system.txt',
  formulas: 'data/knowledge-source/corpus/DOCUMENTS/formulas.md',
  orchestration: 'data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt'
};
const docs = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));
for (const [key, text] of Object.entries(docs)) {
  if (!text.includes('target') || !text.includes('P28') || !text.includes('v2')) throw new Error(`${key}: active/target boundary missing`);
}
for (const token of ['movement_endpoint_ref', 'scene_position', 'requires_frontier_resolution', 'requires_preparation', 'party_route_plan', 'stranded']) {
  if (!docs.movement.includes(token)) throw new Error(`movement: ${token} missing`);
}
for (const token of ['exact rational', 'direct_party_clock', 'shared_root_transport_clock', 'synchronized', 'whole_minute_index']) {
  if (!docs.time.includes(token)) throw new Error(`time: ${token} missing`);
}
for (const token of ['method_factor', 'environment_factor', 'explicit_additive_delays', 'occurrence_key', 'time_factor_invalid']) {
  if (!docs.formulas.includes(token)) throw new Error(`formulas: ${token} missing`);
}
for (const token of ['topology/frontier resolution', 'target preparation', 'single writer', 'immediate_action', 'timed_activity', 'timed_traversal']) {
  if (!docs.orchestration.includes(token)) throw new Error(`orchestration: ${token} missing`);
}
if (docs.formulas.includes('× погод') || docs.formulas.includes('travel multiplier')) throw new Error('formulas: legacy multiplier duplication found');
if (!docs.movement.includes('не хранится как generic `current_position`')) throw new Error('movement: v3 replacement for generic current_position missing');
console.log('P03 checks passed: v3 movement, exact time, formula ownership and explicit orchestration boundary.');
