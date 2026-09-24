import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { validNeutralActionProductionProfile } from './lower-dvina-trace-a1-bundle.js';

/** The separate mapped-data approval owns applicability; absent owners stay absent. */
export async function loadTargetRuntimeProfiles({ rootDir = process.cwd(), worldRevisionId } = {}) {
  const root = 'data/world-catalogs/novgorod/live-world-runtime-v17';
  const approval = JSON.parse(await readFile(resolve(rootDir,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json'), 'utf8'));
  const pin = approval.target_runtime_profiles_mapped_approval;
  if (!pin?.manifest_sha256) gap();
  const manifestBytes = await readFile(resolve(rootDir, root, 'target-runtime-profiles-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (hash(manifestBytes) !== pin.manifest_sha256
    || manifest.source_candidate_sha256 !== approval.target_runtime_profiles_candidate_approval?.candidate_sha256
    || manifest.world_revision_id !== worldRevisionId
    || manifest.dataset?.path !== 'target-runtime-profiles-approved.json') gap();
  const bytes = await readFile(resolve(rootDir, root, manifest.dataset.path));
  if (hash(bytes) !== manifest.dataset.sha256) gap();
  const data = JSON.parse(bytes);
  if (data.status !== 'approved' || data.target?.world_revision_id !== worldRevisionId
    || data.profiles?.turn_step?.status !== 'approved'
    || !validNeutralActionProductionProfile(data.profiles.action_production)) gap();
  const turn = data.profiles.turn_step;
  return freeze({ schema: 'rus.live_world_runtime.target_runtime_profiles_loaded.v1',
    world_revision_id: worldRevisionId, candidate_sha256: manifest.source_candidate_sha256,
    manifest_sha256: pin.manifest_sha256,
    turn_profile: Object.freeze({ profile: turn, pin: { artifact_id: turn.profile_set_id,
      revision: turn.revision, digest: canonicalDigest(turn) } }),
    ordinary_profiles: Object.freeze({ s1: null, n1: { ...data.profiles.n1,
      target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability,
        n1_binding_basis: data.n1_binding_basis } } }),
    materialization_profiles: Object.freeze({ ordinaryMaterializationProfile: null,
      ordinaryContainerContentsProfile: null, localFireProfile: null,
      actionProductionProfile: Object.freeze({ schema: 'rus.live_world_runtime.a1_loaded_profile.v1',
        artifact_digest: manifest.dataset.sha256, profile: data.profiles.action_production,
        target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability } }) }),
    capability_gaps: [...data.capability_gaps, ...data.consumer_gaps.filter((entry) =>
      !['M2C_TARGET_A1_PROFILE_CONSUMER_GAP', 'M2C_TARGET_N1_PROFILE_BINDING_CONSUMER_GAP'].includes(entry.code))],
    applicability: data.applicability });
}

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function gap() { throw serverError('SPATIAL_V3_TARGET_RUNTIME_PROFILE_APPROVAL_REQUIRED',
  'Exact separately reviewed target runtime profile mapping is required.', { status: 503 }); }
