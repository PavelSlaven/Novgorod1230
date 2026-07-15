import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { supplementalDigest, validateSupplementalCatalogBundle } from '../src/index.js';
import { collectSupplementalParentSourceIds, loadVerifiedParentSourceRecords } from '../../../scripts/stage3b1-parent-source-bundle.mjs';

const bundleRoot = resolve('data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');
const historicalParentSourceIds = new Set(loadVerifiedParentSourceRecords([
  'src_novgorod_agriculture',
  'src_novgorod_promysly'
]).map((record) => record.id));

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
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.deepEqual(result.errors, []);
  assert.equal(recordsByTable.item_templates.length, 102);
  assert.equal(recordsByTable.container_templates.length, 18);
  assert.equal(new Set([...recordsByTable.item_templates, ...recordsByTable.container_templates].map((record) => record.id)).size, 120);
  assert.equal([...recordsByTable.item_templates, ...recordsByTable.container_templates].every((record) => record.status === 'draft'), true);
});

test('supplemental bundle derives historical source IDs from the verified parent archive', () => {
  assert.deepEqual([...historicalParentSourceIds].sort(), ['src_novgorod_agriculture', 'src_novgorod_promysly']);
});

test('parent source collection includes typed template evidence without requiring a polymorphic audit link', () => {
  assert.deepEqual(collectSupplementalParentSourceIds({
    record_sources: [],
    item_template_source_bindings: [{ source_id: 'src_novgorod_agriculture' }],
    container_template_source_bindings: [{ source_id: 'src_novgorod_promysly' }]
  }), ['src_novgorod_agriculture', 'src_novgorod_promysly']);
});

test('supplemental bundle stores historical template evidence through normalized typed bindings', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const bindings = recordsByTable.item_template_source_bindings;

  assert.equal(bindings.length, 15);
  assert.equal(bindings.every((binding) => binding.claim_scope === 'historical_presence' && binding.review_status === 'needs_review' && binding.status === 'draft'), true);
  assert.equal(bindings.every((binding) => ['direct_novgorod', 'direct_novgorod_or_rus_period', 'rus_period_with_novgorod_context', 'comparative_period'].includes(binding.evidence_class)), true);
});

test('supplemental bundle rejects a historical template-source binding with a dangling source or template reference', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const binding = recordsByTable.item_template_source_bindings[0];
  binding.source_id = 'source_not_in_parent';
  binding.item_template_id = 'template_not_in_bundle';
  manifest.datasets.find((dataset) => dataset.table === 'item_template_source_bindings').sha256 = supplementalDigest(recordsByTable.item_template_source_bindings);

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes(`ITEM_SOURCE_BINDING_SOURCE_UNKNOWN:${binding.id}`), true);
  assert.equal(result.errors.includes(`ITEM_SOURCE_BINDING_TEMPLATE_UNKNOWN:${binding.id}`), true);
});

test('supplemental bundle rejects source evidence whose revision differs from its item or container template', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const itemBinding = recordsByTable.item_template_source_bindings[0];
  const containerBinding = {
    id: 'container_source_binding_revision_probe',
    container_template_id: recordsByTable.container_templates[0].id,
    source_id: 'src_project_stage_3b1_physical_parameter_policy',
    world_revision_id: 'novgorod_1230_research_revision_001',
    evidence_class: 'direct_novgorod',
    claim_scope: 'historical_presence',
    confidence: 'medium',
    review_status: 'needs_review',
    status: 'draft'
  };
  itemBinding.world_revision_id = 'novgorod_1230_research_revision_001';
  recordsByTable.container_template_source_bindings.push(containerBinding);
  for (const table of ['item_template_source_bindings', 'container_template_source_bindings']) {
    const dataset = manifest.datasets.find((value) => value.table === table);
    dataset.record_count = recordsByTable[table].length;
    dataset.sha256 = supplementalDigest(recordsByTable[table]);
  }

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes(`ITEM_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:${itemBinding.id}`), true);
  assert.equal(result.errors.includes(`CONTAINER_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:${containerBinding.id}`), true);
});

test('supplemental bundle contains explicit draft-only mass quantity profiles for every bulk template', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const units = recordsByTable.quantity_unit_definitions;
  const profiles = recordsByTable.item_template_quantity_profiles;

  assert.equal(units.some((record) => record.id === 'quantity_unit_gram_v1' && record.dimension === 'mass'), true);
  assert.equal(profiles.length, 12);
  assert.equal(profiles.every((record) => record.quantity_unit_id === 'quantity_unit_gram_v1' && record.quantity_dimension === 'mass' && record.default_quantity_policy.mode === 'explicit_only' && record.status === 'draft'), true);
});

test('supplemental bundle rejects unknown quantity units and a quantity profile from another revision', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const profile = recordsByTable.item_template_quantity_profiles[0];
  profile.quantity_unit_id = 'quantity_unit_unknown';
  profile.world_revision_id = 'other_revision';
  manifest.datasets.find((dataset) => dataset.table === 'item_template_quantity_profiles').sha256 = supplementalDigest(recordsByTable.item_template_quantity_profiles);

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes(`QUANTITY_PROFILE_UNIT_UNKNOWN:${profile.id}`), true);
  assert.equal(result.errors.includes(`QUANTITY_PROFILE_REVISION_UNKNOWN:${profile.id}`), true);
});

