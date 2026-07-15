import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { supplementalDigest, validateSupplementalCatalogBundle } from '../src/index.js';

const bundleRoot = resolve('data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');

function readJson(name) {
  return JSON.parse(readFileSync(resolve(bundleRoot, name), 'utf8'));
}

test('stage 3B-1 bundle is a deterministic draft-only supplemental catalog', () => {
  assert.equal(existsSync(resolve(bundleRoot, 'manifest.json')), true);
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy']),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.deepEqual(result.errors, []);
  assert.equal(recordsByTable.item_templates.length, 102);
  assert.equal(recordsByTable.container_templates.length, 18);
  assert.equal(new Set([...recordsByTable.item_templates, ...recordsByTable.container_templates].map((record) => record.id)).size, 120);
  assert.equal([...recordsByTable.item_templates, ...recordsByTable.container_templates].every((record) => record.status === 'draft'), true);
});

test('supplemental bundle rejects a party table and digest mismatch', () => {
  const manifest = {
    schema_version: 1,
    bundle_id: 'draft-test',
    world_revision_id: 'revision',
    approval: 'draft',
    deletion_policy: 'none',
    provenance: { source_ids: ['source'], effective_at: '1230-01-01' },
    datasets: [{ table: 'party_items', path: 'party.json', schema_id: 'x', record_count: 0, sha256: '0'.repeat(64), dependency_order: 0 }]
  };
  const result = validateSupplementalCatalogBundle(manifest, { party_items: [] });
  assert.equal(result.errors.includes('TABLE_NOT_REGISTERED:party_items'), true);
});

test('supplemental bundle rejects unknown fields in strict authoring records', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.item_templates[0].invented_machine_field = 'no';
  const itemDataset = manifest.datasets.find((dataset) => dataset.table === 'item_templates');
  itemDataset.sha256 = '0'.repeat(64);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: { regions: new Set(['region_novgorod_land']), world_revisions: new Set(['novgorod_1230_research_revision_001']), region_social_roles: new Set(['nov_role_guard']) }
  });
  assert.equal(result.errors.includes(`RECORD_FIELD_FORBIDDEN:item_templates:${recordsByTable.item_templates[0].id}:invented_machine_field`), true);
});

test('supplemental bundle rejects every non-draft status after a valid digest rewrite', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.item_templates[0].status = 'deprecated';
  manifest.datasets.find((dataset) => dataset.table === 'item_templates').sha256 = supplementalDigest(recordsByTable.item_templates);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes(`SUPPLEMENTAL_RECORD_NOT_DRAFT:item_templates:${recordsByTable.item_templates[0].id}`), true);
});

test('supplemental bundle binds each dataset to its actual strict schema id', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const category = recordsByTable.universal_categories[0];
  category.unknown_editor_field = true;
  manifest.datasets.find((dataset) => dataset.table === 'universal_categories').sha256 = supplementalDigest(recordsByTable.universal_categories);
  manifest.datasets.find((dataset) => dataset.table === 'universal_categories').schema_id = 'rus.unknown.schema';
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes('SCHEMA_ID_INVALID:universal_categories'), true);
  assert.equal(result.errors.includes(`RECORD_FIELD_FORBIDDEN:universal_categories:${category.id}:unknown_editor_field`), true);
});

test('supplemental bundle enforces the property-rule owner vocabulary from its JSON Schema', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const rule = recordsByTable.property_profile_rules[0];
  rule.owner_kind = 'invented_owner';
  manifest.datasets.find((dataset) => dataset.table === 'property_profile_rules').sha256 = supplementalDigest(recordsByTable.property_profile_rules);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes('JSON_SCHEMA_ENUM:property_profile_rules:0:owner_kind'), true);
});

test('supplemental bundle enforces the category-label vocabulary from its JSON Schema', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const label = recordsByTable.category_labels[0];
  label.label_type = 'invented_label';
  manifest.datasets.find((dataset) => dataset.table === 'category_labels').sha256 = supplementalDigest(recordsByTable.category_labels);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes('JSON_SCHEMA_ENUM:category_labels:0:label_type'), true);
});

test('supplemental bundle rejects a dangling category label reference', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const label = recordsByTable.category_labels[0];
  label.category_id = 'missing_category';
  manifest.datasets.find((dataset) => dataset.table === 'category_labels').sha256 = supplementalDigest(recordsByTable.category_labels);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes(`LABEL_CATEGORY_UNKNOWN:${label.id}`), true);
});

test('supplemental bundle rejects a dangling regional category option reference', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const option = recordsByTable.region_category_options[0];
  option.category_id = 'missing_category';
  manifest.datasets.find((dataset) => dataset.table === 'region_category_options').sha256 = supplementalDigest(recordsByTable.region_category_options);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes(`REGION_OPTION_CATEGORY_UNKNOWN:${option.id}`), true);
});

test('supplemental bundle rejects a calendar date that PostgreSQL DATE would reject', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.world_revisions[0].effective_from = '2026-02-31';
  manifest.datasets.find((dataset) => dataset.table === 'world_revisions').sha256 = supplementalDigest(recordsByTable.world_revisions);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes('JSON_SCHEMA_FORMAT:world_revisions:0:effective_from'), true);
});

test('supplemental bundle rejects a FK-dependent table scheduled before its prerequisites', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const itemTemplates = manifest.datasets.find((dataset) => dataset.table === 'item_templates');
  manifest.datasets = [itemTemplates, ...manifest.datasets.filter((dataset) => dataset !== itemTemplates)].map((dataset, dependency_order) => ({ ...dataset, dependency_order }));
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) } });
  assert.equal(result.errors.includes('FK_DEPENDENCY_ORDER_INVALID:item_templates:world_revisions'), true);
});
