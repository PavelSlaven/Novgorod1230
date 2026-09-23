import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const candidatePath = `${directory}/target-runtime-profiles-candidate.json`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Deterministic data mapping for separate review; performs no writes or activation. */
export async function buildTargetRuntimeProfilesMapping({ repositoryRoot = process.cwd() } = {}) {
  const bytes = await readFile(resolve(repositoryRoot, candidatePath));
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(await readFile(resolve(repositoryRoot,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json'), 'utf8'));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
      || approval.target_runtime_profiles_candidate_approval?.candidate_sha256 !== digest(bytes)
      || candidate.schema !== 'rus.live_world_runtime.target_runtime_profiles_authoring_candidate.v1'
      || candidate.status !== 'pending_independent_data_approval'
      || candidate.approved !== false || candidate.import_authorized !== false
      || candidate.activation_authorized !== false) {
    throw new Error('TARGET_RUNTIME_PROFILES_EXACT_DATA_APPROVAL_REQUIRED');
  }
  for (const source of candidate.source_set) {
    if (digest(await readFile(resolve(repositoryRoot, source.path))) !== source.sha256) {
      throw new Error('TARGET_RUNTIME_PROFILES_SOURCE_DIGEST_MISMATCH');
    }
  }
  const dataset = structuredClone(candidate);
  dataset.status = 'approved';
  dataset.approved = true;
  for (const profile of [dataset.profiles.turn_step,
    dataset.profiles.turn_step.neutral_conversation_profile,
    dataset.profiles.turn_step.ordinary_result_policy,
    dataset.profiles.n1.profile, dataset.profiles.action_production]) {
    if (profile.status !== 'pending_independent_data_approval') {
      throw new Error('TARGET_RUNTIME_PROFILES_STATUS_MAPPING_INVALID');
    }
    profile.status = 'approved';
  }
  const manifest = {
    schema: 'rus.live_world_runtime.target_runtime_profiles_mapping_manifest.v1',
    source_candidate_path: candidatePath,
    source_candidate_sha256: digest(bytes),
    world_revision_id: candidate.target.world_revision_id,
    dataset: { path: 'target-runtime-profiles-approved.json',
      sha256: digest(`${JSON.stringify(dataset, null, 2)}\n`) },
    authority: { data_mapping_only: true, exact_mapped_data_review_required: true,
      import_authorized: false, activation_authorized: false }
  };
  return { dataset, manifest };
}
