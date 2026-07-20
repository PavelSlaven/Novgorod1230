import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldBaseSchemaReference } from '../../scripts/generate-world-base-schema-reference.mjs';
import vocabularyRegistry from '../../data/contracts/spatial-v3/controlled-vocabularies.v1.json' with { type: 'json' };
import bundleSchema from '../../data/contracts/spatial-v3/world-base-authoring-bundle.schema.json' with { type: 'json' };
import { proveExpansionCapacity } from './p11-capacity-proof.mjs';
import { validateP12SourceApproval } from './p12-source-approval.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const REGISTRY = 'data/contracts/spatial-v3/world-base-import-registry.v1.json';
const DEFAULT_MANIFEST = 'data/world-catalogs/novgorod/spatial-v3/manifest.json';

export async function validateAuthoringBundle({ root = ROOT, manifestPath = DEFAULT_MANIFEST } = {}) {
  const projectRoot = resolve(root);
  const manifestFile = resolve(projectRoot, manifestPath);
  const manifest = await json(manifestFile);
  const registry = await json(resolve(projectRoot, REGISTRY));
  const ddl = await buildWorldBaseSchemaReference({ root: projectRoot });
  const tableSchemas = new Map(ddl.schema.tables.map((table) => [table.name, table]));
  const errors = [], gaps = [], datasets = new Map(), tables = new Set();
  const sourceApproval = await validateP12SourceApproval({ root: projectRoot });
  for (const sourceError of sourceApproval.errors) errors.push(issue('P12_SOURCE_APPROVAL_INVALID', `${sourceError.code}:${sourceError.subject_ref}`));
  for (const violation of validateJsonSchema(bundleSchema, manifest)) errors.push(issue('SCHEMA_VALIDATION_FAILED', violation));
  if (manifest.schema_version !== 'rus.spatial-v3.world-base-authoring-bundle.v1' || !text(manifest.bundle_id) || !text(manifest.world_revision_id) || !text(manifest.provenance_ref) || !['draft', 'approved'].includes(manifest.status)) errors.push(issue('INVALID_MANIFEST', 'manifest'));
  if (manifest.delete_policy !== registry.delete_policy || !Array.isArray(manifest.datasets) || !Array.isArray(manifest.data_gaps)) errors.push(issue('INVALID_MANIFEST', 'manifest'));
  for (const gap of manifest.data_gaps ?? []) {
    if (!/^[A-Z0-9_]+$/u.test(gap.code ?? '') || !text(gap.subject_ref) || !Array.isArray(gap.dependency_pins) || !gap.dependency_pins.length || gap.blocking !== true) errors.push(issue('INVALID_DATA_GAP', gap.subject_ref ?? 'unknown'));
    else gaps.push(Object.freeze(gap));
  }
  for (const dataset of manifest.datasets ?? []) {
    if (!registry.allowlist.includes(dataset.table) || registry.party_instance_prefixes.some((prefix) => String(dataset.table).startsWith(prefix))) { errors.push(issue('UNKNOWN_OR_PARTY_TABLE', dataset.table ?? 'unknown')); continue; }
    if (tables.has(dataset.table)) errors.push(issue('DUPLICATE_DATASET_TABLE', dataset.table)); tables.add(dataset.table);
    if (dataset.delete_policy !== registry.delete_policy || !['draft', 'approved'].includes(dataset.status) || !text(dataset.provenance_ref) || !Array.isArray(dataset.depends_on)) errors.push(issue('INVALID_DATASET_METADATA', dataset.table));
    const file = resolve(dirname(manifestFile), dataset.file ?? '');
    if (!descendant(file, dirname(manifestFile))) { errors.push(issue('DATASET_PATH_ESCAPE', dataset.table)); continue; }
    let content; try { content = await readFile(file); } catch { errors.push(issue('MISSING_DATASET_FILE', dataset.table)); continue; }
    if (digest(content) !== dataset.sha256) { errors.push(issue('DATASET_DIGEST_MISMATCH', dataset.table)); continue; }
    let rows; try { rows = JSON.parse(content); } catch { errors.push(issue('INVALID_DATASET_JSON', dataset.table)); continue; }
    if (!Array.isArray(rows)) { errors.push(issue('INVALID_DATASET_ROWS', dataset.table)); continue; }
    const tableSchema = tableSchemas.get(dataset.table);
    if (!tableSchema) { errors.push(issue('UNKNOWN_OR_PARTY_TABLE', dataset.table)); continue; }
    const rowKeys = new Set();
    for (const row of rows) {
      const subject = row?.id ?? dataset.table;
      validateStrictRow(row, tableSchema, dataset.table, errors);
      const key = tableSchema.columns.filter((column) => column.primary_key).map((column) => row?.[column.name]).join('|');
      if (key && rowKeys.has(key)) errors.push(issue('DUPLICATE_RECORD_ID', `${dataset.table}:${key}`)); else rowKeys.add(key);
      if (row?.delete === true) errors.push(issue('DELETE_POLICY_FORBIDDEN', `${dataset.table}:${subject}`));
    }
    datasets.set(dataset.table, rows);
  }
  validateReferences(manifest.datasets ?? [], datasets, errors);
  validateRegistryOrder(manifest.datasets ?? [], registry, errors);
  validateReadiness(datasets, gaps, errors, manifest.bundle_kind);
  validateRouteTopology(datasets, errors);
  validateControlledVocabularyBindings(datasets, errors);
  validateCapacityProof(datasets, errors);
  return Object.freeze({ ok: errors.length === 0 && gaps.length === 0, manifest: relative(projectRoot, manifestFile).replaceAll('\\', '/'), errors: Object.freeze(errors), data_gaps: Object.freeze(gaps), dataset_counts: Object.freeze(Object.fromEntries([...datasets].map(([table, rows]) => [table, rows.length]))), source_approval: sourceApproval });
}

