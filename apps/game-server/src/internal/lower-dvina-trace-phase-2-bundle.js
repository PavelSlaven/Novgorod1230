import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-2/manifest.json`;
const BINDING_PATH =
  `${ROOT}/phase-2/wreck-inspection-execution-binding.json`;
const APPROVED_MANIFEST_DIGEST =
  '9e731bde97b8dd3a6d13926f709be9a7c78ff8d66528a131b1e59007f41bb647';
const APPROVED_BINDING_DIGEST =
  '295f2c4f9a9af37c26c3fd1e366341a5f9f1f0708e107c3fd5c1af8bbd402714';

export async function loadLowerDvinaTracePhase2Bundle({
  rootDir = process.cwd()
} = {}) {
  const [manifestFile, bindingFile] = await Promise.all([
    readJson(rootDir, MANIFEST_PATH),
    readJson(rootDir, BINDING_PATH)
  ]);
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  if (manifestFile.digest !== APPROVED_MANIFEST_DIGEST
      || bindingFile.digest !== APPROVED_BINDING_DIGEST
      || manifest.schema !== 'rus.lower_dvina_trace_phase_2_manifest.v1'
      || manifest.package_id !== 'lower_dvina_trace_phase_2_v1'
      || manifest.revision !== 1
      || manifest.status !== 'approved'
      || manifest.scenario_id !== 'lower_dvina_trace_v1'
      || manifest.scenario_definition_revision !== 7
      || manifest.fallback_policy !== 'forbidden'
      || manifest.normalization_policy !== 'forbidden'
      || manifest.alias_policy !== 'forbidden'
      || manifest.phase_3_content !== 'forbidden'
      || binding.schema
        !== 'rus.lower_dvina_trace_phase_2_wreck_inspection_binding.v1'
      || binding.binding_id
        !== 'lower_dvina_trace_phase_2_wreck_inspection_v1'
      || binding.revision !== 1
      || binding.status !== 'approved'
      || binding.scenario_id !== manifest.scenario_id
      || binding.scenario_definition_revision
        !== manifest.scenario_definition_revision
      || binding.fallback_policy !== 'forbidden'
      || binding.normalization_policy !== 'forbidden'
      || binding.alias_policy !== 'forbidden') {
    fail(
      'TRACE_PHASE_2_BUNDLE_ROOT_MISMATCH',
      'The immutable Phase 2 package root is stale or incompatible.'
    );
  }
  assertExactRef(
    manifest.content_refs?.wreck_inspection_execution_binding,
    {
      path: BINDING_PATH,
      id: binding.binding_id,
      revision: binding.revision,
      schema: binding.schema,
      digest: bindingFile.digest
    }
  );
  const sourceFiles = await Promise.all(
    Object.entries(manifest.source_refs).map(async ([key, ref]) => [
      key,
      await readJson(rootDir, ref.path),
      ref
    ])
  );
  for (const [key, loaded, ref] of sourceFiles) {
    if (loaded.digest !== ref.digest) {
      fail(
        'TRACE_PHASE_2_SOURCE_DIGEST_MISMATCH',
        `Pinned Phase 2 source ${key} changed.`
      );
    }
  }
  for (const [ref, idField] of [
    [manifest.definition_ref, 'scenario_id'],
    [manifest.phase_1a_manifest_ref, 'package_id'],
    [manifest.phase_1b_manifest_ref, 'package_id']
  ]) {
    const loaded = await readJson(rootDir, ref.path);
    if (loaded.digest !== ref.digest
        || loaded.value.schema !== ref.schema
        || loaded.value.revision !== ref.revision
        || loaded.value[idField] !== ref.id) {
      fail(
        'TRACE_PHASE_2_DEPENDENCY_MISMATCH',
        `Pinned dependency ${ref.path} changed.`
      );
    }
  }
  return freezeDeep({
    version: 1,
    schema: 'rus.lower_dvina_trace_phase_2_bundle.v1',
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    source_digests: Object.fromEntries(
      sourceFiles.map(([key, loaded]) => [key, loaded.digest])
    ),
    canonical_digest: canonicalDigest({ manifest, binding })
  });
}

function assertExactRef(ref, expected) {
  if (ref?.path !== expected.path
      || ref?.id !== expected.id
      || ref?.revision !== expected.revision
      || ref?.schema !== expected.schema
      || ref?.digest !== expected.digest) {
    fail(
      'TRACE_PHASE_2_CONTENT_REF_MISMATCH',
      'The Phase 2 execution binding ref is stale or incompatible.'
    );
  }
}

async function readJson(rootDir, relativePath) {
  try {
    const raw = await readFile(resolve(rootDir, relativePath));
    return {
      value: JSON.parse(raw.toString('utf8')),
      digest: createHash('sha256').update(raw).digest('hex')
    };
  } catch (error) {
    fail(
      'TRACE_PHASE_2_CONTENT_MISSING',
      `Phase 2 content is unavailable: ${relativePath}.`,
      { cause: error.code }
    );
  }
}

function fail(code, message, details = {}) {
  throw serverError(code, message, { status: 409, details });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
