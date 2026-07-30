import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalDigest,
  LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST
} from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b/publication-binding.json`;
export const TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST =
  'f2cb774de97e6959b5ea31efaedf8b81bb3bdd3fb963132999c5b990c662749b';
export const TRACE_PHASE_1B_APPROVED_BINDING_DIGEST =
  '594e6f7cde83510ae4b48ee7bc8c2595bddd10bd4d325eeb33ba0487eb9b7810';
export const TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST =
  'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605';
export const TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST =
  '2d4c940867a34a292435915a0e201d986346c10f1eddc31423fe019025dbc6c0';
export const TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION =
  'code_materializer_v2';
export const TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID =
  'mulberry32_v1';

export async function loadLowerDvinaTracePhase1BPublication({
  rootDir = process.cwd()
} = {}) {
  const manifestFile = await readJson(rootDir, MANIFEST_PATH);
  if (manifestFile.digest !== TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST) {
    fail(
      'TRACE_PHASE_1B_MANIFEST_ROOT_MISMATCH',
      'Phase 1B publication package does not match its immutable root pin.'
    );
  }
  const manifest = manifestFile.value;
  if (manifest?.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v1'
    || manifest.revision !== 1
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
    id: 'lower_dvina_trace_phase_1b_publication_v1',
    revision: 1,
    schema: 'rus.lower_dvina_trace_publication_binding.v1'
  });
  const binding = bindingFile.value;
  assertBinding(binding);

  const phase1A = await readJson(
    rootDir,
    binding.phase_1a_manifest_ref.path
  );
  assertExactRef(binding.phase_1a_manifest_ref, phase1A, {
    path: `${ROOT}/phase-1a/manifest.json`,
    id: 'lower_dvina_trace_phase_1a_v1',
    revision: 1,
    schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1'
  }, 'package_id');
  if (phase1A.value.scenario_id !== binding.scenario_id
    || phase1A.value.scenario_definition_revision !== 5
    || phase1A.value.content_refs?.materialization_bindings?.id
      !== binding.materializer_binding_id) {
    fail(
      'TRACE_PHASE_1B_PHASE_1A_REF_INVALID',
      'Publication binding does not resolve to the exact Phase 1A creator.'
    );
  }

  const definition = await readJson(
    rootDir,
    binding.scenario_definition_ref.path
  );
  assertExactRef(binding.scenario_definition_ref, definition, {
    path: `${ROOT}/phase-0d-v2/definition.json`,
    id: 'lower_dvina_trace_v1',
    revision: 5,
    schema: 'rus.trace_scenario_definition.v1'
  }, 'scenario_id');
  if (definition.value.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_DEFINITION_INCOMPLETE',
      'Only the complete scenario definition revision 5 can be published.'
    );
  }

  await assertWorldLineage(rootDir, binding.world_compatibility);
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
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v1'
    || binding.revision !== 1
    || binding.status !== 'approved'
    || binding.scenario_id !== 'lower_dvina_trace_v1'
    || binding.publication_availability !== 'public'
    || binding.fallback_policy !== 'forbidden'
    || !text(metadata?.title)
    || !text(metadata?.description)
    || metadata.available !== true
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v1'
    || projection?.projection_id
      !== 'lower_dvina_trace_phase_1b_opening_projection_v1'
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

async function assertWorldLineage(rootDir, compatibility) {
  if (canonicalDigest(compatibility)
      !== LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST
    || compatibility?.source_world_revision_id
      !== 'novgorod_spatial_v3_target_contract_approval_001'
    || compatibility.source_world_catalog_digest
      !== '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e'
    || compatibility.production_world_revision_id
      !== 'novgorod_spatial_v3_production_v3_candidate_001'
    || compatibility.production_world_catalog_digest
      !== '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
    || compatibility.source_status !== 'approved'
    || compatibility.production_status !== 'approved'
    || !Array.isArray(compatibility.lineage)
    || compatibility.lineage.length !== 2) {
    fail(
      'TRACE_PHASE_1B_WORLD_COMPATIBILITY_INVALID',
      'Exact approved source-to-production world lineage is required.'
    );
  }
  let parent = compatibility.source_world_revision_id;
  for (const ref of compatibility.lineage) {
    const loaded = await readJson(rootDir, ref?.path);
    if (loaded.digest !== ref?.digest
      || loaded.value.world_revision_id !== ref.world_revision_id
      || ref.parent_revision_id !== parent
      || loaded.value.parent_revision_id !== parent
      || loaded.value.catalog_digest !== ref.world_catalog_digest
      || ref.status !== 'approved'
      || loaded.value.status !== ref.status) {
      fail(
        'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
        'Pinned production world lineage is stale or incompatible.'
      );
    }
    parent = ref.world_revision_id;
  }
  if (parent !== compatibility.production_world_revision_id) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
      'Pinned world lineage does not reach the production revision.'
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
