import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  REVIEWED_BASELINE_PATH,
  REVIEWED_BASELINE_SHA256,
  invariant,
  loadReviewedBaseline,
  sha256,
  validateP02Declaration,
  validateReviewedRegistries,
  validateReviewedSourceDigests
} from './p05-reviewed-baseline.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  invariant(process.argv[index + 1], `${name} requires a value`);
  return process.argv[index + 1];
};
const root = path.resolve(argument('--root', '.'));
const freezePath = argument('--freeze', 'docs/migration/spatial-v3/normative-freeze.json');
const declarationPath = argument('--declaration', 'docs/migration/spatial-v3/evidence/p02-boundary-declaration.json');
const declarationSchemaPath = argument('--declaration-schema', 'data/contracts/spatial-v3/p02-boundary-declaration.schema.json');
const read = (relativePath) => readFile(path.resolve(root, relativePath), 'utf8');
const documents = {
  standard: 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  targetArchitecture: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md',
  targetTables: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md',
  targetGraph: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md',
  targetWorkflow: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_map_g0_g4_workflow.txt',
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

const { baseline } = await loadReviewedBaseline(root);
const currentSourceDigests = Object.fromEntries(await Promise.all(
  Object.keys(baseline.source_digests).map(async (source) => [source, sha256(await read(source))])
));
const content = Object.fromEntries(await Promise.all(Object.entries(documents).map(async ([name, source]) => [name, await read(source)])));
const matrix = JSON.parse(content.matrix);
const declarationText = await read(declarationPath);
const declarationSchemaText = await read(declarationSchemaPath);
const declaration = JSON.parse(declarationText);
const declarationSchema = JSON.parse(declarationSchemaText);
validateP02Declaration(declaration, currentSourceDigests);
validateReviewedSourceDigests(currentSourceDigests, baseline);

const contracts = [...content.standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((match) => match[1].trim()).sort();
const appendixC = content.standard.slice(content.standard.indexOf('# Приложение C.'), content.standard.indexOf('# Приложение D.'));
const errors = [...appendixC.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim()).filter((name) => name !== 'code').sort();
const conflictIds = content.conflicts.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\|\s*(NC-\d+)\s*\|/);
  return match ? [match[1]] : [];
}).sort();
const contractOwnership = matrix.contracts.map((entry) => ({
  contract_name: entry.contract_name,
  owner_package: entry.owner_package,
  json_schema_or_dto: entry.json_schema_or_dto,
  ddl_table_or_value: entry.ddl_table_or_value,
  validator: entry.validator,
  repository: entry.repository,
  tests: entry.tests,
  migration_step: entry.migration_step
})).sort((left, right) => left.contract_name.localeCompare(right.contract_name));
const errorOwnership = matrix.errors.map((entry) => ({
  error_code: entry.error_code,
  owner_package: entry.owner_package,
  json_schema_or_dto: entry.json_schema_or_dto,
  validator: entry.validator,
  tests: entry.tests,
  migration_step: entry.migration_step
})).sort((left, right) => left.error_code.localeCompare(right.error_code));
invariant(contractOwnership.every((row) => Object.values(row).every(Boolean)), 'every contract needs complete ownership evidence');
invariant(errorOwnership.every((row) => Object.values(row).every(Boolean)), 'every error needs complete ownership evidence');
validateReviewedRegistries({
  baseline,
  contracts,
  errors,
  contractOwnership,
  errorOwnership,
  conflictIds,
  conflictsText: content.conflicts
});