export async function buildStagedDryRunSql({ root = ROOT, manifestPath = DEFAULT_MANIFEST } = {}) {
  return buildTransactionalImportSql({ root, manifestPath, rollback: true, allowTypedGaps: true });
}

export async function buildTransactionalImportSql({ root = ROOT, manifestPath = DEFAULT_MANIFEST, rollback = false, allowTypedGaps = false } = {}) {
  const projectRoot = resolve(root); const manifestFile = resolve(projectRoot, manifestPath);
  const result = await validateAuthoringBundle({ root: projectRoot, manifestPath });
  if (result.errors.length || (!allowTypedGaps && result.data_gaps.length)) throw new Error(`P12 import refuses incomplete bundle: ${[...result.errors, ...result.data_gaps].map((error) => error.code).join(', ')}`);
  const manifest = await json(manifestFile); const ddl = await buildWorldBaseSchemaReference({ root: projectRoot });
  const tables = new Map(ddl.schema.tables.map((table) => [table.name, table])); const sql = ['BEGIN;'];
  for (const dataset of manifest.datasets) {
    const rows = await json(resolve(dirname(manifestFile), dataset.file)); const schema = tables.get(dataset.table);
    let primaryKey = schema.columns.filter((column) => column.primary_key);
    if (!primaryKey.length) {
      const declaration = schema.constraints.find((constraint) => /^PRIMARY KEY\s*\(/iu.test(constraint));
      const names = declaration?.match(/^PRIMARY KEY\s*\(([^)]+)\)/iu)?.[1].split(',').map((name) => name.trim()) ?? [];
      primaryKey = names.map((name) => schema.columns.find((column) => column.name === name)).filter(Boolean);
    }
    if (!primaryKey.length) throw new Error(`P12 import requires a primary key: ${dataset.table}`);
    const candidateTable = `p12_candidate_${dataset.table}`;
    const serverManaged = schema.columns.filter((column) => ['created_at', 'updated_at'].includes(column.name)).map((column) => column.name);
    const canonicalJson = (alias) => serverManaged.length
      ? `(to_jsonb(${alias}) - ARRAY[${serverManaged.map((column) => `'${column}'`).join(', ')}]::text[])`
      : `to_jsonb(${alias})`;
    sql.push(`CREATE TEMP TABLE ${candidateTable} (LIKE world_base.${dataset.table} INCLUDING DEFAULTS) ON COMMIT DROP;`);
    for (const row of rows) {
      const columns = schema.columns.filter((column) => Object.hasOwn(row, column.name));
      const values = new Map(columns.map((column) => [column.name, literal(row[column.name], column.type)]));
      const keyPredicate = primaryKey.map((column) => `${column.name} IS NOT DISTINCT FROM ${values.get(column.name)}`).join(' AND ');
      const actualKeyPredicate = primaryKey.map((column) => `actual.${column.name} IS NOT DISTINCT FROM ${values.get(column.name)}`).join(' AND ');
      sql.push(
        `TRUNCATE ${candidateTable};`,
        `INSERT INTO ${candidateTable} (${columns.map((column) => column.name).join(', ')}) VALUES (${columns.map((column) => values.get(column.name)).join(', ')});`,
        `DO $p12_import$ BEGIN`,
        `  IF EXISTS (SELECT 1 FROM world_base.${dataset.table} WHERE ${keyPredicate}) THEN`,
        `    IF NOT EXISTS (SELECT 1 FROM world_base.${dataset.table} AS actual CROSS JOIN ${candidateTable} AS expected WHERE ${actualKeyPredicate} AND ${canonicalJson('actual')} = ${canonicalJson('expected')}) THEN`,
        `      RAISE EXCEPTION 'P12_EXISTING_ROW_MISMATCH:${dataset.table}';`,
        `    END IF;`,
        `  ELSE`,
        `    INSERT INTO world_base.${dataset.table} (${columns.map((column) => column.name).join(', ')}) VALUES (${columns.map((column) => values.get(column.name)).join(', ')});`,
        `  END IF;`,
        `END $p12_import$;`
      );
    }
    sql.push(`SELECT '${dataset.table}' AS table_name, count(*) AS imported_rows FROM world_base.${dataset.table};`);
  }
  sql.push(rollback ? 'ROLLBACK;' : 'COMMIT;'); return `${sql.join('\n')}\n`;
}

