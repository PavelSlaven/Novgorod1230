import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateControlledValue } from
  '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';
import { buildWorldBaseSchemaReference } from
  '../../scripts/generate-world-base-schema-reference.mjs';

const V5 = Object.freeze({ root:
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v5',
  id: 'novgorod_spatial_v3_production_v5_candidate_001',
  digest: 'e616cdd4b7a09db06b7adb7b3faf2a82e0840d6aa286ad65ebbd97e0b86260ad',
  g5Count: 2 });
const V6 = Object.freeze({ root:
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6',
  id: 'novgorod_spatial_v3_production_v6_candidate_001',
  digest: '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  g5Count: 3 });

export async function buildS1AuthoringV5ImportSql({
  root = process.cwd(), rollback = false
} = {}) {
  return buildS1AuthoringImportSql({ root, rollback, candidate: V5 });
}

export async function buildS1AuthoringV6ImportSql({
  root = process.cwd(), rollback = false
} = {}) {
  return buildS1AuthoringImportSql({ root, rollback, candidate: V6 });
}

async function buildS1AuthoringImportSql({ root, rollback, candidate }) {
  const candidateRoot = resolve(root, candidate.root);
  const manifest = JSON.parse(await readFile(
    resolve(candidateRoot, 'manifest.json'), 'utf8'
  ));
  if (manifest.world_revision_id !== candidate.id
    || manifest.catalog_digest !== candidate.digest
    || manifest.status !== 'approved') {
    throw new Error('s1_authoring_v5_manifest_mismatch');
  }
  const schema = await buildWorldBaseSchemaReference({ root });
  const tables = new Map(schema.schema.tables.map((table) => [
    table.name, table
  ]));
  const datasets = new Map();
  for (const dataset of manifest.datasets) {
    const rowsText = await readFile(resolve(candidateRoot, dataset.file), 'utf8');
    if (sha256(rowsText) !== dataset.sha256) {
      throw new Error(`s1_authoring_v5_dataset_digest_mismatch:${dataset.table}`);
    }
    if (!tables.has(dataset.table)) {
      throw new Error(`s1_authoring_v5_unknown_table:${dataset.table}`);
    }
    datasets.set(dataset.table, JSON.parse(rowsText));
  }
  validateS1AuthoringCandidate({ manifest, datasets, g5Count: candidate.g5Count,
    lineageDatasets: await readLineageDatasets({ root, manifest }) });
  const sql = ['BEGIN;', 'SET CONSTRAINTS ALL DEFERRED;'];
  for (const dataset of manifest.datasets) {
    const table = tables.get(dataset.table);
    const keys = primaryKey(table);
    for (const row of datasets.get(dataset.table)) {
      const columns = table.columns.filter(({ name }) => Object.hasOwn(row, name));
      const values = new Map(columns.map((column) => [
        column.name, literal(row[column.name], column.type)
      ]));
      const predicate = keys.map(({ name }) =>
        `actual.${name} IS NOT DISTINCT FROM ${values.get(name)}`).join(' AND ');
      const managed = new Set(['created_at', 'updated_at']);
      const expected = Object.fromEntries(columns.filter(({ name }) =>
        !managed.has(name)).map(({ name }) => [name, row[name]]));
      sql.push(
        `INSERT INTO world_base.${dataset.table} (${columns.map(({ name }) => name).join(',')})`,
        `VALUES (${columns.map(({ name }) => values.get(name)).join(',')})`,
        'ON CONFLICT DO NOTHING;',
        `DO $s1$ BEGIN IF NOT EXISTS (SELECT 1 FROM world_base.${dataset.table} actual`,
        `  WHERE ${predicate} AND to_jsonb(actual) @> ${literal(expected, 'JSONB')}) THEN`,
        `  RAISE EXCEPTION 'S1_AUTHORING_V5_IMPORT_READBACK_MISMATCH:${dataset.table}';`,
        'END IF; END $s1$;'
      );
    }
  }
  sql.push('SET CONSTRAINTS ALL IMMEDIATE;', rollback ? 'ROLLBACK;' : 'COMMIT;');
  return `${sql.join('\n')}\n`;
}

export function validateS1AuthoringV5Candidate({ manifest, datasets,
  lineageDatasets = new Map() } = {}) {
  return validateS1AuthoringCandidate({ manifest, datasets, lineageDatasets,
    g5Count: V5.g5Count });
}

export function validateS1AuthoringV6Candidate({ manifest, datasets,
  lineageDatasets = new Map() } = {}) {
  return validateS1AuthoringCandidate({ manifest, datasets, lineageDatasets,
    g5Count: V6.g5Count });
}

function validateS1AuthoringCandidate({ manifest, datasets,
  lineageDatasets = new Map(), g5Count } = {}) {
  const current = (table) => datasets?.get(table) ?? [];
  const all = (table) => [...current(table), ...(lineageDatasets.get(table) ?? [])];
  const exact = (table, id, version) => all(table).filter((row) =>
    row.id === id && row.version === version && row.status === 'approved').length === 1;
  const requireRef = (table, id, version, kind) => {
    if (id == null && version == null) return;
    if (typeof id !== 'string' || !Number.isSafeInteger(version)
        || !exact(table, id, version)) {
      throw new Error(`s1_authoring_v5_reference_gap:${kind}`);
    }
  };
  for (const row of current('spatial_v3_scene_position_templates')) {
    validateControlledValue('controlled_position_type', row.position_type_id);
  }

  const revision = manifest?.world_revision_id;
  const nodes = current('spatial_v3_nodes');
  const categories = new Set(all('universal_categories')
    .filter(({ status }) => status === 'approved').map(({ id }) => id));
  const nodeKey = ({ id, version }) => `${id}@${version}`;
  const byNode = new Map(nodes.map((row) => [nodeKey(row), row]));
  const parents = current('spatial_v3_node_parents');
  const classes = current('spatial_v3_node_classes');
  const versions = current('spatial_v3_authoring_versions');
  const levelParent = { G1: 'G0', G2: 'G1', G3: 'G2', G4: 'G3', G5: 'G4' };
  for (const node of nodes) {
    const parent = parents.filter((row) => row.child_id === node.id
      && row.child_version === node.version);
    const canonicalClass = classes.filter((row) => row.node_id === node.id
      && row.node_version === node.version
      && row.category_id === node.primary_class_id);
    const authoring = versions.filter((row) => row.entity_kind === 'spatial_node'
      && row.entity_id === node.id && row.version === node.version
      && row.world_revision_id === revision && row.status === 'approved');
    if (node.world_revision_id !== revision || !categories.has(node.primary_class_id)
        || canonicalClass.length !== 1
        || authoring.length !== 1 || (node.spatial_level === 'G0'
          ? parent.length !== 0 : parent.length !== 1)) {
      throw new Error('s1_authoring_v5_canonical_g5_closure_gap');
    }
    if (parent.length === 1) {
      const owner = byNode.get(`${parent[0].parent_id}@${parent[0].parent_version}`);
      if (parent[0].world_revision_id !== revision
          || owner?.spatial_level !== levelParent[node.spatial_level]) {
        throw new Error('s1_authoring_v5_canonical_g5_closure_gap');
      }
    }
  }
  const g5 = nodes.filter(({ spatial_level }) => spatial_level === 'G5');
  if (g5.length !== g5Count || current('spatial_v3_g1_grid_cells').length !== 1) {
    throw new Error('s1_authoring_v5_canonical_g5_closure_gap');
  }

  for (const scene of current('spatial_v3_scene_templates')) {
    requireRef('spatial_v3_regional_scene_template_bases', scene.regional_template_id,
      scene.regional_template_version, 'regional_scene_template');
  }
  const profiles = current('spatial_v3_scene_materialization_profiles');
  const candidates = current('spatial_v3_scene_materialization_candidates');
  for (const node of g5) {
    const profile = profiles.filter((row) => row.source_kind === 'canonical_g5'
      && row.source_entity_id === node.id && row.source_entity_version === node.version);
    if (profile.length !== 1 || profile[0].world_revision_id !== revision) {
      throw new Error('s1_authoring_v5_canonical_g5_closure_gap');
    }
    requireRef('spatial_v3_scene_selection_rules', profile[0].selection_rule_id,
      profile[0].selection_rule_version, 'scene_selection_rule');
    const selected = candidates.filter((row) => row.profile_id === profile[0].id
      && row.profile_version === profile[0].version);
    if (selected.length !== 1) {
      throw new Error('s1_authoring_v5_canonical_g5_closure_gap');
    }
    requireRef('spatial_v3_scene_templates', selected[0].scene_template_id,
      selected[0].scene_template_version, 'scene_template');
    requireRef('spatial_v3_scene_applicability_rules',
      selected[0].applicability_rule_id, selected[0].applicability_rule_version,
      'scene_applicability_rule');
  }
  for (const edge of current('spatial_v3_scene_movement_edge_templates')) {
    requireRef('spatial_v3_transition_environment_profiles',
      edge.transition_environment_profile_id,
      edge.transition_environment_profile_version,
      'transition_environment_profile');
    requireRef('spatial_v3_topological_movement_orientation_profiles',
      edge.movement_orientation_profile_id,
      edge.movement_orientation_profile_version,
      'movement_orientation_profile');
    requireRef('spatial_v3_movement_method_cost_profiles',
      edge.movement_method_cost_profile_id,
      edge.movement_method_cost_profile_version, 'movement_method_cost_profile');
    requireRef('spatial_v3_dynamic_recheck_policies', edge.dynamic_recheck_policy_id,
      edge.dynamic_recheck_policy_version, 'dynamic_recheck_policy');
    requireRef('spatial_v3_portal_templates', edge.portal_template_id,
      edge.portal_template_version, 'portal_template');
    if (edge.availability_condition_set_id != null
        || edge.availability_condition_set_version != null) {
      throw new Error('s1_authoring_v5_reference_gap:availability_condition_set');
    }
  }
  for (const link of current('spatial_v3_visibility_link_templates')) {
    requireRef('spatial_v3_portal_templates', link.portal_template_id,
      link.portal_template_version, 'portal_template');
    if (link.condition_profile_id != null || link.condition_profile_version != null) {
      throw new Error('s1_authoring_v5_reference_gap:condition_profile');
    }
  }
}

async function readLineageDatasets({ root, manifest }) {
  const wanted = new Set([
    'spatial_v3_regional_scene_template_bases',
    'universal_categories',
    'spatial_v3_scene_selection_rules',
    'spatial_v3_scene_applicability_rules',
    'spatial_v3_transition_environment_profiles',
    'spatial_v3_topological_movement_orientation_profiles',
    'spatial_v3_movement_method_cost_profiles',
    'spatial_v3_dynamic_recheck_policies',
    'spatial_v3_portal_templates'
  ]);
  const rows = new Map();
  let path = manifest.parent_manifest_path;
  while (path) {
    const parent = JSON.parse(await readFile(resolve(root, path), 'utf8'));
    const parentRoot = resolve(root, path, '..');
    for (const dataset of parent.datasets ?? []) {
      if (!wanted.has(dataset.table)) continue;
      const values = JSON.parse(await readFile(resolve(parentRoot, dataset.file), 'utf8'));
      rows.set(dataset.table, [...(rows.get(dataset.table) ?? []), ...values]);
    }
    path = parent.parent_manifest_path;
  }
  return rows;
}

function primaryKey(table) {
  const inline = table.columns.filter(({ primary_key: key }) => key);
  if (inline.length) return inline;
  const names = table.constraints.find((constraint) => /^PRIMARY KEY\s*\(/u
    .test(constraint))?.match(/^PRIMARY KEY\s*\(([^)]+)\)/u)?.[1]
    ?.split(',').map((name) => name.trim()) ?? [];
  return names.map((name) => table.columns.find((column) =>
    column.name === name));
}

function literal(value, type = '') {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const quoted = `'${serialized.replaceAll("'", "''")}'`;
  return /\bJSONB?\b/iu.test(type) ? `${quoted}::jsonb` : quoted;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
