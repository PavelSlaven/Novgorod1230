import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import { parseTsv } from '../tools/world-catalog-workflow/src/tsv.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = 'data/world-base-sources/rus13-base-v1.tar.gz';
const archiveManifestPath =
  'data/world-base-sources/rus13-base-v1.manifest.json';
const placeSeedPath = 'infra/world-base/place_templates.seed.json';
const revisionPath =
  'data/world-catalogs/novgorod/revisions/novgorod_1230_research_revision_001.json';
const baselineManifestPath =
  'data/world-catalogs/novgorod/manifests/novgorod_v6_legacy_baseline.json';
const dependencyRequestPath =
  'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json';
const finalRequestPath =
  'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_REQUEST.json';
const approvalPath =
  'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json';
const g4Member = 'nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED/'
  + 'novgorod_full_graph_g1_g4_v6_game_ready/tsv_import/'
  + 'novgorod_g2_g4_70_cells_v6_g4_locations.tsv';
const placeMember = 'place_templates_scientific_v2_fixed.xlsx';
const regionProfileMember = 'nov_region_audit/novgorod_region_profile_v1.json';
const regionPlaceMember = 'nov_region_audit/'
  + 'novgorod_region_template_links_v1_full_pack_EXTRACTED/'
  + 'novgorod_region_place_templates.tsv';
const socialRoleMember = 'novgorod-region/novgorod_social_roles_v1_enriched.tsv';
const outputRoot =
  'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';

