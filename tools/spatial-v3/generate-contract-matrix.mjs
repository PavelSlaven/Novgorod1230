import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const specificationsPath = resolve(root, 'packages/contracts/src/spatial-v3/specifications.json');
const errorsPath = resolve(root, 'packages/contracts/src/spatial-v3/typed-error-specifications.json');
const matrixPath = resolve(root, 'docs/migration/spatial-v3/contract-implementation-matrix.json');
const summaryPath = resolve(root, 'docs/migration/spatial-v3/contract-implementation-matrix.md');
const check = process.argv.includes('--check');
const specifications = JSON.parse(await readFile(specificationsPath, 'utf8'));
const typedErrors = JSON.parse(await readFile(errorsPath, 'utf8'));

const temporalContracts = new Set([
  'rational_minutes', 'rational_quantity', 'game_timestamp', 'elapsed_time', 'calendar_profile_ref', 'runtime_calendar_snapshot',
  'activity_profile_ref', 'activity_completion_model_snapshot', 'activity_progress_snapshot', 'participant_binding', 'resource_binding',
  'timed_activity_static_snapshot', 'party_timed_activity_execution', 'party_timed_activity_attempt', 'temporal_boundary_provider_input',
  'temporal_boundary_candidate', 'temporal_resolution_policy_ref', 'temporal_boundary_batch', 'time_slice_plan', 'time_slice_result',
  'temporal_advance_request', 'temporal_advance_result', 'interruption_outcome', 'perception_result', 'npc_decision_option',
  'npc_decision_request', 'npc_decision_trace', 'propagation_process_ref', 'remote_aggregate_state', 'remote_catch_up_request',
  'remote_catch_up_result', 'visible_package_persistence_envelope', 'combined_write_plan', 'party_traversal_interval_result',
  'synchronized_time_slice_result'
]);
const temporalPartyRuntimeContracts = new Set([
  'party_timed_activity_execution', 'party_timed_activity_attempt', 'time_slice_result', 'perception_result', 'npc_decision_trace',
  'propagation_process_ref', 'remote_aggregate_state', 'visible_package_persistence_envelope', 'combined_write_plan',
  'synchronized_time_slice_result'
]);

function ownerFor(name) {
  if (name === 'party_traversal_interval_result') return '@rus/movement-routes';
  if (temporalPartyRuntimeContracts.has(name)) return '@rus/party-store';
  if (temporalContracts.has(name)) return '@rus/contracts';
  if (/^(world_|g[0-5]_)/.test(name)) return '@rus/world-base';
  if (/(route|movement|segment|journey|traversal|direction)/.test(name)) return '@rus/movement-routes';
  if (/(scene|g6|position|visibility|acoustic|carrier|attachment|transport)/.test(name)) return '@rus/space-map';
  if (/(plan|execution|location|history|change_set|reservation)/.test(name)) return '@rus/party-store';
  return '@rus/materialization';
}

const contracts = specifications.specifications
  .map(({ contract_name }) => contract_name)
  .sort((a, b) => a.localeCompare(b));
const errors = typedErrors.errors
  .map(({ error_code }) => error_code)
  .sort((a, b) => a.localeCompare(b));

if (new Set(contracts).size !== 188 || contracts.length !== 188) throw new Error(`Expected 188 unique contracts, got ${contracts.length}/${new Set(contracts).size}`);
if (new Set(errors).size !== 82 || errors.length !== 82) throw new Error(`Expected 82 unique errors, got ${errors.length}/${new Set(errors).size}`);

const matrix = {
  schema_version: '1.0.0',
  source_standard: specifications.source,
  source_amendment: specifications.amendment_source,
  source_version: specifications.source_version,
  activation_status: 'target',
  contracts: contracts.map((contract_name) => ({
    contract_name,
    owner_package: ownerFor(contract_name),
    json_schema_or_dto: 'planned/P06+',
    ddl_table_or_value: 'planned/P09+',
    validator: 'planned/P06+',
    repository: 'planned/P13+',
    tests: 'planned/P06+',
    migration_step: 'planned/P06-P25'
  })),
  errors: errors.map((error_code) => ({
    error_code,
    owner_package: '@rus/contracts',
    json_schema_or_dto: 'planned/P06+',
    validator: 'planned/P06+',
    tests: 'planned/P06+',
    migration_step: 'planned/P06-P25'
  }))
};
const owners = Object.groupBy(matrix.contracts, ({ owner_package }) => owner_package);
const summary = [
  '# Матрица реализации контрактов Spatial v3',
  '',
  'Статус: `target`; записи являются обязательным планом владения, не утверждением о существующей реализации.',
  '',
  `- Contracts: ${matrix.contracts.length}/188; errors: ${matrix.errors.length}/82.`,
  '- Каждый contract и error имеет ровно одного planned owner; все implementation fields привязаны к последующим шагам плана.',
  '',
  '## Распределение контрактов',
  '',
  '| Owner package | Contracts |',
  '|---|---:|',
  ...Object.entries(owners).sort().map(([owner, entries]) => `| \`${owner}\` | ${entries.length} |`),
  '',
  'Полная machine-reviewable запись: `contract-implementation-matrix.json`.'
].join('\n');

async function writeArtifact(path, content) {
  if (check) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== content) throw new Error(`${path} is stale; run ${process.argv[1]}`);
    return;
  }
  await writeFile(path, content, 'utf8');
}

await mkdir(dirname(matrixPath), { recursive: true });
await writeArtifact(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
await writeArtifact(summaryPath, `${summary}\n`);
