import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessMaterializationReadiness,
  digestValue,
  importClassificationCatalog,
  validateCatalogImportManifest
} from '../src/index.js';
import { validateJsonSchemaRecords } from '../src/materialization-readiness.js';
import universalParameterDefinitionsSchema from '../../../schemas/materialization/universal-parameter-definitions-v1.schema.json' with { type: 'json' };

const approved = { status: 'approved' };

function manifest(recordsByTable) {
  return {
    version: 2,
    schema: 'world_catalog_import_manifest_v2',
    world_revision_id: 'revision-1',
    approval: 'approved',
    deletion_mode: 'none',
    provenance: {
      source_ids: ['source-1'],
      minimum_confidence: 'high',
      effective_at: '1230-01-01T00:00:00.000Z',
      json_schema_version: 'classification-v1',
      negative_fixture_evidence: true
    },
    tables: Object.entries(recordsByTable).map(([table_name, records], dependency_order) => ({
      table_name, record_count: records.length, payload_digest: digestValue(records), dependency_order
    }))
  };
}

function validRecords() {
  return {
    source_records: [{ id: 'source-1' }],
    classification_schemes: [{ id: 'skos', title: 'SKOS', authority: 'W3C', scheme_version: '2009', release_date: '2009-08-18', canonical_reference: 'https://www.w3.org/TR/skos-reference/', license_or_usage_note: 'reference only', snapshot_digest: 'a'.repeat(64), ...approved }],
    universal_categories: [
      { id: 'tool', domain: 'item', stable_code: 'item.tool', facet: 'object_type', preferred_label: 'tool', definition: 'An implement used to perform work.', scope_note: 'Project concept.', inclusion_rules: 'Physical implements only.', exclusion_rules: 'Not a material.', title: 'Tool', ...approved },
      { id: 'knife', domain: 'item', stable_code: 'item.tool.knife', facet: 'object_type', preferred_label: 'knife', definition: 'A cutting tool.', scope_note: 'Project concept.', inclusion_rules: 'Cutting implements.', exclusion_rules: 'Not a weapon classification.', title: 'Knife', ...approved }
    ],
    category_labels: [{ id: 'knife-historical', category_id: 'knife', language: 'ru', label: 'нож', label_type: 'historical', source_id: 'source-1' }],
    universal_category_relations: [{ id: 'knife-broader', from_category_id: 'knife', to_category_id: 'tool', relation_type: 'narrower' }],
    category_scheme_mappings: [{ id: 'knife-skos', category_id: 'knife', classification_scheme_id: 'skos', external_concept_id: 'example:knife', mapping_type: 'close', mapping_evidence: 'reference', source_id: 'source-1', review_status: 'approved' }]
  };
}

test('classification datasets accept valid schemes, labels, mappings and hierarchy', () => {
  const records = validRecords();
  assert.deepEqual(validateCatalogImportManifest(manifest(records), { recordsByTable: records }), []);
});

test('classification validation rejects invalid statuses, digests and required category fields', () => {
  const records = validRecords();
  records.classification_schemes[0].status = 'unknown';
  records.classification_schemes[0].snapshot_digest = 'not-a-digest';
  delete records.classification_schemes[0].authority;
  records.universal_categories[0].facet = '';
  records.universal_categories[0].definition = '';
  records.universal_categories[0].scope_note = '';
  const errors = validateCatalogImportManifest(manifest(records), { recordsByTable: records });
  assert.ok(errors.includes('CLASSIFICATION_SCHEME_STATUS_INVALID:skos'));
  assert.ok(errors.includes('CLASSIFICATION_SCHEME_DIGEST_INVALID:skos'));
  assert.ok(errors.includes('CATEGORY_FACET_MISSING:tool'));
  assert.ok(errors.includes('CATEGORY_DEFINITION_MISSING:tool'));
  assert.ok(errors.includes('CATEGORY_SCOPE_NOTE_MISSING:tool'));
  assert.ok(errors.includes('JSON_SCHEMA_REQUIRED:classification_schemes:0:authority'));
});

test('classification validation rejects duplicate codes, unknown types and dangling references', () => {
  const records = validRecords();
  records.universal_categories[1].stable_code = records.universal_categories[0].stable_code;
  records.universal_category_relations.push({ id: 'bad-relation', from_category_id: 'missing', to_category_id: 'tool', relation_type: 'invented' });
  records.category_scheme_mappings.push({ ...records.category_scheme_mappings[0], id: 'bad-mapping', category_id: 'missing', classification_scheme_id: 'missing-scheme', mapping_type: 'invented' });
  const errors = validateCatalogImportManifest(manifest(records), { recordsByTable: records });
  assert.ok(errors.includes('CATEGORY_STABLE_CODE_DUPLICATE:item.tool'));
  assert.ok(errors.includes('CATEGORY_RELATION_TYPE_INVALID:bad-relation'));
  assert.ok(errors.includes('CATEGORY_RELATION_CATEGORY_UNKNOWN:bad-relation:from_category_id'));
  assert.ok(errors.includes('CATEGORY_MAPPING_TYPE_INVALID:bad-mapping'));
  assert.ok(errors.includes('CATEGORY_MAPPING_SCHEME_UNKNOWN:bad-mapping'));
  assert.ok(errors.includes('CATEGORY_MAPPING_CATEGORY_UNKNOWN:bad-mapping'));
});

