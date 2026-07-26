import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  APPROVED_CONTENT_DIGEST,
  CANDIDATE_ROOT,
  OUTPUT_WORLD_REVISION,
  RELEASE_ID
} from './lower-dvina-boundary-v1-compiler.mjs';
import { digest } from './lower-dvina-v2-compiler.mjs';

const FORWARD = 'wrv3__lower_dvina_yp026_to_yp025';
const REVERSE = 'wrv3__lower_dvina_yp025_to_yp026';

function verifySeal(value, field) {
  const copy = structuredClone(value);
  const claimed = copy[field];
  delete copy[field];
  return claimed === digest(copy);
}

export async function validateLowerDvinaBoundaryV1(root = process.cwd()) {
  const candidateRoot = resolve(root, CANDIDATE_ROOT);
  const errors = [];
  const issue = (code, details = {}) => errors.push({ code, ...details });
  const manifest = JSON.parse(await readFile(resolve(
    candidateRoot, 'manifest.json'
  )));
  for (const [file, field] of [
    ['manifest.json', 'canonical_output_digest'],
    ['dependency_resolution_bundle.json', 'bundle_digest'],
    ['external_pin_set.json', 'pin_set_digest'],
    ['version_allocation_manifest.json', 'manifest_digest'],
    ['source_transition_set.json', 'transition_set_digest'],
    ['source_transition_validation.json', 'validation_digest'],
    ['authoring-approval-evidence.json', 'evidence_digest']
  ]) {
    const value = JSON.parse(await readFile(resolve(candidateRoot, file)));
    if (!verifySeal(value, field)) issue('sealed_manifest_digest_mismatch', { file });
  }
  if (manifest.release_id !== RELEASE_ID
      || manifest.world_revision_id !== OUTPUT_WORLD_REVISION
      || manifest.approved_authoring_content_digest !== APPROVED_CONTENT_DIGEST
      || manifest.release_status !== 'validated_candidate_not_active'
      || manifest.production_activation !== false
      || manifest.canonical_head_changed !== false
      || manifest.operator_db_touched !== false
      || manifest.runtime_selectable_in_canonical_production !== false) {
    issue('candidate_activation_boundary_invalid');
  }

  const records = new Map();
  for (const item of manifest.datasets ?? []) {
    const bytes = await readFile(resolve(candidateRoot, item.file));
    if (digest(bytes) !== item.sha256) {
      issue('candidate_dataset_digest_mismatch', { table: item.table });
    }
    records.set(item.table, JSON.parse(bytes));
  }
  const catalogEntries = manifest.datasets
    .filter(({ table }) => ![
      'world_revisions', 'spatial_v3_world_revisions'
    ].includes(table))
    .map(({ table, file, sha256 }) => ({ table, file, sha256 }));
  if (digest(catalogEntries) !== manifest.catalog_digest) {
    issue('candidate_catalog_digest_mismatch');
  }

  const versions = records.get('spatial_v3_authoring_versions') ?? [];
  const identities = new Set(versions.map((row) =>
    `${row.entity_kind}:${row.entity_id}:${row.version}:${row.world_revision_id}`
  ));
  if (versions.some(({ world_revision_id: revision }) =>
    revision !== OUTPUT_WORLD_REVISION)) {
    issue('candidate_cross_revision_authoring_version');
  }
  const externalRows =
    records.get('spatial_v3_external_dependency_versions') ?? [];
  const external = new Set(externalRows.map((row) => [
    row.registry_type,
    row.registry_id,
    row.registry_version,
    row.registry_digest,
    row.dependency_id,
    row.dependency_version,
    row.dependency_digest
  ].join(':')));
  for (const edge of records.get(
    'spatial_v3_authoring_dependency_edges'
  ) ?? []) {
    const source = [
      edge.source_entity_kind,
      edge.source_entity_id,
      edge.source_version,
      edge.world_revision_id
    ].join(':');
    if (!identities.has(source)) {
      issue('candidate_dependency_source_missing', {
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
        issue('candidate_external_dependency_pin_missing', {
          entity_id: edge.target_entity_id
        });
      }
    } else {
      const target = [
        edge.target_entity_kind,
        edge.target_entity_id,
        edge.target_version,
        edge.world_revision_id
      ].join(':');
      if (!identities.has(target)) {
        issue('candidate_internal_dependency_target_missing', {
          entity_id: edge.target_entity_id
        });
      }
    }
  }

  const routes = (records.get('spatial_v3_world_routes') ?? [])
    .filter(({ id }) => [FORWARD, REVERSE].includes(id));
  const points = records.get('spatial_v3_world_route_points') ?? [];
  const segments = (records.get('spatial_v3_world_route_segments') ?? [])
    .filter(({ world_route_id: id }) => [FORWARD, REVERSE].includes(id));
  const bindings = (records.get(
    'spatial_v3_world_route_endpoint_bindings'
  ) ?? []).filter(({ world_route_id: id }) => [FORWARD, REVERSE].includes(id));
  const transitionContracts = records.get(
    'spatial_v3_spatial_transition_contracts'
  ) ?? [];
  const boundaryContracts = (records.get(
    'spatial_v3_boundary_crossing_contracts'
  ) ?? []).filter(({ route_id: id }) => [FORWARD, REVERSE].includes(id));
  if (routes.length !== 2 || segments.length !== 4 || bindings.length !== 4
      || transitionContracts.filter(({ id }) =>
        id.startsWith('stcv3__lower_dvina_')).length !== 2
      || boundaryContracts.length !== 2) {
    issue('boundary_topology_count_invalid');
  }
  for (const routeId of [FORWARD, REVERSE]) {
    const routeSegments = segments
      .filter(({ world_route_id: id }) => id === routeId)
      .sort((left, right) => left.ordinal - right.ordinal);
    const routePoints = points
      .filter(({ world_route_id: id }) => id === routeId)
      .sort((left, right) => left.ordinal - right.ordinal);
    if (routeSegments.length !== 2 || routePoints.length !== 3
        || routeSegments[0]?.to_point_id !== routeSegments[1]?.from_point_id
        || routePoints[1]?.point_kind !== 'boundary'
        || routePoints[1]?.context_switch_phase !== 'outbound_dispatch') {
      issue('boundary_directed_chain_invalid', { route_id: routeId });
    }
  }
  for (const contract of boundaryContracts) {
    const routeSegments = segments
      .filter(({ world_route_id: id }) => id === contract.route_id)
      .sort((left, right) => left.ordinal - right.ordinal);
    const boundaryPoint = points.find(({ id }) =>
      id === contract.route_point_id);
    if (contract.switch_phase !== 'outbound_dispatch'
        || contract.directionality !== 'directed'
        || contract.inbound_segment_id !== routeSegments[0]?.id
        || contract.outbound_segment_id !== routeSegments[1]?.id
        || boundaryPoint?.point_kind !== 'boundary'
        || boundaryPoint.context_switch_phase !== contract.switch_phase) {
      issue('boundary_crossing_contract_invalid', {
        contract_id: contract.id
      });
    }
  }
  const allowedBases = new Map([
    ['wrsegv3__lower_dvina_yp026_to_yp025__00', 10],
    ['wrsegv3__lower_dvina_yp026_to_yp025__01', 30],
    ['wrsegv3__lower_dvina_yp025_to_yp026__00', 20],
    ['wrsegv3__lower_dvina_yp025_to_yp026__01', 10]
  ]);
  for (const segment of segments) {
    if (segment.base_minutes !== allowedBases.get(segment.id)
        || segment.dynamic_recheck_policy_id !== 'recheck.water_15m'
        || segment.dynamic_recheck_policy_version !== 3) {
      issue('boundary_segment_exact_policy_mismatch', {
        segment_id: segment.id
      });
    }
  }
  const risks = new Set((records.get(
    'spatial_v3_traversal_risk_profiles'
  ) ?? []).map(({ id, version }) => `${id}@${version}`));
  const availability = new Set((records.get(
    'spatial_v3_traversal_availability_policies'
  ) ?? []).map(({ id, version }) => `${id}@${version}`));
  for (const segment of segments) {
    if (!risks.has(`${segment.risk_profile_id}@${segment.risk_profile_version}`)
        || !availability.has(
          `${segment.availability_condition_set_id}@${segment.availability_condition_set_version}`
        )) {
      issue('boundary_segment_policy_ref_unresolved', {
        segment_id: segment.id
      });
    }
  }
  const consequences = records.get(
    'spatial_v3_traversal_consequence_policies'
  ) ?? [];
  if (consequences.length !== 1
      || consequences[0].fatality_allowed
      || consequences[0].craft_destruction_allowed
      || consequences[0].inventory_wipe_allowed
      || !consequences[0].preserves_committed_elapsed
      || !consequences[0].preserves_committed_progress) {
    issue('boundary_consequence_policy_unsafe');
  }
  const source = JSON.parse(await readFile(resolve(
    candidateRoot, 'source/approved-authoring-package.v1.json'
  )));
  if (source.geometry_claim !== 'topological_only'
      || source.spatial_precision !== 'corridor'
      || source.fallback !== 'forbidden') {
    issue('boundary_claim_scope_invalid');
  }

  return Object.freeze({
    schema: 'rus.spatial-v3.lower-dvina-boundary-validation.v1',
    pass: errors.length === 0,
    errors: Object.freeze(errors),
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    route_count: routes.length,
    segment_count: segments.length,
    production_activation: false
  });
}

async function main() {
  const result = await validateLowerDvinaBoundaryV1(resolve(
    process.argv[2] ?? process.cwd()
  ));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
