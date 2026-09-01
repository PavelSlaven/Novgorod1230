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
const V27 = Object.freeze({
  manifest: `${ROOT}/phase-2-v27/manifest.json`,
  binding: `${ROOT}/phase-2-v27/wreck-inspection-execution-binding.json`,
  manifestDigest: '47dbb945a70ed29254f9ad4e6dd3206d9905e79bf0d930d99501c1c07a9e26ea',
  bindingDigest: '0231ded307485da2f125d4d5516ecb43f16e6a225f5cffe1ab0cabf0244d2a1d',
  packageId: 'lower_dvina_trace_phase_2_v27', scenarioRevision: 27, bindingRevision: 27
});
const V29 = Object.freeze({
  manifest: `${ROOT}/phase-2-v29/manifest.json`,
  binding: `${ROOT}/phase-2-v29/wreck-inspection-execution-binding.json`,
  manifestDigest: 'eca29ab8181169bc7d6bb1ced45a0e68074b42b68d3441a958ef27c298fe2d21',
  bindingDigest: '18b6f9cd01a4a5fc3b6a08f8d6d3bca078f6712a8544c6d3eedc9395cc1ecd62',
  packageId: 'lower_dvina_trace_phase_2_v29', scenarioRevision: 29, bindingRevision: 29
});
const V30 = Object.freeze({
  manifest: `${ROOT}/phase-2-v30/manifest.json`,
  binding: `${ROOT}/phase-2-v30/wreck-inspection-execution-binding.json`,
  manifestDigest: 'ba485df35cc8122f430a5043741f4a1a9efc9ad46e6176eec925a65899d902c8',
  bindingDigest: '446e795a370408bb4b8d953cbd1669e01e3e665187e3163cd6739e8e1a721c15',
  packageId: 'lower_dvina_trace_phase_2_v30', scenarioRevision: 30, bindingRevision: 30
});
const V31 = Object.freeze({
  manifest: `${ROOT}/phase-2-v31/manifest.json`,
  binding: `${ROOT}/phase-2-v31/wreck-inspection-execution-binding.json`,
  manifestDigest: 'acdeda78600635b50c2a4360dda60cc5dc2d38c493ce5f6bf0fdcc84dda4ad87',
  bindingDigest: 'e4450ec310929514faf6817fe99ecd6792211a974cfa264de61fd71df069a29b',
  packageId: 'lower_dvina_trace_phase_2_v31', scenarioRevision: 31, bindingRevision: 31
});

export async function loadLowerDvinaTracePhase2Bundle({
  rootDir = process.cwd(), scenarioDefinitionRevision = null
} = {}) {
  const selected = scenarioDefinitionRevision === 31 ? V31 : scenarioDefinitionRevision === 30 ? V30 : scenarioDefinitionRevision === 29 ? V29
    : [27, 28].includes(scenarioDefinitionRevision) ? V27 : {
    manifest: MANIFEST_PATH, binding: BINDING_PATH,
    manifestDigest: APPROVED_MANIFEST_DIGEST,
    bindingDigest: APPROVED_BINDING_DIGEST,
    packageId: 'lower_dvina_trace_phase_2_v1', scenarioRevision: 7, bindingRevision: 1
  };
  const [manifestFile, bindingFile] = await Promise.all([
    readJson(rootDir, selected.manifest),
    readJson(rootDir, selected.binding)
  ]);
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  if (manifestFile.digest !== selected.manifestDigest
      || bindingFile.digest !== selected.bindingDigest
      || manifest.schema !== 'rus.lower_dvina_trace_phase_2_manifest.v1'
      || manifest.package_id !== selected.packageId
      || manifest.revision !== selected.bindingRevision
      || manifest.status !== 'approved'
      || manifest.scenario_id !== 'lower_dvina_trace_v1'
      || manifest.scenario_definition_revision !== selected.scenarioRevision
      || manifest.fallback_policy !== 'forbidden'
      || manifest.normalization_policy !== 'forbidden'
      || manifest.alias_policy !== 'forbidden'
      || manifest.phase_3_content !== 'forbidden'
      || binding.schema
        !== 'rus.lower_dvina_trace_phase_2_wreck_inspection_binding.v1'
      || binding.binding_id
        !== 'lower_dvina_trace_phase_2_wreck_inspection_v1'
      || binding.revision !== selected.bindingRevision
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
      path: selected.binding,
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
