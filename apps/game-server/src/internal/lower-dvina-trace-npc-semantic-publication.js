import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';
const ROOT='data/world-catalogs/novgorod/lower-dvina-trace-v1';
const PATHS={manifest:`${ROOT}/phase-1b-v19/manifest.json`,
  binding:`${ROOT}/phase-1b-v19/publication-binding.json`,
  phase1a:`${ROOT}/phase-1a-v20/manifest.json`,
  definition:`${ROOT}/phase-m12-content/definition.json`,
  oldManifest:`${ROOT}/phase-1b-v18/manifest.json`,
  oldBinding:`${ROOT}/phase-1b-v18/publication-binding.json`,
  oldPhase1a:`${ROOT}/phase-1a-v19/manifest.json`};
export const TRACE_NPC_SEMANTIC_PHASE_1A_MANIFEST_DIGEST=
  '60ebc56de5d04bf91ccd61899d8206d016b3d182157dd523d311aafd244460fd';
const DIGESTS={manifest:'7de7a6ffe20750755e7654ad00461ab6c2f4244df5220c1ba862aad6ce99c306',
  binding:'3a64bdc5f22db19417d2ca09d70bc43a68ec4fdb052aa518e8aa728b1db84127',
  definition:'996a3106bfccc2f1b2ae131fd1b723cd9e10abcf9ef97b8733f2b31199941065'};
export async function loadLowerDvinaTraceNpcSemanticPublication({rootDir=process.cwd(),
  phase1AManifestDigest=null}={}){
  if(phase1AManifestDigest!=null
      &&phase1AManifestDigest!==TRACE_NPC_SEMANTIC_PHASE_1A_MANIFEST_DIGEST)
    fail('TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN');
  const values=Object.fromEntries(await Promise.all(Object.entries(PATHS).map(
    async([key,path])=>[key,await read(rootDir,path)])));
  const m=values.manifest,b=values.binding,a=values.phase1a,d=values.definition;
  if(m.digest!==DIGESTS.manifest||b.digest!==DIGESTS.binding
      ||a.digest!==TRACE_NPC_SEMANTIC_PHASE_1A_MANIFEST_DIGEST
      ||d.digest!==DIGESTS.definition
      ||m.value?.package_id!=='lower_dvina_trace_phase_1b_v19'
      ||m.value.revision!==19||m.value.status!=='approved'
      ||m.value.publication_status!=='public'
      ||!exactRef(m.value.content_refs?.publication_binding,b,PATHS.binding,
        'lower_dvina_trace_phase_1b_publication_v19',19)
      ||b.value?.materializer_binding_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
      ||b.value.execution_identity?.scenario_definition_revision!==24
      ||b.value.execution_identity?.phase_1a_manifest_digest!==a.digest
      ||b.value.execution_identity?.scenario_definition_digest!==d.digest
      ||!exactRef(b.value.phase_1a_manifest_ref,a,PATHS.phase1a,
        'lower_dvina_trace_phase_1a_v20',20,'package_id')
      ||!exactRef(b.value.scenario_definition_ref,d,PATHS.definition,
        'lower_dvina_trace_v1',24,'scenario_id')
      ||!exactRef(m.value.superseded_package_ref,values.oldManifest,
        PATHS.oldManifest,'lower_dvina_trace_phase_1b_v18',18,'package_id')
      ||!exactRef(b.value.superseded_binding_ref,values.oldBinding,
        PATHS.oldBinding,'lower_dvina_trace_phase_1b_publication_v18',18)
      ||!exactRef(a.value.superseded_package_ref,values.oldPhase1a,
        PATHS.oldPhase1a,'lower_dvina_trace_phase_1a_v19',19,'package_id')
      ||d.value.required_unresolved_refs?.length!==0)fail('TRACE_PHASE_1B_N1_INVALID');
  await assertLowerDvinaTracePhase1BWorldLineage({rootDir,
    compatibility:b.value.world_compatibility,readJson:read});
  return freeze({manifest:m.value,manifest_digest:m.digest,binding:b.value,
    binding_digest:b.digest,phase_1a_manifest:a.value,definition:d.value,
    public_projection:{scenario_id:b.value.scenario_id,
      public_metadata:structuredClone(b.value.public_metadata),
      opening_projection:structuredClone(b.value.opening_projection)}});
}
function exactRef(ref,loaded,path,id,revision,idField='binding_id'){return ref?.path===path
  &&ref.id===id&&ref.revision===revision&&ref.schema===loaded.value.schema
  &&ref.digest===loaded.digest&&loaded.value?.[idField]===id
  &&loaded.value?.revision===revision;}
async function read(rootDir,path){const raw=await readFile(resolve(rootDir,path));return{
  value:JSON.parse(raw),digest:createHash('sha256').update(raw).digest('hex')};}
function fail(code){throw Object.assign(new Error(code),{code,status:409});}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