test('classification validation rejects self and multi-node hierarchical cycles', () => {
  const records = validRecords();
  records.universal_category_relations.push({ id: 'self', from_category_id: 'tool', to_category_id: 'tool', relation_type: 'broader' });
  records.universal_category_relations.push({ id: 'cycle', from_category_id: 'tool', to_category_id: 'knife', relation_type: 'narrower' });
  const errors = validateCatalogImportManifest(manifest(records), { recordsByTable: records });
  assert.ok(errors.includes('CATEGORY_HIERARCHY_SELF_CYCLE:self'));
  assert.ok(errors.includes('CATEGORY_HIERARCHY_CYCLE:knife'));
});

test('classification validation rejects payload outside manifest and parent/relation cycles before apply', () => {
  const records = validRecords();
  records.universal_categories[0].parent_category_id = 'knife';
  const errors = validateCatalogImportManifest(manifest(records), { recordsByTable: records });
  assert.ok(errors.includes('CATEGORY_HIERARCHY_CYCLE:tool'));

  const declared = validRecords();
  const source = manifest(declared);
  declared.universal_parameter_definitions = [{ id: 'outside-manifest' }];
  const manifestErrors = validateCatalogImportManifest(source, { recordsByTable: declared });
  assert.ok(manifestErrors.includes('TABLE_PAYLOAD_NOT_DECLARED:universal_parameter_definitions'));
});

test('external mappings do not grant regional permission and replaced categories are not active candidates', () => {
  const records = validRecords();
  const readiness = assessMaterializationReadiness({ manifest: manifest(records), recordsByTable: records, regionId: 'novgorod', g4Id: 'g4', historicalYear: 1230, season: 'summer' });
  assert.ok(readiness.concerns.includes('REGION_CATEGORY_OPTIONS_NOT_READY'));
  records.universal_categories[1] = { ...records.universal_categories[1], status: 'deprecated' };
  records.region_category_options = [{ id: 'regional-knife', world_revision_id: 'revision-1', region_id: 'novgorod', category_id: 'knife', ...approved }];
  const invalid = assessMaterializationReadiness({ manifest: manifest(records), recordsByTable: records, regionId: 'novgorod', g4Id: 'g4', historicalYear: 1230, season: 'summer' });
  assert.ok(invalid.concerns.includes('REGION_CATEGORY_OPTION_CATEGORY_INACTIVE:regional-knife'));
  records.universal_categories[1] = { ...records.universal_categories[1], ...approved };
  records.region_category_options.push({ ...records.region_category_options[0], id: 'regional-knife-duplicate' });
  const ambiguous = assessMaterializationReadiness({ manifest: manifest(records), recordsByTable: records, regionId: 'novgorod', g4Id: 'g4', historicalYear: 1230, season: 'summer' });
  assert.ok(ambiguous.concerns.includes('REGION_CATEGORY_OPTION_ACTIVE_AMBIGUITY:regional-knife:regional-knife-duplicate'));
});

test('classification importer dry-run never writes and apply rolls back on a readback error', async () => {
  const records = validRecords();
  const source = manifest(records);
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); },
    async insert(table) { calls.push(`insert:${table}`); },
    async readback() { return { record_count: 0, payload_digest: '0'.repeat(64) }; },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }
  };
  const dryRun = await importClassificationCatalog({ manifest: source, recordsByTable: records, mode: 'dry-run', adapter });
  assert.equal(dryRun.applied, false);
  assert.deepEqual(calls, []);
  await assert.rejects(importClassificationCatalog({ manifest: source, recordsByTable: records, mode: 'apply', adapter }), /CLASSIFICATION_IMPORT_READBACK_MISMATCH/u);
  assert.equal(calls[0], 'begin');
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('universal parameter definition schema rejects an unknown value type and uncontrolled payload field', () => {
  const errors = validateJsonSchemaRecords('universal_parameter_definitions', [{
    id: 'parameter-1',
    category_id: 'knife',
    parameter_key: 'length_mm',
    value_type: 'invented',
    constraints: { version: 1 },
    unbounded_editor_note: true
  }], universalParameterDefinitionsSchema);
  assert.ok(errors.includes('JSON_SCHEMA_ENUM:universal_parameter_definitions:0:value_type'));
  assert.ok(errors.includes('JSON_SCHEMA_ADDITIONAL_PROPERTY:universal_parameter_definitions:0:unbounded_editor_note'));
});
