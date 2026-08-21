import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT = `${ROOT}/phase-m8-content`;

export async function loadLowerDvinaTraceRevision20Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const paths = {manifest:`${CONTENT}/manifest.json`,
    definition:`${CONTENT}/definition.json`,
    initial_ordinary_container:`${CONTENT}/initial-ordinary-container.json`,
    ordinary_container_contents_profile:
      `${CONTENT}/ordinary-container-contents-profile.json`,
    phase_1a_manifest:`${ROOT}/phase-1a-v16/manifest.json`,
    materialization_bindings:
      `${ROOT}/phase-1a-v16/materialization-bindings.json`};
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key,path]) => [key,await read(rootDir,path)])));
  if (!valid(historicalBundle,loaded,paths)) {
    return fail('TRACE_REVISION_20_CONTENT_INVALID',
      'Revision 20 O2b content is stale or incomplete.');
  }
  const materializationBindings = {
    ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value)
  };
  const bundle = {...structuredClone(historicalBundle),definition_revision:20,
    manifest_digest:loaded.phase_1a_manifest.digest,
    phase_1a_manifest:loaded.phase_1a_manifest.value,
    m8_content_manifest_digest:loaded.manifest.digest,
    definition:loaded.definition.value,
    initial_ordinary_container:loaded.initial_ordinary_container.value,
    ordinary_container_contents_profile:
      loaded.ordinary_container_contents_profile.value,
    materialization_bindings:materializationBindings,
    artifact_pins:{...historicalBundle.artifact_pins}};
  for (const [key,artifact,path] of [
    ['phase_1a_manifest',bundle.phase_1a_manifest,paths.phase_1a_manifest],
    ['materialization_bindings',materializationBindings,
      paths.materialization_bindings],
    ['definition',bundle.definition,paths.definition],
    ['initial_ordinary_container',bundle.initial_ordinary_container,
      paths.initial_ordinary_container],
    ['ordinary_container_contents_profile',
      bundle.ordinary_container_contents_profile,
      paths.ordinary_container_contents_profile]
  ]) bundle.artifact_pins[key]={key,path,digest:loaded[key].digest,
    canonical_digest:canonicalDigest(artifact),schema:artifact.schema,
    revision:artifact.revision};
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function valid(historical,l,paths) {
  const files={'definition.json':l.definition.digest,
    'initial-ordinary-container.json':l.initial_ordinary_container.digest,
    'ordinary-container-contents-profile.json':
      l.ordinary_container_contents_profile.digest};
  const m=l.manifest.value,p=l.phase_1a_manifest.value,
    b=l.materialization_bindings.value;
  return historical?.definition_revision === 19
    && m?.schema === 'rus.lower_dvina_trace_m8_content_manifest.v1'
    && m.scenario_definition_revision === 20
    && m.superseded_package_ref?.digest
      === historical.m7_content_manifest_digest
    && exact(m.files,files) && m.content_digest === digestFileMap(files)
    && exactRef(m.content_refs?.definition,l.definition,'definition.json',
      'lower_dvina_trace_v1',20)
    && exactRef(m.content_refs?.initial_ordinary_container,
      l.initial_ordinary_container,'initial-ordinary-container.json',
      'trace_ld_v1_container_player_small_pouch',1,'container_id')
    && exactRef(m.content_refs?.ordinary_container_contents_profile,
      l.ordinary_container_contents_profile,
      'ordinary-container-contents-profile.json',
      'lower_dvina_trace_o2b_existing_container_profile_v2',2,'profile_id')
    && l.definition.value?.revision === 20
    && l.definition.value.supersedes_definition_ref?.digest
      === historical.artifact_pins.definition.digest
    && p?.package_id === 'lower_dvina_trace_phase_1a_v16'
    && p.scenario_definition_revision === 20
    && p.superseded_package_ref?.digest
      === historical.artifact_pins.phase_1a_manifest.digest
    && p.base_definition_ref?.digest === l.manifest.digest
    && exactRef(p.content_refs?.materialization_bindings,
      l.materialization_bindings,paths.materialization_bindings,
      'lower_dvina_trace_phase_1a_materialization_bindings_v16',16,
      'binding_set_id')
    && b?.scenario_definition_revision === 20
    && b.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest
    && b.ordinary_container_contents_materialization?.fallback_policy
      === 'forbidden';
}
async function read(rootDir,path) { const raw=await readFile(resolve(rootDir,path));
  return {value:JSON.parse(raw),digest:createHash('sha256').update(raw).digest('hex')}; }
function exactRef(ref,loaded,path,id,revision,idField='id') { return ref?.path===path
  && ref.id===id && ref.revision===revision && ref.schema===loaded.value.schema
  && ref.digest===loaded.digest && (idField==='id' || loaded.value[idField]===id); }
function exact(actual,expected) { return JSON.stringify(Object.keys(actual??{}).sort())
  ===JSON.stringify(Object.keys(expected).sort())
  &&Object.entries(expected).every(([key,value])=>actual[key]===value); }
function digestFileMap(files) { const payload=Object.entries(files)
  .sort(([a],[b])=>a.localeCompare(b)).map(([name,digest])=>`${name}:${digest}`)
  .join('\n').concat('\n'); return createHash('sha256').update(payload).digest('hex'); }
