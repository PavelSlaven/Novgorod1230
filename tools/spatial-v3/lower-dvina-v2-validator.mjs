import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CANDIDATE_ROOT,
  digest,
  OUTPUT_WORLD_REVISION,
  RELEASE_ID,
  validateDependencyResolutionBundle
} from './lower-dvina-v2-compiler.mjs';

function issue(errors, code, details = {}) {
  errors.push(Object.freeze({ code, ...details }));
}

function verifySeal(value, field) {
  const copy = structuredClone(value);
  const claimed = copy[field];
  delete copy[field];
  return digest(copy) === claimed;
}

export async function validateLowerDvinaV2(root = process.cwd()) {
  const candidateRoot = resolve(root, CANDIDATE_ROOT);
  const errors = [];
  const manifest = JSON.parse(await readFile(resolve(candidateRoot, 'manifest.json')));
  const bundle = JSON.parse(await readFile(resolve(
    candidateRoot,
    'dependency_resolution_bundle.json'
  )));

  try {
    validateDependencyResolutionBundle(bundle);
  } catch (error) {
    issue(errors, error.message);
  }
  for (const [file, field] of [
    ['manifest.json', 'canonical_output_digest'],
    ['version_allocation_manifest.json', 'manifest_digest'],
    ['source_transition_set.json', 'transition_set_digest'],
    ['source_transition_validation.json', 'validation_digest'],
    ['external_pin_set.json', 'pin_set_digest']
  ]) {
    const value = JSON.parse(await readFile(resolve(candidateRoot, file)));
    if (!verifySeal(value, field)) issue(errors, 'sealed_manifest_digest_mismatch', { file });
  }

  if (manifest.release_id !== RELEASE_ID ||
      manifest.world_revision_id !== OUTPUT_WORLD_REVISION ||
      manifest.release_status !== 'validated_candidate_not_active' ||
      manifest.production_activation !== false ||
      manifest.canonical_head_changed !== false ||
      manifest.operator_db_touched !== false ||
      manifest.runtime_selectable_in_canonical_production !== false) {
    issue(errors, 'candidate_activation_boundary_invalid');
  }

  const records = new Map();
  for (const dataset of manifest.datasets ?? []) {
    const bytes = await readFile(resolve(candidateRoot, dataset.file));
    if (digest(bytes) !== dataset.sha256) {
      issue(errors, 'candidate_dataset_digest_mismatch', { table: dataset.table });
    }
    records.set(dataset.table, JSON.parse(bytes));
  }
  const catalogEntries = manifest.datasets
    .filter(({ table }) => ![
      'world_revisions',
      'spatial_v3_world_revisions'
    ].includes(table))
    .map(({ table, file, sha256 }) => ({ table, file, sha256 }));
  if (digest(catalogEntries) !== manifest.catalog_digest) {
    issue(errors, 'candidate_catalog_digest_mismatch');
  }
  const compatibilityRevision = (
    records.get('world_revisions') ?? []
  ).filter(({ id }) => id === OUTPUT_WORLD_REVISION);
  if (compatibilityRevision.length !== 1
      || compatibilityRevision[0].catalog_digest !== manifest.catalog_digest
      || compatibilityRevision[0].status !== 'approved') {
    issue(errors, 'candidate_runtime_catalog_compatibility_projection_missing');
  }

  const versions = records.get('spatial_v3_authoring_versions') ?? [];
  const identities = new Set(versions.map((row) =>
    `${row.entity_kind}:${row.entity_id}:${row.version}:${row.world_revision_id}`
  ));
  if (versions.some((row) => row.entity_kind === 'external_dependency')) {
    issue(errors, 'candidate_revision_local_external_proxy_forbidden');
  }
  if (versions.some((row) => row.world_revision_id !== OUTPUT_WORLD_REVISION)) {
    issue(errors, 'candidate_cross_revision_authoring_version');
  }

  const externalRows = records.get('spatial_v3_external_dependency_versions') ?? [];
  const external = new Set(externalRows.map((row) => [
    row.registry_type,
    row.registry_id,
    row.registry_version,
    row.registry_digest,
    row.dependency_id,
    row.dependency_version,
    row.dependency_digest
  ].join(':')));
  for (const edge of records.get('spatial_v3_authoring_dependency_edges') ?? []) {
    const source = `${edge.source_entity_kind}:${edge.source_entity_id}:${edge.source_version}:${edge.world_revision_id}`;
    if (!identities.has(source)) {
      issue(errors, 'candidate_dependency_source_missing', {
        entity_id: edge.source_entity_id
      });
    }
    if (edge.target_entity_kind === 'external_dependency') {
      const target = [
        edge.target_registry_type,
        edge.target_registry_id,
        edge.target_registry_version,
        edge.target_registry_digest,
        edge.target_entity_id,
        edge.target_version,
        edge.target_dependency_digest
      ].join(':');
      if (!external.has(target)) {
        issue(errors, 'candidate_external_dependency_pin_missing', {
          entity_id: edge.target_entity_id
        });
      }
    } else {
      const target = `${edge.target_entity_kind}:${edge.target_entity_id}:${edge.target_version}:${edge.world_revision_id}`;
      if (!identities.has(target)) {
        issue(errors, 'candidate_internal_dependency_target_missing', {
          entity_id: edge.target_entity_id
        });
      }
      if ([
        edge.target_registry_type,
        edge.target_registry_id,
        edge.target_registry_version,
        edge.target_registry_digest,
        edge.target_dependency_digest
      ].some((value) => value !== null)) {
        issue(errors, 'candidate_internal_dependency_external_pin_forbidden', {
          entity_id: edge.target_entity_id
        });
      }
    }
  }

  for (const [table, rows] of records) {
    for (const row of rows) {
      if (row.world_revision_id !== undefined &&
          row.world_revision_id !== OUTPUT_WORLD_REVISION) {
        issue(errors, 'candidate_cross_revision_row', { table });
        break;
      }
    }
  }

  return Object.freeze({
    schema: 'rus.spatial-v3.production-v2-validation.v1',
    pass: errors.length === 0,
    errors: Object.freeze(errors),
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    dataset_count: records.size,
    authoring_identity_count: versions.length,
    external_dependency_count: externalRows.length,
    production_activation: false
  });
}

async function main() {
  const result = await validateLowerDvinaV2(resolve(process.argv[2] ?? process.cwd()));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
