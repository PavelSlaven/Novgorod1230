import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const HISTORICAL_PHASE_1A_DIGEST =
  'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605';

export async function loadHistoricalLowerDvinaTracePhase1BPublication({
  rootDir
}) {
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
  return value === HISTORICAL_PHASE_1A_DIGEST;
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
