import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const standardPath = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const matrixPath = 'docs/migration/spatial-v3/contract-implementation-matrix.json';

const exists = async (path) => access(path, fsConstants.F_OK).then(() => true, () => false);
const unique = (values) => [...new Set(values)];

export const targetArtifactPaths = Object.freeze({
  contractRegistry: 'packages/contracts/src/spatial-v3/registry.js',
  ddlRegistry: 'infra/spatial-v3/ddl-registry.json',
  stateMachineRegistry: 'packages/contracts/src/spatial-v3/state-machines.js',
  compatibilityBoundary: 'packages/contracts/src/spatial-v3/compatibility.js'
});

export function parseAppendixA(standard) {
  const appendix = standard.slice(standard.indexOf('# Приложение A.'), standard.indexOf('# Приложение B.'));
  if (!appendix.startsWith('# Приложение A.')) throw new Error('Appendix A is missing from the canonical standard');
  const section = (start, end) => appendix.slice(appendix.indexOf(start), appendix.indexOf(end, appendix.indexOf(start)));
  const execution = section('### A.4.1.', '### A.4.2.');
  const eventMapping = section('### A.4.2.', '## A.5.');
  const tableRows = (text) => text.split(/\r?\n/)
    .filter((line) => /^\|/.test(line) && !/^\|\s*`?(From|event_kind)`?\s*\|/.test(line) && !/^\|\s*-+/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', '')));
  const vocab = (heading, nextHeading) => {
    const body = section(heading, nextHeading);
    const match = body.match(/```text\r?\n([\s\S]*?)```/);
    if (!match) throw new Error(`${heading} vocabulary block is missing`);
    return match[1].split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  };
  return {
    executionTransitions: tableRows(execution).map(([from, to, gate]) => ({ from, to, gate })),
    executionEvents: tableRows(eventMapping).map(([eventKind, rule]) => ({ eventKind, rule })),
    travelStatuses: vocab('## A.5.', '## A.6.'),
    activityStatuses: vocab('## A.6.', '## A.7.'),
    readinessStatuses: vocab('## A.7.', '## A.8.'),
    frontierStatuses: ['open', 'consumed', 'closed'],
    claimStatuses: vocab('## A.14.', '## A.15.')
  };
}

export async function loadCanonicalTarget() {
  const [standard, matrixText] = await Promise.all([readFile(standardPath, 'utf8'), readFile(matrixPath, 'utf8')]);
  const matrix = JSON.parse(matrixText);
  const contracts = unique([...standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((match) => match[1].trim())).sort();
  const appendixC = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
  const errors = unique([...appendixC.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim()).filter((name) => name !== 'code')).sort();
  if (contracts.length !== 160 || errors.length !== 58) throw new Error('Canonical P05 totals changed; rerun the normative freeze before P06');
  if (matrix.contracts.length !== 160 || matrix.errors.length !== 58) throw new Error('Contract implementation matrix no longer matches the frozen canonical target');
  return { contracts, errors, stateMachines: parseAppendixA(standard) };
}

async function loadJsonModule(path) {
  if (!(await exists(path))) return { path, missing: true, value: null };
  try {
    return { path, missing: false, value: JSON.parse(await readFile(path, 'utf8')) };
  } catch (error) {
    return { path, missing: false, value: null, error: error.message };
  }
}

async function loadModule(path) {
  if (!(await exists(path))) return { path, missing: true, value: null };
  try {
    return { path, missing: false, value: await import(`../../${path}`) };
  } catch (error) {
    return { path, missing: false, value: null, error: error.message };
  }
}

export async function collectConformanceReport() {
  const target = await loadCanonicalTarget();
  const [contractRegistry, ddlRegistry] = await Promise.all([
    loadModule(targetArtifactPaths.contractRegistry),
    loadJsonModule(targetArtifactPaths.ddlRegistry)
  ]);
  const contractDefinitions = contractRegistry.value?.contractDefinitions ?? [];
  const typedErrorDefinitions = contractRegistry.value?.typedErrorDefinitions ?? [];
  const ddlDefinitions = ddlRegistry.value?.contracts ?? [];
  const names = (values, key) => new Set(values.map((value) => value?.[key]).filter(Boolean));
  const missing = (expected, actual) => expected.filter((value) => !actual.has(value));
  return {
    target,
    artifacts: { contractRegistry, ddlRegistry },
    missing: {
      jsonSchemaOrDto: missing(target.contracts, names(contractDefinitions, 'contract_name')),
      validator: missing(target.contracts, names(contractDefinitions.filter((definition) => definition?.validate), 'contract_name')),
      ddl: missing(target.contracts, names(ddlDefinitions, 'contract_name')),
      typedError: missing(target.errors, names(typedErrorDefinitions, 'error_code'))
    }
  };
}

export async function collectStateMachineReport() {
  const target = await loadCanonicalTarget();
  const registry = await loadModule(targetArtifactPaths.stateMachineRegistry);
  const definitions = registry.value?.stateMachineDefinitions;
  return { target, artifact: registry, definitions };
}

export async function collectCompatibilityReport() {
  const artifact = await loadModule(targetArtifactPaths.compatibilityBoundary);
  return { artifact, validateRuntimeComposition: artifact.value?.validateRuntimeComposition };
}

export const compatibilityFixtures = Object.freeze([
  { name: 'storage coexistence without runtime mixing', input: { storage_versions: [2, 3], request_schema_version: 2, reader_schema_version: 2, writer_schema_version: 2 }, valid: true },
  { name: 'v2 request cannot write v3', input: { storage_versions: [2, 3], request_schema_version: 2, reader_schema_version: 2, writer_schema_version: 3 }, valid: false },
  { name: 'v3 request cannot fall back to v2', input: { storage_versions: [2, 3], request_schema_version: 3, reader_schema_version: 2, writer_schema_version: 3, fallback_schema_version: 2 }, valid: false },
  { name: 'v3 flow cannot use v2 current_position', input: { storage_versions: [2, 3], request_schema_version: 3, reader_schema_version: 3, writer_schema_version: 3, current_position_contract: 'v2' }, valid: false },
  { name: 'active v2 composition cannot read v3 target records', input: { storage_versions: [2, 3], request_schema_version: 2, reader_schema_version: 3, writer_schema_version: 2, target_records_schema_version: 3 }, valid: false }
]);