const targetNormative = ['targetArchitecture', 'targetTables', 'targetGraph', 'targetWorkflow', 'movement', 'time', 'formulas', 'orchestration', 'world', 'ux', 'catalog', 'navigation', 'registries'];
for (const key of targetNormative) invariant(content[key].includes('target') && content[key].includes('P28'), `${key}: target/P28 activation boundary is missing`);
for (const key of ['targetArchitecture', 'targetTables', 'targetGraph', 'targetWorkflow', 'movement', 'world']) {
  invariant(content[key].includes('G5') && content[key].includes('G6'), `${key}: G5/G6 scale boundary is missing`);
}
invariant(content.targetArchitecture.includes('canonical G0–G5') && content.targetArchitecture.includes('finite party-generated G5'), 'target architecture ownership mismatch');
invariant(content.targetGraph.includes('runtime-read-only') && content.targetGraph.includes('bare IDs'), 'target graph store/pin boundary missing');
invariant(content.targetWorkflow.includes('Containment и coordinates не заменяют edge') && content.targetWorkflow.includes('G7/G8'), 'target workflow boundary missing');
invariant(content.movement.includes('mechanical_readiness') && content.movement.includes('party_route_plan') && content.movement.includes('timed_traversal'), 'movement boundary missing');
invariant(content.time.includes('exact rational') && content.time.includes('shared_root_transport_clock'), 'time boundary missing');
invariant(content.formulas.includes('method_factor') && content.formulas.includes('explicit_additive_delays'), 'formula ownership missing');
invariant(content.orchestration.includes('single writer') && content.orchestration.includes('topology/frontier resolution'), 'orchestration boundary missing');
invariant(content.world.includes('scene_position') && content.world.includes('candidate set') && content.world.includes('NPC') && content.world.includes('items'), 'world materialization boundary missing');
invariant(content.ux.includes('hidden topology') && content.ux.includes('stranded') && content.ux.includes('diagnostics'), 'UX boundary missing');
invariant(content.catalog.includes('Name-based migration запрещён') && content.catalog.includes('not_verified'), 'catalog migration boundary missing');
invariant(content.registries.includes('Controlled-vocabulary registry plan') && content.registries.includes('controlled_vocabulary_gap'), 'vocabulary plan missing');
invariant(content.adr.includes('Dual write') && content.adr.includes('atomic') && content.adr.includes('P28'), 'ADR activation boundary missing');
invariant(!Object.values(content).some((text) => /\bactive\s+v3\b/i.test(text)), 'target documentation claims active v3');

const expected = JSON.parse(await read(freezePath));
invariant(expected.schema_version === '1.2.0', 'freeze schema must bind the independently reviewed baseline');
invariant(expected.reviewed_baseline?.path === REVIEWED_BASELINE_PATH, 'freeze reviewed baseline path mismatch');
invariant(expected.reviewed_baseline?.sha256 === REVIEWED_BASELINE_SHA256, 'freeze reviewed baseline anchor mismatch');
invariant(JSON.stringify(expected.source_digests) === JSON.stringify(currentSourceDigests), 'freeze source digest map is stale');
invariant(expected.source_standard.sha256 === sha256(content.standard), 'freeze standard digest is stale');
invariant(expected.contract_registry.names_sha256 === baseline.contract_registry.names_sha256, 'freeze contract digest is stale');
invariant(expected.typed_error_registry.names_sha256 === baseline.typed_error_registry.names_sha256, 'freeze error digest is stale');
invariant(expected.ownership_registry.contract_rows_sha256 === baseline.ownership_registry.contract_rows_sha256, 'freeze contract ownership digest is stale');
invariant(expected.ownership_registry.error_rows_sha256 === baseline.ownership_registry.error_rows_sha256, 'freeze error ownership digest is stale');
invariant(expected.conflict_registry.ids_sha256 === baseline.conflict_registry.ids_sha256 && expected.conflict_registry.open_findings === 0, 'freeze conflict evidence is stale');
invariant(expected.active_target_boundary.declaration_sha256 === sha256(declarationText), 'freeze P02 declaration digest is stale');
invariant(expected.active_target_boundary.schema_sha256 === sha256(declarationSchemaText), 'freeze P02 schema digest is stale');
for (const [field, value] of Object.entries({
  active_owner: 'v2',
  target_status: 'inactive_until_P28',
  production_read: 'v2_only',
  production_write: 'v2_only'
})) {
  invariant(declarationSchema.properties?.[field]?.const === value, `P02 schema ${field} is not closed`);
  invariant(expected.active_target_boundary[field] === value, `freeze P02 ${field} is stale`);
}
invariant(expected.active_target_boundary.document_pair_count === 4, 'freeze P02 pair count is stale');
invariant(expected.zero_findings_evidence.open_findings === 0, 'freeze contains open findings');

console.log('P05 checks passed: independently anchored 24-source baseline, exact P02 pairs, contract/error/owner/conflict audit and zero findings.');
