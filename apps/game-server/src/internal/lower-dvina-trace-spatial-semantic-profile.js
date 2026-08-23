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
  profile_digest: '20f547096e9631dc0a3843c532bdab4fc606d3ca01d0408ffea1f6137fa6af77',
  profile_canonical_digest: '8b118fc1ba8df3b636924c07b86771d6d6dbc6b595cb64efc22216b7d839f3bc',
  m12_manifest_digest: '2f3710377b840475f5d9af4e7cf9ed71dab017a073806eb032c297fc8119ff32',
  phase_1a_manifest_digest: '65f4a64e0764774f8e04842433a66b8ddfabe13b07cabb3c8360931a2bfeb5f0',
  phase_1b_manifest_digest: '28e5d9bddfb1e027d3017756ac0a1c9c3e107c7ac479e981663727443622f7a3',
  phase_1b_binding_digest: '909d3f7f63fa275ac9e3d777584a062d89c0ee8d8284eb48b2179dec54b79160'
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
      || profile.status !== 'approved' || profile.revision !== 3
      || bundle?.definition_revision !== 24
      || bundle.m12_content_manifest_digest !== ACTIVE.m12_manifest_digest
      || bundle.manifest_digest !== ACTIVE.phase_1a_manifest_digest
      || bundle.artifact_pins?.spatial_semantic_profile?.digest !== digest
      || publication?.manifest_digest !== ACTIVE.phase_1b_manifest_digest
      || publication.binding_digest !== ACTIVE.phase_1b_binding_digest
      || publication.binding?.execution_identity?.phase_1a_manifest_digest
        !== ACTIVE.phase_1a_manifest_digest
      || publication.phase_1a_manifest?.base_definition_ref?.digest
        !== ACTIVE.m12_manifest_digest
      || !exactProfile(profile)) invalid();
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
    && profile.status === 'approved' && profile.revision === 3
    && profile.scenario_definition_revision === 24
    && exactProfile(profile)
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
function exactProfile(profile) {
  return Array.isArray(profile?.envelopes) && profile.envelopes.every((entry) => {
    if (!Array.isArray(entry.required_semantic_requirements)
        || Object.hasOwn(entry, 'topology')) return false;
    if (entry.structural_variant === 'open_one_space') {
      return entry.slot_key === 's1_open_one_space'
        && same(entry.required_semantic_requirements, ['interior_space']);
    }
    return entry.structural_variant === 'descriptive_local_reference'
      && !Object.hasOwn(entry, 'slot_key')
      && same(entry.required_semantic_requirements, []);
  });
}
function same(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function invalid() { throw Object.assign(new Error('TRACE_S1_PROFILE_INVALID'),
  { code: 'TRACE_S1_PROFILE_INVALID' }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
