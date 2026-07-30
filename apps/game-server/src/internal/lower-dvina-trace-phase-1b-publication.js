import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  TRACE_PHASE_1B_APPROVED_BINDING_DIGEST,
  TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST,
  TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST,
  TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION,
  TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST,
  TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID
} from './lower-dvina-trace-phase-1b-identities.js';
import {
  isHistoricalLowerDvinaTracePhase1AManifestDigest,
  loadHistoricalLowerDvinaTracePhase1BPublication
} from './lower-dvina-trace-phase-1b-historical-publication.js';
import {
  assertLowerDvinaTracePhase1BWorldLineage
} from './lower-dvina-trace-phase-1b-world-lineage.js';
export * from './lower-dvina-trace-phase-1b-identities.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v2/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v2/publication-binding.json`;

export async function loadLowerDvinaTracePhase1BPublication({
  rootDir = process.cwd(),
  phase1AManifestDigest = null
} = {}) {
  if (isHistoricalLowerDvinaTracePhase1AManifestDigest(
    phase1AManifestDigest
  )) {
    return loadHistoricalLowerDvinaTracePhase1BPublication({ rootDir });
  }
  if (phase1AManifestDigest != null
    && phase1AManifestDigest
      !== TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST) {
    fail(
      'TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN',
      'No exact Phase 1B publication matches the persisted Phase 1A identity.'
    );
  }
  const manifestFile = await readJson(rootDir, MANIFEST_PATH);
  if (manifestFile.digest !== TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST) {
    fail(
      'TRACE_PHASE_1B_MANIFEST_ROOT_MISMATCH',
      'Phase 1B publication package does not match its immutable root pin.'
    );
  }
  const manifest = manifestFile.value;
  if (manifest?.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v2'
    || manifest.revision !== 2
    || manifest.status !== 'approved'
    || manifest.scenario_id !== 'lower_dvina_trace_v1'
    || manifest.publication_status !== 'public'
    || manifest.fallback_policy !== 'forbidden') {
    fail(
      'TRACE_PHASE_1B_MANIFEST_INVALID',
      'Approved Phase 1B publication manifest is required.'
    );
  }
  const bindingFile = await readJson(rootDir, BINDING_PATH);
  assertExactRef(manifest.content_refs?.publication_binding, bindingFile, {
    path: BINDING_PATH,
    id: 'lower_dvina_trace_phase_1b_publication_v2',
    revision: 2,
    schema: 'rus.lower_dvina_trace_publication_binding.v1'
  });
  const binding = bindingFile.value;
  assertBinding(binding);
  const supersededManifest = await readJson(
    rootDir,
    manifest.superseded_package_ref?.path
  );
  assertExactRef(manifest.superseded_package_ref, supersededManifest, {
    path: `${ROOT}/phase-1b/manifest.json`,
    id: 'lower_dvina_trace_phase_1b_v1',
    revision: 1,
    schema: 'rus.lower_dvina_trace_phase_1b_manifest.v1'
  }, 'package_id');
  const supersededBinding = await readJson(
    rootDir,
    binding.superseded_binding_ref?.path
  );
  assertExactRef(binding.superseded_binding_ref, supersededBinding, {
    path: `${ROOT}/phase-1b/publication-binding.json`,
    id: 'lower_dvina_trace_phase_1b_publication_v1',
    revision: 1,
    schema: 'rus.lower_dvina_trace_publication_binding.v1'
  });

  const phase1A = await readJson(
    rootDir,
    binding.phase_1a_manifest_ref.path
  );
  assertExactRef(binding.phase_1a_manifest_ref, phase1A, {
    path: `${ROOT}/phase-1a-v2/manifest.json`,
    id: 'lower_dvina_trace_phase_1a_v2',
    revision: 2,
    schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1'
  }, 'package_id');
  if (phase1A.value.scenario_id !== binding.scenario_id
    || phase1A.value.scenario_definition_revision !== 6
    || phase1A.value.content_refs?.materialization_bindings?.id
      !== binding.materializer_binding_id) {
    fail(
      'TRACE_PHASE_1B_PHASE_1A_REF_INVALID',
      'Publication binding does not resolve to the exact Phase 1A creator.'
    );
  }
  const supersededPhase1A = await readJson(
    rootDir,
    phase1A.value.superseded_package_ref?.path
  );
  assertExactRef(
    phase1A.value.superseded_package_ref,
    supersededPhase1A,
    {
      path: `${ROOT}/phase-1a/manifest.json`,
      id: 'lower_dvina_trace_phase_1a_v1',
      revision: 1,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    },
    'package_id'
  );

  const definition = await readJson(
    rootDir,
    binding.scenario_definition_ref.path
  );
  assertExactRef(binding.scenario_definition_ref, definition, {
    path: `${ROOT}/phase-0d-v3/definition.json`,
    id: 'lower_dvina_trace_v1',
    revision: 6,
    schema: 'rus.trace_scenario_definition.v1'
  }, 'scenario_id');
  if (definition.value.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_DEFINITION_INCOMPLETE',
      'Only the complete scenario definition revision 6 can be published.'
    );
  }

  await assertLowerDvinaTracePhase1BWorldLineage({
    rootDir,
    compatibility: binding.world_compatibility,
    readJson
  });
  const publicProjection = freezeDeep({
    scenario_id: binding.scenario_id,
    public_metadata: structuredClone(binding.public_metadata),
    opening_projection: structuredClone(binding.opening_projection)
  });
  return freezeDeep({
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    phase_1a_manifest: phase1A.value,
    definition: definition.value,
    public_projection: publicProjection
  });
}

