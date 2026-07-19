import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const documents = {
  standard: 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  adr: 'docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md',
  conflicts: 'docs/migration/spatial-v3/normative-conflicts.md',
  matrix: 'docs/migration/spatial-v3/contract-implementation-matrix.json',
  registries: 'docs/migration/spatial-v3/target-registries.md',
  architecture: 'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md',
  tables: 'data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md',
  graph: 'data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md',
  workflow: 'data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt',
  movement: 'data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt',
  time: 'data/knowledge-source/corpus/DOCUMENTS/time_system.txt',
  formulas: 'data/knowledge-source/corpus/DOCUMENTS/formulas.md',
  orchestration: 'data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt',
  world: 'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  ux: 'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  catalog: 'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md',
  navigation: 'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md'
};
const content = Object.fromEntries(await Promise.all(Object.entries(documents).map(async ([name, path]) => [name, await read(path)])));
const matrix = JSON.parse(content.matrix);
const contracts = [...content.standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((match) => match[1].trim()).sort();
const appendixC = content.standard.slice(content.standard.indexOf('# Приложение C.'), content.standard.indexOf('# Приложение D.'));
const errors = [...appendixC.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim()).filter((name) => name !== 'code').sort();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

assert(contracts.length === 160 && new Set(contracts).size === 160, 'standard must contain 160 unique implementation contracts');
assert(errors.length === 58 && new Set(errors).size === 58, 'standard must contain 58 unique typed errors');
assert(sameSet(contracts, matrix.contracts.map((item) => item.contract_name).sort()), 'matrix contract names must exactly equal Appendix B');
assert(sameSet(errors, matrix.errors.map((item) => item.error_code).sort()), 'matrix error names must exactly equal Appendix C');
assert(matrix.contracts.every((item) => ['owner_package', 'json_schema_or_dto', 'ddl_table_or_value', 'validator', 'repository', 'tests', 'migration_step'].every((field) => item[field])), 'every contract needs complete ownership evidence');
assert(matrix.errors.every((item) => ['owner_package', 'json_schema_or_dto', 'validator', 'tests', 'migration_step'].every((field) => item[field])), 'every error needs complete ownership evidence');

const normative = ['architecture', 'tables', 'graph', 'workflow', 'movement', 'time', 'formulas', 'orchestration', 'world', 'ux', 'catalog', 'navigation', 'registries'];
for (const key of normative) {
  assert(content[key].includes('target') && content[key].includes('P28'), `${key}: target/P28 activation boundary is missing`);
}
for (const key of ['architecture', 'tables', 'graph', 'workflow', 'movement', 'world']) {
  assert(content[key].includes('G5') && content[key].includes('G6'), `${key}: G5/G6 scale boundary is missing`);
}
assert(content.architecture.includes('canonical G0–G5') && content.architecture.includes('finite party-generated G5'), 'architecture: canonical/generated G5 ownership mismatch');
assert(content.graph.includes('runtime-read-only') && content.graph.includes('bare IDs'), 'graph: store/pin boundary missing');
assert(content.workflow.includes('Containment и coordinates не заменяют edge') && content.workflow.includes('G7/G8'), 'workflow: containment/topology or level boundary missing');
assert(content.movement.includes('mechanical_readiness') && content.movement.includes('party_route_plan') && content.movement.includes('timed_traversal'), 'movement: readiness/plan/transition boundary missing');
assert(content.time.includes('exact rational') && content.time.includes('shared_root_transport_clock'), 'time: exact/synchronized clock boundary missing');
assert(content.formulas.includes('method_factor') && content.formulas.includes('explicit_additive_delays'), 'formulas: factor/delay ownership missing');
assert(content.orchestration.includes('single writer') && content.orchestration.includes('topology/frontier resolution'), 'orchestration: separate proposal/commit boundary missing');
assert(content.world.includes('scene_position') && content.world.includes('candidate set') && content.world.includes('NPC') && content.world.includes('items'), 'world: position or bounded materialization boundary missing');
assert(content.ux.includes('hidden topology') && content.ux.includes('stranded') && content.ux.includes('diagnostics'), 'ux: hidden-information/interruption boundary missing');
assert(content.catalog.includes('Name-based migration запрещён') && content.catalog.includes('not_verified'), 'catalog: migration gap boundary missing');
assert(content.registries.includes('Controlled-vocabulary registry plan') && content.registries.includes('controlled_vocabulary_gap'), 'registries: vocabulary freeze plan missing');

const conflictRows = content.conflicts.split(/\r?\n/).filter((line) => /^\| NC-\d+ /.test(line));
assert(conflictRows.length === 10 && conflictRows.every((line) => line.split('|').length === 8), 'conflict register must have 10 complete rows');
assert(!/решить позднее|\bopen\b/i.test(content.conflicts), 'conflict register contains an unresolved finding');
assert(content.adr.includes('Dual write') && content.adr.includes('atomic') && content.adr.includes('P28'), 'ADR: atomic no-dual-write activation boundary missing');
assert(!Object.values(content).some((text) => /\bactive\s+v3\b/i.test(text)), 'target documentation must not claim active v3');

const expected = JSON.parse(await read('docs/migration/spatial-v3/normative-freeze.json'));
assert(expected.contract_registry.count === 160 && expected.typed_error_registry.count === 58, 'freeze totals are invalid');
assert(expected.source_standard.sha256 === sha256(content.standard), 'freeze standard digest is stale');
assert(expected.contract_registry.names_sha256 === sha256(JSON.stringify(contracts)), 'freeze contract digest is stale');
assert(expected.typed_error_registry.names_sha256 === sha256(JSON.stringify(errors)), 'freeze typed-error digest is stale');
assert(expected.zero_findings_evidence.open_findings === 0, 'freeze contains open normative findings');
console.log('P05 checks passed: complete cross-document contract/error/owner audit and zero unresolved normative findings.');
