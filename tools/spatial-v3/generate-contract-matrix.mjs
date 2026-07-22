import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const standardPath = resolve(root, 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md');
const matrixPath = resolve(root, 'docs/migration/spatial-v3/contract-implementation-matrix.json');
const summaryPath = resolve(root, 'docs/migration/spatial-v3/contract-implementation-matrix.md');
const standard = await readFile(standardPath, 'utf8');

function ownerFor(name) {
  if (/^(world_|g[0-5]_)/.test(name)) return '@rus/world-base';
  if (/(route|movement|segment|journey|traversal|direction)/.test(name)) return '@rus/movement-routes';
  if (/(scene|g6|position|visibility|acoustic|carrier|attachment|transport)/.test(name)) return '@rus/space-map';
  if (/(plan|execution|location|history|change_set|reservation)/.test(name)) return '@rus/party-store';
  return '@rus/materialization';
}

const contracts = [...standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)]
  .map((match) => match[1].trim())
  .sort((a, b) => a.localeCompare(b));
const errorSection = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const errors = [...errorSection.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)]
  .map((match) => match[1].trim())
  .filter((name) => name !== 'code')
  .sort((a, b) => a.localeCompare(b));

if (new Set(contracts).size !== 160 || contracts.length !== 160) throw new Error(`Expected 160 unique contracts, got ${contracts.length}/${new Set(contracts).size}`);
if (new Set(errors).size !== 58 || errors.length !== 58) throw new Error(`Expected 58 unique errors, got ${errors.length}/${new Set(errors).size}`);

const matrix = {
  schema_version: '1.0.0',
  source_standard: 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  source_version: '4.2.0',
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
  `- Contracts: ${matrix.contracts.length}/160; errors: ${matrix.errors.length}/58.`,
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
await mkdir(dirname(matrixPath), { recursive: true });
await writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
await writeFile(summaryPath, `${summary}\n`, 'utf8');