function assertBinding(binding) {
  const metadata = binding?.public_metadata;
  const projection = binding?.opening_projection;
  const identity = binding?.execution_identity;
  if (binding?.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v2'
    || binding.revision !== 2
    || binding.status !== 'approved'
    || binding.scenario_id !== 'lower_dvina_trace_v1'
    || binding.publication_availability !== 'public'
    || binding.fallback_policy !== 'forbidden'
    || !text(metadata?.title)
    || !text(metadata?.description)
    || metadata.available !== true
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v2'
    || projection?.projection_id
      !== 'lower_dvina_trace_phase_1b_opening_projection_v2'
    || projection.schema !== 'first_game_screen'
    || projection.version !== 1
    || !Array.isArray(projection.visible_field_allowlist)
    || projection.visible_field_allowlist.length !== 7
    || !text(projection.place_label)
    || !text(projection.calendar_label)
    || !text(projection.opening_prose)
    || identity?.materializer_version
      !== TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION
    || identity.rng_algorithm_id
      !== TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID
    || identity?.seed_context
      !== 'lower_dvina_trace_phase_1a_mikula_v1'
    || identity.trigger !== 'new_game'
    || identity.occurrence !== 0) {
    fail(
      'TRACE_PHASE_1B_BINDING_INVALID',
      'Publication binding is incomplete or unsupported.'
    );
  }
  const expected = [
    'party_id',
    'player.name',
    'player.social_status',
    'position',
    'timestamp',
    'body',
    'environment'
  ];
  if (JSON.stringify(projection.visible_field_allowlist)
    !== JSON.stringify(expected)) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_ALLOWLIST_INVALID',
      'Opening projection visible-field allowlist is not exact.'
    );
  }
}

function assertExactRef(ref, loaded, expected, idField = 'binding_id') {
  if (ref?.path !== expected.path
    || ref.id !== expected.id
    || ref.revision !== expected.revision
    || ref.schema !== expected.schema
    || ref.digest !== loaded.digest
    || loaded.value?.[idField] !== expected.id
    || loaded.value?.revision !== expected.revision
    || loaded.value?.schema !== expected.schema) {
    fail(
      'TRACE_PHASE_1B_CONTENT_REF_MISMATCH',
      `Pinned publication content ref is stale: ${expected.path}.`
    );
  }
}

async function readJson(rootDir, relativePath) {
  if (!text(relativePath)) {
    fail(
      'TRACE_PHASE_1B_CONTENT_PATH_INVALID',
      'Pinned publication content path is required.'
    );
  }
  let raw;
  try {
    raw = await readFile(resolve(rootDir, relativePath));
  } catch (error) {
    fail(
      'TRACE_PHASE_1B_CONTENT_MISSING',
      `Pinned publication content is missing: ${relativePath}.`,
      { cause: error.code }
    );
  }
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}

function text(value) {
  return String(value ?? '').trim();
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
