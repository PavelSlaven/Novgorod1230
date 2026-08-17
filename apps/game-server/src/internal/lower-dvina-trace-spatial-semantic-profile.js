import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceSpatialSemanticPublication } from
  './lower-dvina-trace-spatial-semantic-publication.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m11-content';
const ACTIVE = Object.freeze({
  profile_digest: '08e0978fd47bc91cfcf4f3d91908c583786e80a2d9a7ffc5e61af85bbd11074c',
  profile_canonical_digest: '2eb959bea4afd4173df9f01a2098762134148c4163a7976980fe79c990a5567c',
  m11_manifest_digest: '29a8144863f7cd78e5b7019a5ee5265e0e380e7802f91a2a7cccc8865c7ca577',
  phase_1a_manifest_digest: '97616177c25fe0e0507afb3df5d7fd9bdc4298cede54f0a8626ce5cfc271586a',
  phase_1b_manifest_digest: '4f4d39587992415ddc258423eaa7e5228b8c2260d3505b2d0b9db7840e3838f0',
  phase_1b_binding_digest: '99febe4b34ae1c179f9cc1aa890bd42762be3b0abb5e1fa8ca97c66c7aeeb369'
});

export async function loadLowerDvinaTraceSpatialSemanticProfile({ rootDir = process.cwd() } = {}) {
  let manifestRaw; let profileRaw; let bundle; let publication;
  try {
    [manifestRaw, profileRaw, bundle, publication] = await Promise.all([
      readFile(resolve(rootDir, ROOT, 'manifest.json')),
      readFile(resolve(rootDir, ROOT, 'spatial-semantic-profile.json')),
      loadLowerDvinaTraceMaterializationBundle({ rootDir,
        scenarioDefinitionRevision: 23 }),
      loadLowerDvinaTraceSpatialSemanticPublication({ rootDir })
    ]);
  } catch { invalid(); }
  const manifest = JSON.parse(manifestRaw); const profile = JSON.parse(profileRaw);
  const digest = hash(profileRaw); const ref = manifest?.content_refs?.spatial_semantic_profile;
  if (manifest?.schema !== 'rus.lower_dvina_trace_m11_content_manifest.v1'
      || manifest.scenario_definition_revision !== 23
      || hash(manifestRaw) !== ACTIVE.m11_manifest_digest
      || digest !== ACTIVE.profile_digest
      || ref?.path !== 'spatial-semantic-profile.json' || ref.digest !== digest
      || ref.id !== profile.profile_id || ref.revision !== profile.revision
      || ref.schema !== profile.schema || profile?.schema
        !== 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 1
      || bundle?.definition_revision !== 23
      || bundle.m11_content_manifest_digest !== ACTIVE.m11_manifest_digest
      || bundle.manifest_digest !== ACTIVE.phase_1a_manifest_digest
      || bundle.artifact_pins?.spatial_semantic_profile?.digest !== digest
      || publication?.manifest_digest !== ACTIVE.phase_1b_manifest_digest
      || publication.binding_digest !== ACTIVE.phase_1b_binding_digest
      || publication.binding?.execution_identity?.phase_1a_manifest_digest
        !== ACTIVE.phase_1a_manifest_digest
      || publication.phase_1a_manifest?.base_definition_ref?.digest
        !== ACTIVE.m11_manifest_digest) invalid();
  return freeze({ schema: 'rus.lower_dvina_trace_s1_loaded_profile.v1',
    artifact_digest: digest, profile_canonical_digest: canonicalDigest(profile),
    publication_identity: { ...ACTIVE }, profile });
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function invalid() { throw Object.assign(new Error('TRACE_S1_PROFILE_INVALID'),
  { code: 'TRACE_S1_PROFILE_INVALID' }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
