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
  profile_digest: '6f098af0e8be7a5acff46a270668b71055add42e535ff376578785a715159f86',
  profile_canonical_digest: '1ccdfc04a23a7071d9e425496897e13f4a2afaa88493f32e94d7a1b2248f781e',
  m12_manifest_digest: '2460b7089e1e825054adcb707e1907c9deb32a2cd3dd0a55f035547c44cca110',
  phase_1a_manifest_digest: 'd11563d81d0249fcd8efe95a99cb53ace6f8ecb76ffab42a6bb8c16b5eb2cd6b',
  phase_1b_manifest_digest: '1184e6dad56bed75b1b7bbaf700b9fe606109074d361a862249da7cb5c8ffcf7',
  phase_1b_binding_digest: '8c8b7dd7410de91735f70809c05a95a9272a6a3555c3f7e2901c952f2e099228'
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
  return ([
    bundle?.definition_revision === 24
      && binding?.binding_set_id
        === 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
      && binding.scenario_definition_revision === 24,
    bundle?.definition_revision === 25
      && binding?.binding_set_id
        === 'lower_dvina_trace_phase_1a_materialization_bindings_v21'
      && binding.scenario_definition_revision === 25
  ].some(Boolean))
    && loaded?.schema === 'rus.lower_dvina_trace_s1_loaded_profile.v1'
    && profile?.schema === 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
    && profile.status === 'approved' && profile.revision === 3
    && profile.scenario_definition_revision === 24
    && exactProfile(profile)
    && pin?.digest === loaded.artifact_digest
    && pin.canonical_digest === loaded.profile_canonical_digest
    && canonicalDigest(bundle.spatial_semantic_profile)
      === loaded.profile_canonical_digest
    && binding.status === 'approved'
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
