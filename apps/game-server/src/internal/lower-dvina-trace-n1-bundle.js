import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
const ROOT='data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT=`${ROOT}/phase-m12-content`;
export async function loadLowerDvinaTraceRevision24Bundle({rootDir,
  historicalBundle,fail=(code)=>{throw new Error(code);},freezeDeep=Object.freeze,
  validateDefinitionPins=()=>{}}={}){
  const paths={manifest:`${CONTENT}/manifest.json`,definition:`${CONTENT}/definition.json`,
    npc_semantic_profile:`${CONTENT}/npc-semantic-profile.json`,
    phase_1a_manifest:`${ROOT}/phase-1a-v20/manifest.json`,
    materialization_bindings:`${ROOT}/phase-1a-v20/materialization-bindings.json`};
  const loaded=Object.fromEntries(await Promise.all(Object.entries(paths).map(
    async([key,path])=>[key,await read(rootDir,path)])));
  if(!validRevision24(historicalBundle,loaded,paths))return fail(
    'TRACE_REVISION_24_CONTENT_INVALID','Revision 24 N1 content is stale or incomplete.');
  const bindings={...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value)};
  const bundle={...structuredClone(historicalBundle),definition_revision:24,
    manifest_digest:loaded.phase_1a_manifest.digest,
    phase_1a_manifest:loaded.phase_1a_manifest.value,
    m12_content_manifest_digest:loaded.manifest.digest,
    definition:loaded.definition.value,
    npc_semantic_profile:loaded.npc_semantic_profile.value,
    materialization_bindings:bindings,
    artifact_pins:{...historicalBundle.artifact_pins}};
  for(const[key,artifact,path]of[
    ['phase_1a_manifest',bundle.phase_1a_manifest,paths.phase_1a_manifest],
    ['materialization_bindings',bindings,paths.materialization_bindings],
    ['definition',bundle.definition,paths.definition],
    ['npc_semantic_profile',bundle.npc_semantic_profile,paths.npc_semantic_profile]]){
    bundle.artifact_pins[key]={key,path,digest:loaded[key].digest,
      canonical_digest:canonicalDigest(artifact),schema:artifact.schema,
      revision:artifact.revision};}
  validateDefinitionPins(bundle);return freezeDeep(bundle);
}
function validRevision24(historical,loaded,paths){const manifest=loaded.manifest.value,
  phase1a=loaded.phase_1a_manifest.value,bindings=loaded.materialization_bindings.value,
  files={'definition.json':loaded.definition.digest,
    'npc-semantic-profile.json':loaded.npc_semantic_profile.digest};
  return[historical?.definition_revision===23,
    manifest?.schema==='rus.lower_dvina_trace_m12_content_manifest.v1',
    manifest.scenario_definition_revision===24,
    manifest.superseded_package_ref?.digest===historical.m11_content_manifest_digest,
    manifest.superseded_definition_ref?.digest===historical.artifact_pins.definition.digest,
    exact(manifest.files,files),manifest.content_digest===digestFileMap(files),
    exactRef(manifest.content_refs?.definition,loaded.definition,'definition.json',
      'lower_dvina_trace_v1',24),
    exactRef(manifest.content_refs?.npc_semantic_profile,
      loaded.npc_semantic_profile,'npc-semantic-profile.json',
      'lower_dvina_trace_n1_zhdanko_o1_profile_v1',1,'profile_id'),
    loaded.definition.value?.supersedes_definition_ref?.digest
      ===historical.artifact_pins.definition.digest,
    phase1a?.package_id==='lower_dvina_trace_phase_1a_v20',
    phase1a.scenario_definition_revision===24,
    phase1a.superseded_package_ref?.digest===historical.artifact_pins.phase_1a_manifest.digest,
    phase1a.base_definition_ref?.digest===loaded.manifest.digest,
    exactRef(phase1a.content_refs?.materialization_bindings,
      loaded.materialization_bindings,paths.materialization_bindings,
      'lower_dvina_trace_phase_1a_materialization_bindings_v20',20,'binding_set_id'),
    bindings?.scenario_definition_revision===24,
    bindings.superseded_binding_ref?.digest
      ===historical.artifact_pins.materialization_bindings.digest,
    bindings.npc_semantic_remainder?.profile_ref?.digest
      ===loaded.npc_semantic_profile.digest,
    bindings.npc_semantic_remainder?.fallback_policy==='forbidden'].every(Boolean);}
async function read(rootDir,path){const raw=await readFile(resolve(rootDir,path));return{
  value:JSON.parse(raw),digest:createHash('sha256').update(raw).digest('hex')};}
function exactRef(ref,loaded,path,id,revision,idField='id'){return ref?.path===path
  &&ref.id===id&&ref.revision===revision&&ref.schema===loaded.value.schema
  &&ref.digest===loaded.digest&&(idField==='id'||loaded.value[idField]===id);}
function exact(actual,expected){return JSON.stringify(Object.keys(actual??{}).sort())
  ===JSON.stringify(Object.keys(expected).sort())
  &&Object.entries(expected).every(([key,value])=>actual[key]===value);}
function digestFileMap(files){const payload=Object.keys(files).sort().map(
  (name)=>`${name}:${files[name]}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');}
