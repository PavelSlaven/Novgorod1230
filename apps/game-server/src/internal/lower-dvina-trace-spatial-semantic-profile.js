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
  profile_digest: 'dd29b10de589d6244621172191a6860e1a93c63f42665c67faae24ec724cb202',
  profile_canonical_digest: '704348f529d06db15f9136bbc5e0e02e444e7c1b2c84ae785fa83758a7dcbcc5',
  m11_manifest_digest: 'd2851d72dd338e6b45747e481f8211c719a369a5364bbd7f598e4e7d98acd837',
  phase_1a_manifest_digest: '3ced300f893f659c7a601f995d288ca5bef604e12e9c72352f6386cb9120d2d8',
  phase_1b_manifest_digest: '7a872ccd602cb83c56f4f717a6d424e4d79dbf6f4d1f9ca1ba31f6358c0a88bf',
  phase_1b_binding_digest: '8efc7da30734ce05c357760bd62eb344e90b923825c0755652e61d0c7c156ee1'
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