const readJson = async (path) => JSON.parse(await readFile(resolve(repositoryRoot,
  path), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = async (path) => ({ path,
  sha256: sha256(await readFile(resolve(repositoryRoot, path))) });

function archiveMember(path) {
  const result = spawnSync('tar', ['-xOzf', resolve(repositoryRoot, archivePath),
    path], { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8'));
  return result.stdout;
}

function pendingArtifact(payload) {
  const authority = Object.freeze({
    approval_attestation_present: false,
    import_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    existing_party_migration_authorized: false,
    runtime_item_creation_authorized: false
  });
  const unsigned = Object.freeze({ ...payload, authority });
  return Object.freeze({ ...unsigned, request_digest: canonicalDigest(unsigned) });
}

export function validatePendingGate1OwnerDataArtifacts({ parent, activation }) {
  const artifacts = [parent, activation];
  if (parent.schema !== 'rus.gate1_parent_world_revision_import_request.v1'
      || parent.status !== 'pending_independent_approval'
      || parent.graph_node_transitions.length !== 9
      || new Set(parent.graph_node_transitions.map(({ graph_node_id }) =>
        graph_node_id)).size !== 9
      || parent.exact_dependencies.place_templates.length !== 6
      || parent.exact_dependencies.region_place_templates.length !== 6
      || parent.requested_authoring_promotions.world_revisions.length !== 1
      || parent.requested_authoring_promotions.grants_runtime_activation
        !== false
      || activation.schema !==
        'rus.gate1_v5_v6_new_development_activation_request.v1'
      || activation.status !== 'pending_independent_runtime_approval'
      || activation.requested_scope !== 'new_development_parties_only'
      || activation.prerequisite_request_digest !== parent.request_digest) {
    throw new Error('GATE1_PENDING_ARTIFACT_INVALID');
  }
  for (const artifact of artifacts) {
    if (artifact.authority.approval_attestation_present !== false
        || artifact.authority.import_authorized !== false
        || artifact.authority.activation_authorized !== false
        || artifact.authority.production_authorized !== false
        || artifact.authority.existing_party_migration_authorized !== false
        || artifact.authority.runtime_item_creation_authorized !== false) {
      throw new Error('GATE1_PENDING_ARTIFACT_AUTHORITY_FORBIDDEN');
    }
  }
  const permissions = activation.requested_permissions;
  if (permissions.production_activation !== false
      || permissions.existing_party_migration !== false
      || permissions.old_save_rematerialization !== false
      || permissions.authoring_only_functional_allocation_runtime_selection
        !== false
      || permissions.runtime_item_creation !== false) {
    throw new Error('GATE1_RUNTIME_SCOPE_FORBIDDEN');
  }
  for (const artifact of artifacts) {
    const { request_digest: claimed, ...unsigned } = artifact;
    if (claimed !== canonicalDigest(unsigned)) {
      throw new Error('GATE1_PENDING_ARTIFACT_DIGEST_INVALID');
    }
  }
  return true;
}

export function validateGate1OwnerDataAuthoringAttestation({ parent,
  activation, attestation }) {
  validatePendingGate1OwnerDataArtifacts({ parent, activation });
  const expectedScope = {
    proposed_world_base_rows: parent.proposed_world_base_rows.map((row) => ({
      id: row.id, source_status: row.status
    })),
    authoring_promotions: parent.requested_authoring_promotions,
    unchanged_approved_dependencies: {
      region_social_roles: parent.exact_dependencies.region_social_roles.map(
        ({ source_row: row, requested_status }) => ({
          id: row.role_id, source_status: row.status, requested_status
        }))
    }
  };
  const expectedSourceHashes = {
    archive_sha256: parent.source_snapshot.sha256,
    g4_member_sha256: parent.source_snapshot.archive_member_sha256,
    place_seed_sha256: parent.exact_dependencies.place_template_source.sha256,
    place_member_sha256:
      parent.exact_dependencies.place_template_source.archive_member_sha256,
    region_profile_member_sha256:
      parent.exact_dependencies.region.source.archive_member_sha256,
    region_place_member_sha256:
      parent.exact_dependencies.region_place_template_source
        .archive_member_sha256,
    social_role_member_sha256:
      parent.exact_dependencies.region_social_roles[0].source
        .archive_member_sha256,
    research_revision_sha256: parent.research_revision_source.sha256,
    baseline_manifest_sha256: parent.proposed_world_base_rows[0].source.sha256,
    g4_dependency_request_sha256: parent.existing_approval_evidence[0].sha256,
    final_approval_request_sha256: parent.existing_approval_evidence[1].sha256,
    final_approval_attestation_sha256:
      parent.existing_approval_evidence[2].sha256
  };
  const authority = attestation.authority ?? {};
  if (attestation.schema !==
        'rus.gate1_parent_world_revision_authoring_approval_attestation.v1'
      || attestation.status !==
        'approved_authoring_and_transactional_import_readback'
      || attestation.parent_request_digest !== parent.request_digest
      || attestation.activation_request_digest !== activation.request_digest
      || attestation.activation_request_status !==
        'pending_independent_runtime_approval'
      || canonicalDigest(attestation.approved_scope)
        !== canonicalDigest(expectedScope)
      || canonicalDigest(attestation.approved_source_hashes)
        !== canonicalDigest(expectedSourceHashes)
      || authority.approval_attestation_present !== true
      || authority.authoring_promotions_authorized !== true
      || authority.import_authorized !== true
      || authority.transactional_import_readback_only !== true
      || authority.exact_readback_required !== true
      || authority.activation_authorized !== false
      || authority.production_authorized !== false
      || authority.existing_party_migration_authorized !== false
      || authority.old_save_rematerialization_authorized !== false
      || authority.authoring_only_functional_allocation_runtime_selection
        !== false
      || authority.runtime_item_creation_authorized !== false) {
    throw new Error('GATE1_AUTHORING_ATTESTATION_INVALID');
  }
  const { attestation_digest: claimed, ...unsigned } = attestation;
  if (claimed !== canonicalDigest(unsigned)) {
    throw new Error('GATE1_AUTHORING_ATTESTATION_DIGEST_INVALID');
  }
  return true;
}

export async function buildGate1OwnerDataArtifacts() {
  const [revision, baseline, archiveManifest, placeSeed, dependencyRequest,
    finalRequest, finalApproval, archive, revisionSource, baselineSource,
    placeSeedSource, dependencySource, finalRequestSource, approvalSource] =
    await Promise.all([
      readJson(revisionPath), readJson(baselineManifestPath),
      readJson(archiveManifestPath), readJson(placeSeedPath),
      readJson(dependencyRequestPath), readJson(finalRequestPath),
      readJson(approvalPath),
      source(archivePath), source(revisionPath), source(baselineManifestPath),
      source(placeSeedPath), source(dependencyRequestPath),
      source(finalRequestPath), source(approvalPath)
  ]);
  const archiveFile = (path) => archiveManifest.files.find((file) =>
    file.path === path);
  const g4Bytes = archiveMember(g4Member);
  const placeBytes = archiveMember(placeMember);
  const regionProfileBytes = archiveMember(regionProfileMember);
  const regionPlaceBytes = archiveMember(regionPlaceMember);
  const socialRoleBytes = archiveMember(socialRoleMember);
  if (archive.sha256 !== archiveManifest.archive.sha256
      || archive.sha256 !== dependencyRequest.source_snapshot.archive_sha256
      || dependencyRequest.source_snapshot.g4_dataset_path !== g4Member
      || sha256(g4Bytes) !== archiveFile(g4Member)?.sha256
      || sha256(placeBytes) !== archiveFile(placeMember)?.sha256
      || sha256(regionProfileBytes) !== archiveFile(regionProfileMember)?.sha256
      || sha256(regionPlaceBytes) !== archiveFile(regionPlaceMember)?.sha256
      || sha256(socialRoleBytes) !== archiveFile(socialRoleMember)?.sha256
      || revision.source_manifest_digest !== baseline.manifest_digest) {
    throw new Error('GATE1_SOURCE_SNAPSHOT_MISMATCH');
  }
  if (finalApproval.activation_authorized !== false
      || finalApproval.g4_status_transition_count !== 9
      || finalApproval.request_digest !== finalRequest.request_digest
      || revision.status !== 'staging') {
    throw new Error('GATE1_SOURCE_AUTHORITY_INVALID');
  }
  const requestedIds = dependencyRequest.profile_mappings
    .map(({ graph_node_id }) => graph_node_id).sort();
  const finalTransitions = new Map(finalRequest.g4_status_transitions
    .map((transition) => [transition.id, transition]));
  if (finalTransitions.size !== requestedIds.length
      || finalRequest.g4_status_transitions.length !== requestedIds.length) {
    throw new Error('GATE1_G4_APPROVED_TRANSITION_SET_MISMATCH');
  }
  const regionProfile = JSON.parse(regionProfileBytes.toString('utf8'));
  const sourceRows = parseTsv(g4Bytes.toString('utf8')
    .replace(/^\uFEFF/u, ''));
  const regionPlaceRows = parseTsv(regionPlaceBytes.toString('utf8')
    .replace(/^\uFEFF/u, ''));
  const socialRoleRows = parseTsv(socialRoleBytes.toString('utf8')
    .replace(/^\uFEFF/u, ''));
  const byId = new Map(sourceRows.map((row) => [row.id, row]));
  const graphNodeTransitions = requestedIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`GATE1_G4_SOURCE_ROW_MISSING:${id}`);
    const approved = dependencyRequest.profile_mappings.find(
      ({ graph_node_id }) => graph_node_id === id);
    const finalTransition = finalTransitions.get(id);
    if (row.status !== approved.current_status
        || row.place_template_id !== approved.place_template_id
        || finalTransition?.from_status !== row.status
        || finalTransition?.to_status !== approved.requested_status) {
      throw new Error(`GATE1_G4_SOURCE_ROW_DRIFT:${id}`);
    }
    return Object.freeze({ graph_node_id: id, source_row: Object.freeze({
      id: row.id, slug: row.slug, title: row.title,
      node_type: row.node_type, scale_level: row.scale_level,
      parent_node_id: row.parent_node_id, region_id: row.region_id,
      region_cell_code: row.region_cell_code,
      place_template_id: row.place_template_id,
      status: row.status, confidence: row.confidence,
      sources: JSON.parse(row.sources), audit_notes: row.audit_notes
    }), requested_status: approved.requested_status,
    approval_basis: Object.freeze({ path: approvalPath,
      request_digest: finalApproval.request_digest,
      candidate_digest: finalApproval.candidate_digest }) });
  });
  const placeTemplateIds = [...new Set(graphNodeTransitions
    .map(({ source_row }) => source_row.place_template_id))].sort();
  const placeTemplates = placeTemplateIds.map((id) => {
    const row = placeSeed.find((candidate) => candidate.id === id);
    if (!row || row.status !== 'draft') {
      throw new Error(`GATE1_PLACE_TEMPLATE_MISSING:${id}`);
    }
    return Object.freeze({ source_row: Object.freeze(row),
      requested_status: 'approved' });
  });
  const regionPlaceTemplates = placeTemplateIds.map((placeTemplateId) => {
    const row = regionPlaceRows.find((candidate) =>
      candidate.place_template_id === placeTemplateId);
    if (!row || row.id !== `rpt_novgorod_${placeTemplateId.slice(3)}`
        || row.status !== 'draft') {
      throw new Error(`GATE1_REGION_PLACE_TEMPLATE_MISSING:${placeTemplateId}`);
    }
    return Object.freeze({ source_row: Object.freeze(row),
      requested_status: 'approved' });
  });
  const guardRole = socialRoleRows.find(({ role_id }) =>
    role_id === 'nov_role_guard');
  if (!guardRole || guardRole.region_id !== revision.region_id
      || guardRole.status !== 'approved') {
    throw new Error('GATE1_REGION_SOCIAL_ROLE_MISSING:nov_role_guard');
  }
  if (!regionProfile.metadata.region_id_aliases.includes(revision.region_id)) {
    throw new Error(`GATE1_REGION_SOURCE_MISSING:${revision.region_id}`);
  }
  const parentPayload = {
    schema: 'rus.gate1_parent_world_revision_import_request.v1',
    status: 'pending_independent_approval',
    operation: 'import_canonical_parent_and_exact_approved_g4_transitions',
    source_snapshot: Object.freeze({ ...archive,
      archive_member: g4Member,
      archive_member_sha256: sha256(g4Bytes),
      place_template_member: placeMember,
      place_template_member_sha256: sha256(placeBytes) }),
    research_revision_source: Object.freeze({ ...revisionSource,
      map_revision_id: revision.map_revision_id,
      source_manifest_digest: revision.source_manifest_digest,
      graph_digest: revision.graph_digest,
      source_status: revision.status }),
    proposed_world_base_rows: Object.freeze([
      Object.freeze({
        id: baseline.source_id,
        parent_revision_id: null,
        title: baseline.source_id,
        effective_from: `${baseline.historical_horizon}-01-01`,
        effective_to: null,
        catalog_digest: baseline.manifest_digest,
        status: 'draft',
        source: baselineSource
      }),
      Object.freeze({
        id: revision.map_revision_id,
        parent_revision_id: revision.parent_revision_id,
        title: revision.map_revision_id,
        effective_from: `${revision.historical_horizon.year}-01-01`,
        effective_to: null,
        catalog_digest: revision.graph_digest,
        status: 'draft',
        source: revisionSource
      })
    ]),
    exact_dependencies: Object.freeze({
      region: Object.freeze({ source_row: Object.freeze({
        id: revision.region_id,
        slug: regionProfile.metadata.region_id,
        canonical_name: regionProfile.metadata.region_title,
        display_name: regionProfile.metadata.region_title,
        alt_names: regionProfile.metadata.region_id_aliases,
        status: regionProfile.region_identity?.status
          ?? regionProfile.metadata.status,
        confidence: regionProfile.region_identity?.confidence
          ?? regionProfile.metadata.confidence
      }), requested_status: 'approved',
        source: Object.freeze({ archive_member: regionProfileMember,
          archive_member_sha256: sha256(regionProfileBytes) }) }),
      place_templates: Object.freeze(placeTemplates),
      place_template_source: Object.freeze({ ...placeSeedSource,
        archive_member: placeMember,
        archive_member_sha256: sha256(placeBytes) }),
      region_place_templates: Object.freeze(regionPlaceTemplates),
      region_place_template_source: Object.freeze({
        archive_member: regionPlaceMember,
        archive_member_sha256: sha256(regionPlaceBytes)
      }),
      region_social_roles: Object.freeze([Object.freeze({
        source_row: Object.freeze(guardRole), requested_status: 'approved',
        source: Object.freeze({ archive_member: socialRoleMember,
          archive_member_sha256: sha256(socialRoleBytes) })
      })])
    }),
    graph_node_transitions: Object.freeze(graphNodeTransitions),
    requested_authoring_promotions: Object.freeze({
      world_revisions: Object.freeze([{ id: revision.map_revision_id,
        from_status: 'draft', to_status: 'approved' }]),
      regions: Object.freeze([{ id: revision.region_id,
        from_status: regionProfile.region_identity?.status
          ?? regionProfile.metadata.status, to_status: 'approved' }]),
      place_templates: Object.freeze(placeTemplateIds.map((id) => ({ id,
        from_status: 'draft', to_status: 'approved' }))),
      region_place_templates: Object.freeze(regionPlaceTemplates.map(
        ({ source_row }) => ({ id: source_row.id, from_status: 'draft',
          to_status: 'approved' }))),
      graph_nodes: Object.freeze(graphNodeTransitions.map((transition) => ({
        id: transition.graph_node_id,
        from_status: transition.source_row.status,
        to_status: transition.requested_status
      }))),
      requires_independent_authoring_approval: true,
      requires_transactional_import_and_readback: true,
      grants_runtime_activation: false
    }),
    requested_import: Object.freeze({
      only_after_authoring_promotion_attestation: true,
      transactional: true,
      exact_readback_required: true,
      grants_runtime_activation: false
    }),
    existing_approval_evidence: Object.freeze([dependencySource,
      finalRequestSource, approvalSource]),
    required_independent_decision:
      'approve_authoring_promotions_then_transactional_import_and_readback'
  };
  const parent = pendingArtifact(parentPayload);
  const activationPayload = {
    schema: 'rus.gate1_v5_v6_new_development_activation_request.v1',
    status: 'pending_independent_runtime_approval',
    requested_scope: 'new_development_parties_only',
    operational_request_schema: 'rus.runtime_catalog_activation_request.v2',
    operational_request_status:
      'blocked_until_approved_import_and_exact_readback',
    requested_catalog: Object.freeze({
      target_revision: Object.freeze(finalRequest.target_revision),
      authoring_approval_request_digest: finalRequest.request_digest,
      authoring_approval_candidate_digest: finalApproval.candidate_digest,
      authoring_approval_attestation: approvalSource
    }),
    compatible_worlds: Object.freeze(await Promise.all([5, 6].map(
      async (version) => {
        const path = `data/world-catalogs/novgorod/spatial-v3/candidates/`
          + `spatial-v3-production-v${version}/manifest.json`;
        const manifest = await readJson(path);
        return Object.freeze({ release_id: manifest.release_id,
          world_revision_id: manifest.world_revision_id,
          world_catalog_digest: manifest.catalog_digest,
          world_manifest: await source(path),
          current_release_status: manifest.release_status,
          current_production_activation: manifest.production_activation });
      }))),
    prerequisite_request_digest: parent.request_digest,
    requested_permissions: Object.freeze({
      import_approved_item_container_catalog: true,
      activate_for_new_development_parties_only: true,
      production_activation: false,
      existing_party_migration: false,
      old_save_rematerialization: false,
      authoring_only_functional_allocation_runtime_selection: false,
      runtime_item_creation: false
    }),
    required_independent_decision:
      'approve_exact_v5_v6_new_development_runtime_activation'
  };
  const artifacts = Object.freeze({
    parent,
    activation: pendingArtifact(activationPayload)
  });
  validatePendingGate1OwnerDataArtifacts(artifacts);
  return artifacts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifacts = await buildGate1OwnerDataArtifacts();
  if (process.argv.includes('--write')) {
    await mkdir(resolve(repositoryRoot, outputRoot), { recursive: true });
    for (const [name, value] of Object.entries(artifacts)) {
      await writeFile(resolve(repositoryRoot, outputRoot,
        `${name}-${name === 'parent' ? 'import-request' : 'request'}.json`),
      `${JSON.stringify(value, null, 2)}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
  }
}