test('supplemental bundle rejects a quantity profile with an inverted explicit range before apply', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const profile = recordsByTable.item_template_quantity_profiles[0];
  profile.minimum_quantity = 2;
  profile.maximum_quantity = 1;
  manifest.datasets.find((dataset) => dataset.table === 'item_template_quantity_profiles').sha256 = supplementalDigest(recordsByTable.item_template_quantity_profiles);

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes(`QUANTITY_PROFILE_RANGE_INVALID:${profile.id}`), true);
});

test('supplemental bundle rejects a quantity profile whose declared dimension differs from its unit', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const profile = recordsByTable.item_template_quantity_profiles[0];
  profile.quantity_dimension = 'volume';
  manifest.datasets.find((dataset) => dataset.table === 'item_template_quantity_profiles').sha256 = supplementalDigest(recordsByTable.item_template_quantity_profiles);

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_project_stage_3b1_physical_parameter_policy', ...historicalParentSourceIds]),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes(`QUANTITY_PROFILE_DIMENSION_MISMATCH:${profile.id}`), true);
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

test('supplemental bundle accepts a normalized historical source link only for a known source and template', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.record_sources.push({
    id: 'record_source_test_agriculture',
    source_id: 'src_novgorod_agriculture',
    target_table: 'item_templates',
    target_record_id: recordsByTable.item_templates[0].id,
    support_type: 'background',
    summary: 'Тестовая нормализованная ссылка на исторический источник.'
  });
  const recordSourcesDataset = manifest.datasets.find((dataset) => dataset.table === 'record_sources');
  recordSourcesDataset.record_count = recordsByTable.record_sources.length;
  recordSourcesDataset.sha256 = supplementalDigest(recordsByTable.record_sources);

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_novgorod_agriculture', 'src_novgorod_promysly']),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.deepEqual(result.errors, []);
});

test('supplemental bundle rejects an unknown manifest provenance source', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  manifest.provenance.source_ids = ['source_not_in_bundle_or_parent'];

  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: {
      regions: new Set(['region_novgorod_land']),
      world_revisions: new Set(['novgorod_1230_research_revision_001']),
      source_records: new Set(['src_novgorod_agriculture', 'src_novgorod_promysly']),
      region_social_roles: new Set(['nov_role_guard'])
    }
  });

  assert.equal(result.errors.includes('PROVENANCE_SOURCE_UNKNOWN:source_not_in_bundle_or_parent'), true);
});

test('supplemental bundle rejects a record source whose historical source is absent from the verified parent', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.record_sources[0].source_id = 'source_not_in_parent';
  manifest.datasets.find((dataset) => dataset.table === 'record_sources').sha256 = supplementalDigest(recordsByTable.record_sources);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: { regions: new Set(['region_novgorod_land']), source_records: historicalParentSourceIds, region_social_roles: new Set(['nov_role_guard']) }
  });
  assert.equal(result.errors.includes(`RECORD_SOURCE_SOURCE_UNKNOWN:${recordsByTable.record_sources[0].id}`), true);
});

test('supplemental bundle rejects a record source whose target record is absent', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.record_sources[0].target_record_id = 'template_not_in_bundle';
  manifest.datasets.find((dataset) => dataset.table === 'record_sources').sha256 = supplementalDigest(recordsByTable.record_sources);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: { regions: new Set(['region_novgorod_land']), source_records: historicalParentSourceIds, region_social_roles: new Set(['nov_role_guard']) }
  });
  assert.equal(result.errors.includes(`RECORD_SOURCE_TARGET_UNKNOWN:${recordsByTable.record_sources[0].id}`), true);
});

test('supplemental bundle rejects a record source whose target table is not registered', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  recordsByTable.record_sources[0].target_table = 'party_items';
  manifest.datasets.find((dataset) => dataset.table === 'record_sources').sha256 = supplementalDigest(recordsByTable.record_sources);
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: { regions: new Set(['region_novgorod_land']), source_records: historicalParentSourceIds, region_social_roles: new Set(['nov_role_guard']) }
  });
  assert.equal(result.errors.includes(`RECORD_SOURCE_TARGET_TABLE_INVALID:${recordsByTable.record_sources[0].id}`), true);
});

test('supplemental bundle schedules each record source after its local target table', () => {
  const manifest = readJson('manifest.json');
  const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
  const recordSources = manifest.datasets.find((dataset) => dataset.table === 'record_sources');
  manifest.datasets = [recordSources, ...manifest.datasets.filter((dataset) => dataset !== recordSources)].map((dataset, dependency_order) => ({ ...dataset, dependency_order }));
  const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
    externalIds: { regions: new Set(['region_novgorod_land']), source_records: historicalParentSourceIds, region_social_roles: new Set(['nov_role_guard']) }
  });
  assert.equal(result.errors.includes(`RECORD_SOURCE_TARGET_ORDER_INVALID:${recordsByTable.record_sources[0].id}`), true);
});