function validateReferences(manifest, datasets, errors) {
  for (let index = 0; index < manifest.length; index += 1) for (const dependency of manifest[index].depends_on ?? []) {
    const dependencyIndex = manifest.findIndex((candidate) => candidate.table === dependency);
    if (!datasets.has(dependency) || dependency === manifest[index].table) errors.push(issue('DANGLING_DATASET_DEPENDENCY', `${manifest[index].table}->${dependency}`));
    else if (dependencyIndex >= index) errors.push(issue('INVALID_DATASET_ORDER', `${manifest[index].table}->${dependency}`));
  }
}

function validateRegistryOrder(datasets, registry, errors) { const rank = new Map(registry.dependency_order.flat().map((table, index) => [table, index])); for (let index = 1; index < datasets.length; index += 1) if ((rank.get(datasets[index - 1].table) ?? -1) > (rank.get(datasets[index].table) ?? Number.MAX_SAFE_INTEGER)) errors.push(issue('INVALID_DATASET_ORDER', datasets[index].table)); }
function validateStrictRow(row, schema, table, errors) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(issue('INVALID_DATASET_ROW', table)); return; }
  const columns = new Map(schema.columns.map((column) => [column.name, column]));
  for (const key of Object.keys(row)) if (!columns.has(key)) errors.push(issue('UNKNOWN_ROW_FIELD', `${table}.${key}`));
  for (const column of schema.columns) if (!column.nullable && column.default === null && !Object.hasOwn(row, column.name)) errors.push(issue('MISSING_REQUIRED_FIELD', `${table}.${column.name}`));
  for (const column of schema.columns) if (column.name.endsWith('_id') && columns.has(`${column.name.slice(0, -3)}_version`) && Object.hasOwn(row, column.name)) {
    const versionValue = row[`${column.name.slice(0, -3)}_version`];
    if ((row[column.name] === null) !== (versionValue === null) || (row[column.name] !== null && !Number.isInteger(versionValue))) errors.push(issue('UNPINNED_VERSIONED_REFERENCE', `${table}.${column.name}`));
  }
  if (Object.hasOwn(row, 'provenance_ref') && !text(row.provenance_ref)) errors.push(issue('INVALID_PROVENANCE', table));
  if (Object.hasOwn(row, 'references') || Object.hasOwn(row, 'children') || Object.hasOwn(row, 'candidates')) errors.push(issue('NON_NORMALIZED_REFERENCE', table));
}

