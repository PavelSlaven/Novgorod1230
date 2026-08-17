import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceNpcSemanticPublication } from
  './lower-dvina-trace-npc-semantic-publication.js';
import { LOWER_DVINA_TRACE_N1_ACTIVE_AUTHORITY as ACTIVE,
  validateLowerDvinaTraceN1Profile } from
  '../runtime/releases/lower-dvina-trace-n1-production.js';
const ROOT='data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content';
export async function loadLowerDvinaTraceNpcSemanticProfile({rootDir=process.cwd()}={}){
  let manifestRaw,profileRaw,bundle,publication;try{[manifestRaw,profileRaw,bundle,publication]=
    await Promise.all([readFile(resolve(rootDir,ROOT,'manifest.json')),
      readFile(resolve(rootDir,ROOT,'npc-semantic-profile.json')),
      loadLowerDvinaTraceMaterializationBundle({rootDir,scenarioDefinitionRevision:24}),
      loadLowerDvinaTraceNpcSemanticPublication({rootDir})]);}catch{invalid();}
  const manifest=JSON.parse(manifestRaw),profile=JSON.parse(profileRaw),digest=hash(profileRaw),
    ref=manifest?.content_refs?.npc_semantic_profile;
  if(manifest?.schema!=='rus.lower_dvina_trace_m12_content_manifest.v1'
      ||manifest.scenario_definition_revision!==24||hash(manifestRaw)!==ACTIVE.m12_manifest_digest
      ||digest!==ACTIVE.profile_digest||ref?.path!=='npc-semantic-profile.json'
      ||ref.digest!==digest||ref.id!==profile.profile_id||ref.revision!==profile.revision
      ||ref.schema!==profile.schema||!validateLowerDvinaTraceN1Profile(profile)
      ||bundle?.definition_revision!==24
      ||bundle.m12_content_manifest_digest!==ACTIVE.m12_manifest_digest
      ||bundle.manifest_digest!==ACTIVE.phase_1a_manifest_digest
      ||bundle.artifact_pins?.npc_semantic_profile?.digest!==digest
      ||publication?.manifest_digest!==ACTIVE.phase_1b_manifest_digest
      ||publication.binding_digest!==ACTIVE.phase_1b_binding_digest
      ||publication.binding?.execution_identity?.phase_1a_manifest_digest
        !==ACTIVE.phase_1a_manifest_digest
      ||publication.phase_1a_manifest?.base_definition_ref?.digest
        !==ACTIVE.m12_manifest_digest)invalid();
  return freeze({schema:'rus.lower_dvina_trace_n1_loaded_profile.v1',
    artifact_digest:digest,profile_canonical_digest:canonicalDigest(profile),
    publication_identity:{...ACTIVE},profile});
}
function hash(value){return createHash('sha256').update(value).digest('hex');}
function invalid(){throw Object.assign(new Error('TRACE_N1_PROFILE_INVALID'),
  {code:'TRACE_N1_PROFILE_INVALID'});}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
