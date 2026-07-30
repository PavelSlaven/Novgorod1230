import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const HISTORICAL_PHASE_1A_DIGEST =
  'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605';
const HISTORICAL_PHASE_1A_V2_DIGEST =
  'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895';
const HISTORICAL_PHASE_1A_V3_DIGEST =
  '6f115e878a663b6aacb654bf7fe86b651467e1da06161907faac06770d4a9925';

export async function loadHistoricalLowerDvinaTracePhase1BPublication({
  rootDir,
  phase1AManifestDigest
}) {
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V2_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV2Publication({ rootDir });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V3_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV3Publication({ rootDir });
  }
  if (phase1AManifestDigest !== HISTORICAL_PHASE_1A_DIGEST) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_IDENTITY_UNKNOWN',
      'No exact historical Phase 1B publication matches the persisted Phase 1A identity.'
    );
  }
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-0d-v2/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'f2cb774de97e6959b5ea31efaedf8b81bb3bdd3fb963132999c5b990c662749b'
    || bindingFile.digest
      !== '594e6f7cde83510ae4b48ee7bc8c2595bddd10bd4d325eeb33ba0487eb9b7810'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_DIGEST
    || definitionFile.digest
      !== '2d4c940867a34a292435915a0e201d986346c10f1eddc31423fe019025dbc6c0') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v1'
    || manifest.revision !== 1
    || manifest.status !== 'approved'
    || manifest.content_refs?.publication_binding?.digest
      !== bindingFile.digest
    || binding.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v1'
    || binding.revision !== 1
    || binding.status !== 'approved'
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v1'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v1'
    || phase1A.revision !== 1
    || phase1A.scenario_definition_revision !== 5
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 5
    || definition.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B publication identity is incompatible.'
    );
  }
  return freezeDeep({
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    phase_1a_manifest: phase1A,
    definition,
    public_projection: {
      scenario_id: binding.scenario_id,
      public_metadata: structuredClone(binding.public_metadata),
      opening_projection: structuredClone(binding.opening_projection)
    }
  });
}

export function isHistoricalLowerDvinaTracePhase1AManifestDigest(value) {
  return value === HISTORICAL_PHASE_1A_DIGEST
    || value === HISTORICAL_PHASE_1A_V2_DIGEST
    || value === HISTORICAL_PHASE_1A_V3_DIGEST;
}

async function loadHistoricalLowerDvinaTracePhase1BV3Publication({
  rootDir
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v3/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v3/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v3/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-0d-v4/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'aee59570994151f9177445d03ae8a4dcf29c098f2ffb7c7a198c8c43406818eb'
    || bindingFile.digest
      !== 'c5b6aa615c21ac351bbc2d1cbe6774337017f71213205858b4fdedb960a55b45'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V3_DIGEST
    || definitionFile.digest
      !== '1591b10d19deb48393b42fd4d84ad5c770ab8cdc153af2f94a4d7c749383f729') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 3 publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v3'
    || manifest.revision !== 3
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v3'
    || binding.revision !== 3
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v3'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v3'
    || phase1A.revision !== 3
    || phase1A.scenario_definition_revision !== 7
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 7
    || definition.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 3 identity is incompatible.'
    );
  }
  return freezeDeep({
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    phase_1a_manifest: phase1A,
    definition,
    public_projection: {
      scenario_id: binding.scenario_id,
      public_metadata: structuredClone(binding.public_metadata),
      opening_projection: structuredClone(binding.opening_projection)
    }
  });
}

async function loadHistoricalLowerDvinaTracePhase1BV2Publication({ rootDir }) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v2/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v2/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v2/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-0d-v3/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'a8ca136f815b662add09b5cfe7d981fced6a64583944f2b9af157262862e917f'
    || bindingFile.digest
      !== '1e7a45b5017631f381fa972642455cdb8eef81c19d0ecf76bc284bd018560eb9'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V2_DIGEST
    || definitionFile.digest
      !== '3f181993af99ddd7e7d3c0292ac853e168960b99f5cc2c06aaaddd13b8db703c') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 2 publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v2'
    || manifest.revision !== 2
    || manifest.status !== 'approved'
    || manifest.content_refs?.publication_binding?.digest
      !== bindingFile.digest
    || binding.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v2'
    || binding.revision !== 2
    || binding.status !== 'approved'
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v2'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v2'
    || phase1A.revision !== 2
    || phase1A.scenario_definition_revision !== 6
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 6
    || definition.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 2 publication identity is incompatible.'
    );
  }
  return freezeDeep({
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    phase_1a_manifest: phase1A,
    definition,
    public_projection: {
      scenario_id: binding.scenario_id,
      public_metadata: structuredClone(binding.public_metadata),
      opening_projection: structuredClone(binding.opening_projection)
    }
  });
}

async function readJson(rootDir, relativePath) {
  let raw;
  try {
    raw = await readFile(resolve(rootDir, relativePath));
  } catch (error) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_MISSING',
      `Historical publication content is missing: ${relativePath}.`,
      { cause: error.code }
    );
  }
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, status: 409, details });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