function validateReadiness(datasets, gaps, errors, bundleKind) {
  const count = (table) => datasets.get(table)?.length ?? 0;
  const hasGap = (code) => gaps.some((gap) => gap.code === code);
  for (const [table, rows] of datasets) {
    if (table === 'spatial_v3_scene_endpoint_slots') unique(rows, (row) => `${row.scene_template_id}:${row.scene_template_version}:${row.slot_key}`, 'SCENE_SLOT_DUPLICATE', errors);
    if (table === 'spatial_v3_world_route_points') contiguous(rows, 'world_route_id', 'ordinal', 'ROUTE_CONTINUITY_GAP', errors);
    if (table === 'spatial_v3_expansion_profile_template_limits') for (const row of rows) if (!Number.isInteger(row.max_instances) || row.max_instances < 1) errors.push(issue('CAPACITY_PROOF_FAILED', `${table}:${row.id}`));
    if (table === 'spatial_v3_controlled_vocabulary_bindings') for (const row of rows) if (!/^[a-f0-9]{64}$/u.test(row.registry_digest ?? '')) errors.push(issue('CONTROLLED_VOCABULARY_GAP', `${table}:${row.id}`));
  }
  const required = bundleKind === 'dependency_closure'
    ? [['spatial_v3_nodes', 'CANONICAL_G5_INVENTORY_DATA_GAP']]
    : [['spatial_v3_nodes', 'CANONICAL_G5_INVENTORY_DATA_GAP'], ['spatial_v3_g4_directional_exits', 'DIRECTIONAL_EXIT_READINESS_DATA_GAP'], ['spatial_v3_world_routes', 'ROUTE_BINDING_DATA_GAP'], ['spatial_v3_scene_materialization_profiles', 'APPROVED_PROFILE_DATA_GAP']];
  for (const [table, gap] of required) if (count(table) === 0 && !hasGap(gap)) errors.push(issue('MISSING_TYPED_DATA_GAP', table));
}

function validateControlledVocabularyBindings(datasets, errors) {
  for (const row of datasets.get('spatial_v3_controlled_vocabulary_bindings') ?? []) {
    const expected = vocabularyRegistry.vocabularies.find((item) => item.pseudo_type === row.pseudo_type);
    if (!expected || row.registry_id !== expected.registry_id || row.registry_path !== expected.path || row.registry_version !== expected.version || row.registry_digest !== expected.digest || row.status !== 'approved') errors.push(issue('CONTROLLED_VOCABULARY_GAP', `spatial_v3_controlled_vocabulary_bindings:${row.pseudo_type}`));
  }
}

function validateCapacityProof(datasets, errors) {
  const slots = datasets.get('spatial_v3_expansion_slots') ?? []; const limits = datasets.get('spatial_v3_expansion_profile_template_limits') ?? []; const candidates = datasets.get('spatial_v3_expansion_slot_templates') ?? [];
  if (!slots.length && !limits.length && !candidates.length) return;
  const allowed = new Map(slots.map((slot) => [`${slot.id}:${slot.version}`, candidates.filter((candidate) => candidate.slot_id === slot.id && candidate.slot_version === slot.version).map((candidate) => `${candidate.template_id}:${candidate.template_version}`)]));
  const proof = proveExpansionCapacity({ slots: slots.map((slot) => ({ id: `${slot.id}:${slot.version}`, maxInstances: slot.max_instances })), limits: limits.map((limit) => ({ template: `${limit.template_id}:${limit.template_version}`, maxCount: limit.max_instances })), allowed });
  if (!proof.ok) errors.push(issue('CAPACITY_PROOF_FAILED', proof.reason ?? 'expansion'));
}

