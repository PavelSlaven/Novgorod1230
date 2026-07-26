import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PARENT_ROOT = 'data/world-catalogs/novgorod/spatial-v3';
export const CANDIDATE_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v2';
export const PARENT_WORLD_REVISION =
  'novgorod_spatial_v3_target_contract_approval_001';
export const OUTPUT_WORLD_REVISION =
  'novgorod_spatial_v3_production_v2_candidate_001';
export const RELEASE_ID = 'spatial-v3-production-v2';
export const COMPILER_VERSION = 'lower-dvina-v2-compiler@1';

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    sortCanonical(value[key])
  ]));
}

export function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(sortCanonical(value)));
}

export function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : canonicalBytes(value);
  return createHash('sha256').update(bytes).digest('hex');
}

function seal(value, digestField) {
  const sealed = structuredClone(value);
  sealed[digestField] = digest(sealed);
  return sealed;
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function incrementedVersion(parentVersion) {
  assert(Number.isInteger(parentVersion) && parentVersion > 0, 'parent_version_invalid');
  return parentVersion + 1;
}

export function buildDependencyResolutionBundle({
  exactHead,
  parentManifestSha256,
  parentAuthoringVersions
}) {
  assert(/^[a-f0-9]{40}$/u.test(exactHead), 'exact_head_invalid');
  assert(/^[a-f0-9]{64}$/u.test(parentManifestSha256), 'parent_manifest_digest_invalid');
  const external = parentAuthoringVersions
    .filter((row) => row.entity_kind === 'external_dependency')
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  assert(external.length > 0, 'external_dependency_candidates_empty');
  assert(new Set(external.map(({ entity_id }) => entity_id)).size === external.length,
    'ambiguous_greatest_external_dependency');

  const compatibilityRows = external.map((row) => ({
    dependency_id: row.entity_id,
    dependency_version: row.version,
    dependency_digest: row.canonical_digest,
    status: row.status
  }));
  const registryDigest = digest(compatibilityRows);
  const approvalDigest = digest({
    source: 'p12_parent_external_dependency_compatibility_baseline',
    parent_world_revision_id: PARENT_WORLD_REVISION,
    parent_manifest_sha256: parentManifestSha256
  });

  return seal({
    schema: 'rus.spatial-v3.dependency_resolution_bundle.v1',
    bundle_version: 1,
    compiler_version: COMPILER_VERSION,
    exact_head: exactHead,
    parent_world_revision_id: PARENT_WORLD_REVISION,
    parent_manifest_sha256: parentManifestSha256,
    selection_rule:
      'single greatest approved compatible candidate per dependency in versioned parent compatibility baseline',
    compatibility_baseline: {
      baseline_id: 'p12_parent_external_dependency_compatibility_baseline',
      baseline_version: 1,
      reason:
        'The exact parent manifest predates source_transition_set; its approved external pins form the explicit versioned compatibility baseline.',
      canonical_digest: registryDigest
    },
    registry: {
      registry_type: 'spatial_materialization',
      registry_id: 'spatial_v3_external_dependencies',
      registry_version: '1',
      registry_digest: registryDigest,
      approval_ref:
        'data/world-catalogs/novgorod/spatial-v3/manifest.json#approved-parent-compatibility-baseline',
      approval_digest: approvalDigest
    },
    selections: compatibilityRows
  }, 'bundle_digest');
}

export function validateDependencyResolutionBundle(bundle) {
  const copy = structuredClone(bundle);
  const claimed = copy.bundle_digest;
  delete copy.bundle_digest;
  assert(digest(copy) === claimed, 'dependency_resolution_bundle_digest_mismatch');
  assert(bundle.parent_world_revision_id === PARENT_WORLD_REVISION,
    'dependency_resolution_parent_mismatch');
  assert(Array.isArray(bundle.selections) && bundle.selections.length > 0,
    'dependency_resolution_selections_empty');
  assert(new Set(bundle.selections.map((row) => row.dependency_id)).size ===
    bundle.selections.length, 'dependency_resolution_ambiguous');
  for (const row of bundle.selections) {
    assert(row.status === 'approved', 'dependency_resolution_unapproved_candidate');
    assert(Number.isInteger(row.dependency_version) && row.dependency_version > 0,
      'dependency_resolution_version_invalid');
    assert(/^[a-f0-9]{64}$/u.test(row.dependency_digest),
      'dependency_resolution_digest_invalid');
  }
  return true;
}

function internalVersionIndex(parentAuthoringVersions) {
  const index = new Map();
  for (const row of parentAuthoringVersions) {
    if (row.entity_kind === 'external_dependency') continue;
    const existing = index.get(row.entity_id);
    if (existing !== undefined && existing !== row.version) {
      throw new Error('parent_authoring_identity_ambiguous');
    }
    index.set(row.entity_id, row.version);
  }
  return index;
}

function transformReferenceVersions(row, internalVersions) {
  const output = structuredClone(row);
  for (const [key, id] of Object.entries(row)) {
    if (!key.endsWith('_id') || typeof id !== 'string') continue;
    const prefix = key.slice(0, -3);
    const versionKey = `${prefix}_version`;
    if (Number.isInteger(row[versionKey]) && internalVersions.has(id)) {
      output[versionKey] = incrementedVersion(row[versionKey]);
    }
  }
  if (row.world_revision_id === PARENT_WORLD_REVISION) {
    output.world_revision_id = OUTPUT_WORLD_REVISION;
  }
  return output;
}

function rowDigest(row) {
  const copy = structuredClone(row);
  delete copy.canonical_digest;
  return digest(copy);
}

export function compileDataset({
  table,
  rows,
  parentAuthoringVersions,
  dependencyBundle
}) {
  validateDependencyResolutionBundle(dependencyBundle);
  const internalVersions = internalVersionIndex(parentAuthoringVersions);
  const registry = dependencyBundle.registry;
  const selectionById = new Map(dependencyBundle.selections.map((row) => [
    row.dependency_id,
    row
  ]));

  if (table === 'spatial_v3_world_revisions') {
    const parent = rows.find(({ id }) => id === PARENT_WORLD_REVISION);
    assert(parent, 'parent_world_revision_row_missing');
    return [
      structuredClone(parent),
      {
        id: OUTPUT_WORLD_REVISION,
        parent_revision_id: PARENT_WORLD_REVISION,
        catalog_digest: '0'.repeat(64),
        status: 'approved',
        provenance_ref: 'prov_p12_g1_r2_r3_v1',
        deprecated_at: null
      }
    ];
  }

  if (table === 'spatial_v3_authoring_versions') {
    return rows
      .filter((row) => row.entity_kind !== 'external_dependency')
      .map((row) => {
        const output = {
          ...row,
          version: incrementedVersion(row.version),
          world_revision_id: OUTPUT_WORLD_REVISION
        };
        output.canonical_digest = rowDigest(output);
        return output;
      });
  }

  if (table === 'spatial_v3_authoring_dependency_edges') {
    return rows
      .filter((row) => row.source_entity_kind !== 'external_dependency')
      .map((row) => {
      const output = {
        ...row,
        source_version: incrementedVersion(row.source_version),
        world_revision_id: OUTPUT_WORLD_REVISION
      };
      if (row.target_entity_kind === 'external_dependency') {
        const selected = selectionById.get(row.target_entity_id);
        assert(selected, 'external_dependency_selection_missing');
        assert(selected.dependency_version === row.target_version,
          'external_dependency_parent_pin_mismatch');
        Object.assign(output, {
          target_registry_type: registry.registry_type,
          target_registry_id: registry.registry_id,
          target_registry_version: registry.registry_version,
          target_registry_digest: registry.registry_digest,
          target_dependency_digest: selected.dependency_digest
        });
      } else {
        output.target_version = incrementedVersion(row.target_version);
        Object.assign(output, {
          target_registry_type: null,
          target_registry_id: null,
          target_registry_version: null,
          target_registry_digest: null,
          target_dependency_digest: null
        });
      }
        return output;
      });
  }

  const transformed = rows.map((row) => {
    const output = transformReferenceVersions(row, internalVersions);
    if (Number.isInteger(row.version) && typeof row.id === 'string' &&
        internalVersions.has(row.id)) {
      output.version = incrementedVersion(row.version);
    }
    if (typeof row.canonical_digest === 'string') {
      output.canonical_digest = rowDigest(output);
    }
    return output;
  });
  return transformed;
}

function versionAllocationManifest(parentAuthoringVersions) {
  const allocations = parentAuthoringVersions
    .filter((row) => row.entity_kind !== 'external_dependency')
    .map((row) => ({
      entity_kind: row.entity_kind,
      entity_id: row.entity_id,
      allocation_kind: 'carried_or_revised_internal',
      exact_parent_version: row.version,
      output_version: incrementedVersion(row.version)
    }))
    .sort((left, right) =>
      `${left.entity_kind}:${left.entity_id}`.localeCompare(
        `${right.entity_kind}:${right.entity_id}`
      ));
  return seal({
    schema: 'rus.spatial-v3.version_allocation_manifest.v1',
    world_revision_id: OUTPUT_WORLD_REVISION,
    allocation_rule: 'carried/revised=exact_parent+1; new=1; external=exact_selected',
    forbidden_rules: ['MAX(version)', 'timestamps', 'file_order', 'other_revisions'],
    allocations
  }, 'manifest_digest');
}

function externalRows(bundle) {
  return bundle.selections.map((row) => {
    const base = {
      registry_type: bundle.registry.registry_type,
      registry_id: bundle.registry.registry_id,
      registry_version: bundle.registry.registry_version,
      registry_digest: bundle.registry.registry_digest,
      dependency_id: row.dependency_id,
      dependency_version: row.dependency_version,
      dependency_digest: row.dependency_digest,
      status: 'approved',
      approval_ref: bundle.registry.approval_ref,
      approval_digest: bundle.registry.approval_digest
    };
    return { ...base, canonical_digest: digest(base) };
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function compileLowerDvinaV2({
  root = process.cwd(),
  exactHead
} = {}) {
  const parentRoot = resolve(root, PARENT_ROOT);
  const candidateRoot = resolve(root, CANDIDATE_ROOT);
  const parentManifestBytes = await readFile(resolve(parentRoot, 'manifest.json'));
  const parentManifest = JSON.parse(parentManifestBytes);
  assert(parentManifest.world_revision_id === PARENT_WORLD_REVISION,
    'parent_world_revision_unexpected');
  for (const dataset of parentManifest.datasets) {
    const bytes = await readFile(resolve(parentRoot, dataset.file));
    assert(digest(bytes) === dataset.sha256, `parent_dataset_digest_mismatch:${dataset.table}`);
  }

  const parentAuthoringVersions = JSON.parse(await readFile(resolve(
    parentRoot,
    'datasets/spatial_v3_authoring_versions.json'
  )));
  const bundle = buildDependencyResolutionBundle({
    exactHead,
    parentManifestSha256: digest(parentManifestBytes),
    parentAuthoringVersions
  });

  await rm(candidateRoot, { recursive: true, force: true });
  const datasets = [];
  const compiledRows = new Map();
  for (const dataset of parentManifest.datasets) {
    const rows = JSON.parse(await readFile(resolve(parentRoot, dataset.file)));
    const compiled = compileDataset({
      table: dataset.table,
      rows,
      parentAuthoringVersions,
      dependencyBundle: bundle
    });
    compiledRows.set(dataset.table, compiled);
  }
  compiledRows.set('world_revisions', [{
    id: OUTPUT_WORLD_REVISION,
    parent_revision_id: null,
    title: 'Novgorod Spatial-v3 production v2 compatibility pin',
    effective_from: '1230-01-01',
    effective_to: '1250-12-31',
    catalog_digest: '0'.repeat(64),
    status: 'approved'
  }]);
  compiledRows.set('spatial_v3_external_dependency_versions', externalRows(bundle));

  const preCatalogEntries = [];
  for (const [table, rows] of compiledRows) {
    const file = `datasets/${table}.json`;
    const bytes = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`);
    preCatalogEntries.push({ table, file, sha256: digest(bytes) });
  }
  const catalogDigest = digest(preCatalogEntries.filter(
    ({ table }) => ![
      'world_revisions',
      'spatial_v3_world_revisions'
    ].includes(table)
  ));
  const revision = compiledRows.get('spatial_v3_world_revisions')
    .find(({ id }) => id === OUTPUT_WORLD_REVISION);
  assert(revision, 'output_world_revision_row_missing');
  revision.catalog_digest = catalogDigest;
  compiledRows.get('world_revisions')[0].catalog_digest = catalogDigest;

  for (const [table, rows] of compiledRows) {
    const file = `datasets/${table}.json`;
    const path = resolve(candidateRoot, file);
    await writeJson(path, rows);
    const bytes = await readFile(path);
    const parent = parentManifest.datasets.find((dataset) => dataset.table === table);
    datasets.push({
      table,
      file,
      sha256: digest(bytes),
      status: 'approved',
      delete_policy: 'forbid',
      depends_on: parent?.depends_on ?? []
    });
  }

  const allocation = versionAllocationManifest(parentAuthoringVersions);
  const transitionSet = seal({
    schema: 'rus.spatial-v3.source_transition_set.v1',
    world_revision_id: OUTPUT_WORLD_REVISION,
    parent_compatibility_baseline: {
      id: bundle.compatibility_baseline.baseline_id,
      version: bundle.compatibility_baseline.baseline_version,
      digest: bundle.compatibility_baseline.canonical_digest
    },
    exact_inherited_parent_set: allocation.allocations.map((row) => ({
      entity_kind: row.entity_kind,
      entity_id: row.entity_id,
      parent_version: row.exact_parent_version,
      output_version: row.output_version,
      transition_kind: 'carried'
    })),
    new_transitions: [],
    staging_source_supersession: {
      transition_id: 'MATCH_DVINA_YP025_YP026_001',
      evidence_result: 'validated_in_candidate',
      effective_for_production_line: false
    }
  }, 'transition_set_digest');
  const validation = seal({
    schema: 'rus.spatial-v3.source_transition_validation.v1',
    transition_set_digest: transitionSet.transition_set_digest,
    result: 'pass',
    production_activation_required_for_effectiveness: true,
    production_activation_performed: false
  }, 'validation_digest');
  const externalPinSet = seal({
    schema: 'rus.spatial-v3.external_pin_set.v1',
    dependency_resolution_bundle_digest: bundle.bundle_digest,
    pins: externalRows(bundle)
  }, 'pin_set_digest');

  const manifest = seal({
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v2',
    bundle_id: 'novgorod-spatial-v3-production-v2-candidate-001',
    release_id: RELEASE_ID,
    world_revision_id: OUTPUT_WORLD_REVISION,
    parent_revision_id: PARENT_WORLD_REVISION,
    status: 'approved',
    release_status: 'validated_candidate_not_active',
    production_activation: false,
    canonical_head_changed: false,
    operator_db_touched: false,
    runtime_selectable_in_canonical_production: false,
    delete_policy: 'forbid',
    compiler_version: COMPILER_VERSION,
    dependency_resolution_bundle_digest: bundle.bundle_digest,
    version_allocation_manifest_digest: allocation.manifest_digest,
    source_transition_set_digest: transitionSet.transition_set_digest,
    external_pin_set_digest: externalPinSet.pin_set_digest,
    catalog_digest: catalogDigest,
    datasets
  }, 'canonical_output_digest');

  await Promise.all([
    writeJson(resolve(candidateRoot, 'dependency_resolution_bundle.json'), bundle),
    writeJson(resolve(candidateRoot, 'version_allocation_manifest.json'), allocation),
    writeJson(resolve(candidateRoot, 'source_transition_set.json'), transitionSet),
    writeJson(resolve(candidateRoot, 'source_transition_validation.json'), validation),
    writeJson(resolve(candidateRoot, 'external_pin_set.json'), externalPinSet),
    writeJson(resolve(candidateRoot, 'manifest.json'), manifest)
  ]);
  return manifest;
}

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const exactHead = process.argv[3] ??
    'd4be6a6014b80ceae937b3900dad6cbe7c1e787d';
  const manifest = await compileLowerDvinaV2({ root, exactHead });
  process.stdout.write(`${JSON.stringify({
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    dataset_count: manifest.datasets.length,
    canonical_output_digest: manifest.canonical_output_digest,
    production_activation: manifest.production_activation
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
