import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceSpatialSemanticPublication } from
  './lower-dvina-trace-spatial-semantic-publication.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content';
const ACTIVE = Object.freeze({
  profile_digest: '47ce22b695f6dd83877c6cc57d23cb7b0eaf1cf5ae72e500bab147cd03b10ec5',
  profile_canonical_digest: 'be5068dfb5f76c4833dac96e842299288b4aa60ae4bb11d3b55a6f56eb59aec8',
  m12_manifest_digest: 'f342c3b7fa0adf4840b51270c9dfc67c442cdf8f62e2762a98cf5497d2f2c123',
  phase_1a_manifest_digest: '1e61d7a555f82643eda5773cd232755e5072d2fae4fd2edd442e2173f8fe469f',
  phase_1b_manifest_digest: '3258cd3cf534811db77d7be7b9845ee52013e7cd4f295ce9543934aecd0ce955',
  phase_1b_binding_digest: '1732780a7f9f68523830269cf2a8c05368464ee5154ccee4ccee947af47857a4'
});

export async function loadLowerDvinaTraceSpatialSemanticProfile({ rootDir = process.cwd() } = {}) {
  let manifestRaw; let profileRaw; let bundle; let publication;
  try {
    [manifestRaw, profileRaw, bundle, publication] = await Promise.all([
      readFile(resolve(rootDir, ROOT, 'manifest.json')),
      readFile(resolve(rootDir, ROOT, 'spatial-semantic-profile.json')),
      loadLowerDvinaTraceMaterializationBundle({ rootDir,
        scenarioDefinitionRevision: 24 }),
      loadLowerDvinaTraceSpatialSemanticPublication({ rootDir })
    ]);
  } catch { invalid(); }
  const manifest = JSON.parse(manifestRaw); const profile = JSON.parse(profileRaw);
  const digest = hash(profileRaw); const ref = manifest?.content_refs?.spatial_semantic_profile;
  if (manifest?.schema !== 'rus.lower_dvina_trace_m12_content_manifest.v1'
      || manifest.scenario_definition_revision !== 24
      || hash(manifestRaw) !== ACTIVE.m12_manifest_digest
      || digest !== ACTIVE.profile_digest
      || ref?.path !== 'spatial-semantic-profile.json' || ref.digest !== digest
      || ref.id !== profile.profile_id || ref.revision !== profile.revision
      || ref.schema !== profile.schema || profile?.schema
        !== 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 2
      || bundle?.definition_revision !== 24
      || bundle.m12_content_manifest_digest !== ACTIVE.m12_manifest_digest
      || bundle.manifest_digest !== ACTIVE.phase_1a_manifest_digest
      || bundle.artifact_pins?.spatial_semantic_profile?.digest !== digest
      || publication?.manifest_digest !== ACTIVE.phase_1b_manifest_digest
      || publication.binding_digest !== ACTIVE.phase_1b_binding_digest
      || publication.binding?.execution_identity?.phase_1a_manifest_digest
        !== ACTIVE.phase_1a_manifest_digest
      || publication.phase_1a_manifest?.base_definition_ref?.digest
        !== ACTIVE.m12_manifest_digest) invalid();
  return freeze({ schema: 'rus.lower_dvina_trace_s1_loaded_profile.v1',
    artifact_digest: digest, profile_canonical_digest: canonicalDigest(profile),
    publication_identity: { ...ACTIVE }, profile });
}

export function isExactLowerDvinaTraceSpatialSemanticProfile(bundle, loaded) {
  const profile = loaded?.profile;
  const pin = bundle?.artifact_pins?.spatial_semantic_profile;
  const binding = bundle?.materialization_bindings;
  const s1 = binding?.spatial_semantic_materialization;
  return bundle?.definition_revision === 24
    && loaded?.schema === 'rus.lower_dvina_trace_s1_loaded_profile.v1'
    && profile?.schema === 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
    && profile.status === 'approved' && profile.revision === 2
    && profile.scenario_definition_revision === 24
    && pin?.digest === loaded.artifact_digest
    && pin.canonical_digest === loaded.profile_canonical_digest
    && canonicalDigest(bundle.spatial_semantic_profile)
      === loaded.profile_canonical_digest
    && binding?.binding_set_id
      === 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
    && binding.status === 'approved'
    && binding.scenario_definition_revision === 24
    && s1?.profile_ref?.id === profile.profile_id
    && s1.profile_ref.revision === pin.revision
    && s1.profile_ref.schema === pin.schema
    && s1.profile_ref.digest === pin.digest
    && s1.authority_provisioning === 'atomic_new_game_first_entry_p16'
    && s1.fallback_policy === 'forbidden';
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function invalid() { throw Object.assign(new Error('TRACE_S1_PROFILE_INVALID'),
  { code: 'TRACE_S1_PROFILE_INVALID' }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