function validateRouteTopology(datasets, errors) {
  const routes = datasets.get('spatial_v3_world_routes') ?? []; const points = datasets.get('spatial_v3_world_route_points') ?? []; const segments = datasets.get('spatial_v3_world_route_segments') ?? []; const contexts = datasets.get('spatial_v3_world_route_segment_spatial_contexts') ?? []; const endpoints = datasets.get('spatial_v3_world_route_endpoint_bindings') ?? []; const exits = datasets.get('spatial_v3_g4_directional_exits') ?? []; const nodes = datasets.get('spatial_v3_nodes') ?? [];
  for (const route of routes) {
    const routePoints = points.filter((point) => point.world_route_id === route.id && point.world_route_version === route.version); const routeSegments = segments.filter((segment) => segment.world_route_id === route.id && segment.world_route_version === route.version); const routeEndpoints = endpoints.filter((endpoint) => endpoint.world_route_id === route.id && endpoint.world_route_version === route.version);
    if (!routePoints.length || routePoints.length !== routeSegments.length + 1 || routeEndpoints.filter((item) => item.endpoint_role === 'from').length !== 1 || routeEndpoints.filter((item) => item.endpoint_role === 'to').length !== 1) errors.push(issue('ROUTE_CONTINUITY_GAP', `${route.id}:${route.version}`));
    for (const segment of routeSegments) if (contexts.filter((context) => context.segment_id === segment.id && context.segment_version === segment.version).length !== 1) errors.push(issue('ROUTE_SEGMENT_CONTEXT_GAP', `${segment.id}:${segment.version}`));
  }
  for (const endpoint of endpoints) {
    if (!nodes.some((node) => node.id === endpoint.canonical_g5_id && node.version === endpoint.canonical_g5_version && node.spatial_level === 'G5')) errors.push(issue('CANONICAL_G5_INVENTORY_INCOMPLETE', `${endpoint.id}:${endpoint.version}`));
    if (endpoint.endpoint_role === 'from' && !exits.some((exit) => exit.id === endpoint.directional_exit_id && exit.version === endpoint.directional_exit_version && exit.exit_canonical_g5_id === endpoint.canonical_g5_id && exit.exit_canonical_g5_version === endpoint.canonical_g5_version)) errors.push(issue('DIRECTIONAL_EXIT_READINESS_GAP', `${endpoint.id}:${endpoint.version}`));
  }
}

function unique(rows, key, code, errors) { const seen = new Set(); for (const row of rows) { const value = key(row); if (seen.has(value)) errors.push(issue(code, value)); seen.add(value); } }
function contiguous(rows, groupKey, ordinalKey, code, errors) { const groups = new Map(); for (const row of rows) groups.set(row[groupKey], [...(groups.get(row[groupKey]) ?? []), row[ordinalKey]]); for (const [group, values] of groups) if (!values.sort((a,b) => a-b).every((value,index) => Number.isInteger(value) && value === index)) errors.push(issue(code, String(group))); }
function issue(code, subject_ref) { return Object.freeze({ code, subject_ref, dependency_pins: Object.freeze([]) }); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function descendant(file, parent) { const path = relative(parent, file); return !!path && !path.startsWith('..') && !isAbsolute(path); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function literal(value, type = '') {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const quoted = `'${serialized.replaceAll("'", "''")}'`;
  return /\bJSONB?\b/iu.test(type) ? `${quoted}::jsonb` : quoted;
}
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }

function validateJsonSchema(schema, value, path = '$', root = schema) {
  if (schema.$ref) return validateJsonSchema(resolveRef(root, schema.$ref), value, path, root);
  const violations = [];
  if (schema.const !== undefined && value !== schema.const) violations.push(`${path}:const`);
  if (schema.enum && !schema.enum.includes(value)) violations.push(`${path}:enum`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [...violations, `${path}:type`];
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) violations.push(`${path}.${key}:required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties ?? {}, key)) violations.push(`${path}.${key}:additionalProperties`);
    for (const [key, definition] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) violations.push(...validateJsonSchema(definition, value[key], `${path}.${key}`, root));
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [...violations, `${path}:type`];
    if (schema.minItems !== undefined && value.length < schema.minItems) violations.push(`${path}:minItems`);
    for (let index = 0; index < value.length; index += 1) violations.push(...validateJsonSchema(schema.items ?? {}, value[index], `${path}[${index}]`, root));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') violations.push(`${path}:type`);
    else { if (schema.minLength !== undefined && value.length < schema.minLength) violations.push(`${path}:minLength`); if (schema.pattern && !(new RegExp(schema.pattern, 'u')).test(value)) violations.push(`${path}:pattern`); }
  }
  return violations;
}
function resolveRef(root, ref) { if (!ref.startsWith('#/')) throw new Error(`Unsupported bundle schema reference: ${ref}`); return ref.slice(2).split('/').reduce((current, key) => current[key], root); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--bundle');
  const result = await validateAuthoringBundle({ manifestPath: index < 0 ? DEFAULT_MANIFEST : process.argv[index + 1] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.errors.length) process.exitCode = 1;
}
