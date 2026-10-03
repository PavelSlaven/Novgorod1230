import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => hash(canonicalStringify(value));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Deterministic promotion only; a separate mapped-data approval is still required. */
export function buildTargetFiniteProfileMapping({ candidateBytes, approval }) {
  if (approval?.decision !== 'APPROVE_DATA_ONLY'
    || hash(candidateBytes) !== approval.finite_only_ordinary_base_candidate_approval?.candidate_sha256) {
    throw new TypeError('Exact finite-only candidate approval is required.');
  }
  const candidate = JSON.parse(candidateBytes);
  if (candidate.schema !== 'rus.live_world_runtime.m2c_finite_only_ordinary_base_candidate.v1'
    || !candidate.profile?.profile_id || candidate.profile.revision !== 1) {
    throw new TypeError('Exact finite-only candidate is required.');
  }
  const payload = { schema: 'rus.m2c_finite_only_ordinary_base.v1', status: 'approved',
    world_revision_id: candidate.target_world_revision_id,
    source_candidate_sha256: hash(candidateBytes), source_refs: candidate.provenance.source_refs,
    profile: candidate.profile };
  const datasetBytes = json(payload);
  const manifestBytes = json({ schema: 'rus.m2c_finite_only_ordinary_base_mapping.v1', version: 1,
    world_revision_id: payload.world_revision_id, source_candidate_sha256: payload.source_candidate_sha256,
    dataset: { path: 'm2c-finite-only-ordinary-base-approved.json', sha256: hash(datasetBytes) },
    authority: { data_mapping_only: true, import_authorized: false, activation_authorized: false,
      existing_party_migration_authorized: false } });
  return { datasetBytes, manifestBytes };
}

/** Existing item import/activation owns runtime admission of this one compiled row. */
export function buildTargetFiniteCompiledRecords({ mappedBytes, manifestBytes, approval }) {
  const manifest = JSON.parse(manifestBytes); const payload = JSON.parse(mappedBytes);
  if (approval?.decision !== 'APPROVE_DATA_ONLY'
    || hash(manifestBytes) !== approval.finite_only_ordinary_base_mapped_approval?.manifest_sha256
    || hash(mappedBytes) !== manifest.dataset?.sha256
    || manifest.source_candidate_sha256 !== approval.finite_only_ordinary_base_candidate_approval?.candidate_sha256
    || manifest.dataset.path !== 'm2c-finite-only-ordinary-base-approved.json'
    || payload.source_candidate_sha256 !== manifest.source_candidate_sha256
    || payload.world_revision_id !== manifest.world_revision_id
    || payload.schema !== 'rus.m2c_finite_only_ordinary_base.v1' || payload.status !== 'approved') {
    throw new TypeError('Exact separately approved finite-only mapping is required.');
  }
  return [{ record_id: `profile:${payload.profile.profile_id}`, version: payload.profile.revision,
    record_kind: 'profile', family_candidate_ref: null, payload, payload_digest: digest(payload),
    source_pack_digest: payload.source_candidate_sha256, status: 'approved_authoring_not_runtime_selectable' }];
}
