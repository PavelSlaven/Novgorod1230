import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadHistoricalLowerDvinaTracePhase1BV2Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-2.js';
import { loadHistoricalLowerDvinaTracePhase1BV3Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-3.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const HISTORICAL_PHASE_1A_DIGEST =
  'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605';
const HISTORICAL_PHASE_1A_V2_DIGEST =
  'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895';
const HISTORICAL_PHASE_1A_V3_DIGEST =
  '6f115e878a663b6aacb654bf7fe86b651467e1da06161907faac06770d4a9925';
const HISTORICAL_PHASE_1A_V4_DIGEST =
  'dc7e58dfa3382a2a91dd1954c645ad630c8de3b4fb42bdc68888cd72d5fff44f';
const HISTORICAL_PHASE_1A_V5_DIGEST =
  'cde498946faa8c821f09dd80407f4053c7c54f546ba86928c6907908b1e47ac2';

export async function loadHistoricalLowerDvinaTracePhase1BPublication({
  rootDir,
  phase1AManifestDigest
}) {
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V5_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV5Publication({ rootDir });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V4_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV4Publication({ rootDir });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V2_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV2Publication({
      rootDir,
      readJson,
      fail,
      freezeDeep,
      phase1ADigest: HISTORICAL_PHASE_1A_V2_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V3_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV3Publication({
      rootDir, readJson, fail, freezeDeep,
      phase1ADigest: HISTORICAL_PHASE_1A_V3_DIGEST
    });
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
    || value === HISTORICAL_PHASE_1A_V3_DIGEST
    || value === HISTORICAL_PHASE_1A_V4_DIGEST
    || value === HISTORICAL_PHASE_1A_V5_DIGEST;
}

async function loadHistoricalLowerDvinaTracePhase1BV5Publication({
  rootDir
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v5/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v5/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v6/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-4-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'de3e82c3c13e47e26375645fb97bf3e594e2ee3a0bea68d2ab334003f776995d'
    || bindingFile.digest
      !== '94339fb687371c768b10a016a23fbd8544f331842686c0ad95596d60ea7189b1'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V5_DIGEST
    || definitionFile.digest
      !== '1b619e64077a6de447b8e3f9418d85ba4c06ce7e592f6a60bc38a4a4adaef556') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 5 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v5'
    || manifest.revision !== 5
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v5'
    || binding.revision !== 5
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v6'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v6'
    || phase1A.revision !== 6
    || phase1A.scenario_definition_revision !== 10
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 10
    || definition.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 5 identity is incompatible.');
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

async function loadHistoricalLowerDvinaTracePhase1BV4Publication({
  rootDir
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v4/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v4/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v5/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-3-content-v2/definition.json`)
    ]);
  if (manifestFile.digest
      !== '10f470220497e62663ae2238c538fdc686bbedf1fd4e6952c93020bfb9e444bd'
    || bindingFile.digest
      !== '729c04ebb9375ff95a832309c528e01a005f5bc9742f14b9aa108d3905f76acb'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V4_DIGEST
    || definitionFile.digest
      !== 'f0cc939c6f8ebed70b2e02f5df5681d2988044012cc366209a4dd9ee763130f9') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 4 publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v4'
    || manifest.revision !== 4
    || manifest.status !== 'approved'
    || manifest.content_refs?.publication_binding?.digest
      !== bindingFile.digest
    || binding.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v4'
    || binding.revision !== 4
    || binding.status !== 'approved'
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v5'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v5'
    || phase1A.revision !== 5
    || phase1A.scenario_definition_revision !== 9
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 9
    || definition.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 4 identity is incompatible.'
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
