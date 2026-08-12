import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadHistoricalLowerDvinaTracePhase1BV2Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-2.js';
import { loadHistoricalLowerDvinaTracePhase1BV3Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-3.js';
import { loadHistoricalLowerDvinaTracePhase1BV6Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-6.js';
import {
  loadHistoricalLowerDvinaTracePhase1BV4Publication,
  loadHistoricalLowerDvinaTracePhase1BV5Publication,
  loadHistoricalLowerDvinaTracePhase1BV7Publication
} from './lower-dvina-trace-phase-1b-historical-revisions-4-5-7.js';
import { loadHistoricalLowerDvinaTracePhase1BV8Publication } from
  './lower-dvina-trace-phase-1b-historical-revision-8.js';

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
const HISTORICAL_PHASE_1A_V6_DIGEST =
  '5cc5a06136b2f4cbdb8b842558b0d749a2c70c3eff0f1c088aca9a7e0395d1a9';
const HISTORICAL_PHASE_1A_V7_DIGEST =
  'b696a7420a3331915a2c00827f455671e54b005fbe29bf6749fa90482f73a10b';
const HISTORICAL_PHASE_1A_V8_DIGEST =
  'fd4d6cbc5dfdef71b16e8277fdfbd9b88f03d5d0c8c40218a25b89e361858ea0';
const HISTORICAL_PHASE_1A_V11_DIGEST =
  'f10a8e6938ebc7e3a2ece90e7fa147081173b75a44641d3d57f9c9ccd47d33f5';
const HISTORICAL_PHASE_1A_V12_DIGEST =
  'd54f93ce0e29c6b6cbecd95b1a00013cdc5ebb303e6498346588b8cd74976356';
export async function loadHistoricalLowerDvinaTracePhase1BPublication({
  rootDir,
  phase1AManifestDigest
}) {
  const shared = { rootDir, readJson, fail, freezeDeep };
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V12_DIGEST) {
    return loadHistoricalV11Publication({ rootDir });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V11_DIGEST) {
    return loadHistoricalV10Publication({ rootDir });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V8_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV8Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V8_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V7_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV7Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V7_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V6_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV6Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V6_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V5_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV5Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V5_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V4_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV4Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V4_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V2_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV2Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V2_DIGEST
    });
  }
  if (phase1AManifestDigest === HISTORICAL_PHASE_1A_V3_DIGEST) {
    return loadHistoricalLowerDvinaTracePhase1BV3Publication({
      ...shared, phase1ADigest: HISTORICAL_PHASE_1A_V3_DIGEST
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
  const manifest = manifestFile.value, binding = bindingFile.value;
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
  return value === HISTORICAL_PHASE_1A_V12_DIGEST
    || value === HISTORICAL_PHASE_1A_V11_DIGEST
    || value === HISTORICAL_PHASE_1A_V8_DIGEST
    || value === HISTORICAL_PHASE_1A_DIGEST
    || value === HISTORICAL_PHASE_1A_V2_DIGEST
    || value === HISTORICAL_PHASE_1A_V3_DIGEST
    || value === HISTORICAL_PHASE_1A_V4_DIGEST
    || value === HISTORICAL_PHASE_1A_V5_DIGEST
    || value === HISTORICAL_PHASE_1A_V6_DIGEST
    || value === HISTORICAL_PHASE_1A_V7_DIGEST;
}
async function loadHistoricalV11Publication({ rootDir }) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v11/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v11/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v12/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-m4-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== '2848cac36bf1dfd772df8a9773a8a0fe4e787e4f0de202cc1721e124e5f0e5ed'
    || bindingFile.digest
      !== 'e9a2dc5a11328a2635e33adb719ffeeb85f03475baf8a114ed106b1792f11463'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V12_DIGEST
    || definitionFile.digest
      !== '3f07fe5cbadb3bc5f2f0519bf999c89a9e28b6bf9acc4b802dc3266e664d8f16') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical revision 16 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v11'
    || manifest.revision !== 11
    || manifest.content_refs?.publication_binding?.digest !== bindingFile.digest
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v11'
    || binding.revision !== 11
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v12'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v12'
    || phase1A.scenario_definition_revision !== 16
    || definition.revision !== 16) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical revision 16 publication content is inconsistent.');
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
async function loadHistoricalV10Publication({ rootDir }) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v10/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v10/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v11/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-m3-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== '32e9f9626e43b3d46fb5903b66d2f48b68792304d83c84bad3a62646995dd88e'
    || bindingFile.digest
      !== '1fe203797fd373c6e1fa89925bebeb4dd7c8d2f51b329ae0bbd0022b4026558a'
    || phase1AFile.digest !== HISTORICAL_PHASE_1A_V11_DIGEST
    || definitionFile.digest
      !== '277b5ac574c99493fa4500a2314d76356b8d5e88f6f5872450281841e8821c7b') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical revision 15 publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v10'
    || manifest.revision !== 10
    || manifest.content_refs?.publication_binding?.digest
      !== bindingFile.digest
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v10'
    || binding.revision !== 10
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v11'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v11'
    || phase1A.scenario_definition_revision !== 15
    || definition.revision !== 15) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical revision 15 publication content is inconsistent.'
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
