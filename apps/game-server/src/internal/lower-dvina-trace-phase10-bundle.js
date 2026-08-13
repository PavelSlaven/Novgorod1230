import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT = `${ROOT}/phase-m6-content`;

export async function loadLowerDvinaTraceRevision18Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [manifest, definition, phase10, phase1a, bindings] =
    await Promise.all([
      read(rootDir, `${CONTENT}/manifest.json`),
      read(rootDir, `${CONTENT}/definition.json`),
      read(rootDir, `${CONTENT}/phase-10-bindings.json`),
      read(rootDir, `${ROOT}/phase-1a-v14/manifest.json`),
      read(rootDir, `${ROOT}/phase-1a-v14/materialization-bindings.json`)
    ]);
  if (!valid({ historicalBundle, manifest, definition, phase10,
    phase1a, bindings })) return fail('TRACE_REVISION_18_CONTENT_INVALID');
  const materializationBindings = {
    ...structuredClone(historicalBundle.materialization_bindings),
    binding_set_id: bindings.value.binding_set_id,
    revision: bindings.value.revision,
    scenario_definition_revision: 18,
    superseded_binding_ref: structuredClone(
      bindings.value.superseded_binding_ref),
    reused_immutable_binding_ref: structuredClone(
      bindings.value.reused_immutable_binding_ref),
    binding_resolution_policy: bindings.value.binding_resolution_policy,
    binding_overrides: {
      ...structuredClone(historicalBundle.materialization_bindings
        .binding_overrides),
      ...structuredClone(bindings.value.binding_overrides)
    },
    initial_autonomous_materialization: {
      ...structuredClone(historicalBundle.materialization_bindings
        .initial_autonomous_materialization),
      ...structuredClone(bindings.value.initial_autonomous_materialization_overlay)
    }
  };
  const bundle = { ...structuredClone(historicalBundle),
    definition_revision: 18, manifest_digest: phase1a.digest,
    phase_1a_manifest: phase1a.value,
    m6_content_manifest_digest: manifest.digest,
    definition: definition.value, phase_10_bindings: phase10.value,
    materialization_bindings: materializationBindings,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, loaded, path, value] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v14/manifest.json`,
      phase1a.value],
    ['materialization_bindings', bindings,
      `${ROOT}/phase-1a-v14/materialization-bindings.json`,
      materializationBindings],
    ['definition', definition, `${CONTENT}/definition.json`, definition.value],
    ['phase_10_bindings', phase10, `${CONTENT}/phase-10-bindings.json`,
      phase10.value]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded.digest,
    canonical_digest: canonicalDigest(value), schema: loaded.value.schema,
    revision: loaded.value.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function valid({ historicalBundle: historical, manifest, definition, phase10,
  phase1a, bindings }) {
  const files = { 'definition.json': definition.digest,
    'phase-10-bindings.json': phase10.digest };
  const refs = manifest.value?.content_refs;
  return historical?.definition_revision === 17
    && manifest.value?.schema === 'rus.lower_dvina_trace_m6_content_manifest.v1'
    && manifest.value.scenario_definition_revision === 18
    && manifest.value.superseded_package_ref?.digest
      === historical.m5_content_manifest_digest
    && exact(manifest.value.files, files)
    && manifest.value.content_digest === digestFileMap(files)
    && exactRef(refs?.definition, definition, 'definition.json',
      'lower_dvina_trace_v1', 18)
    && exactRef(refs?.phase_10_bindings, phase10,
      'phase-10-bindings.json',
      'lower_dvina_trace_phase_10_bindings_v1', 1)
    && definition.value?.revision === 18
    && definition.value.supersedes_definition_ref?.digest
      === historical.artifact_pins.definition.digest
    && definition.value.resolved_policy_refs?.phase_10_bindings?.digest
      === phase10.digest
    && phase10.value?.scenario_definition_revision === 18
    && phase10.value.fallback_policy === 'forbidden'
    && phase1a.value?.package_id === 'lower_dvina_trace_phase_1a_v14'
    && phase1a.value.scenario_definition_revision === 18
    && phase1a.value.superseded_package_ref?.digest
      === historical.artifact_pins.phase_1a_manifest.digest
    && phase1a.value.base_definition_ref?.digest === manifest.digest
    && exactRef(phase1a.value.content_refs?.materialization_bindings,
      bindings, `${ROOT}/phase-1a-v14/materialization-bindings.json`,
      'lower_dvina_trace_phase_1a_materialization_bindings_v14', 14)
    && bindings.value?.scenario_definition_revision === 18
    && bindings.value.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest
    && bindings.value.initial_autonomous_materialization_overlay
      ?.packet_placement?.document_contents_access === 'forbidden';
}

async function read(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw),
    digest: createHash('sha256').update(raw).digest('hex') };
}
function exactRef(ref, loaded, path, id, revision) {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest;
}
function exact(actual, expected) {
  return JSON.stringify(Object.keys(actual ?? {}).sort())
    === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
function digestFileMap(files) {
  const payload = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, digest]) => `${name}:${digest}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
