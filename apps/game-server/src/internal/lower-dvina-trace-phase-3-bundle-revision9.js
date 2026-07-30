import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { assertExactContentRef } from './lower-dvina-trace-phase-1a-ref-validation.js';
import { assertVersionedRawPin } from './lower-dvina-trace-phase-1a-cutover.js';

const SCENARIO_ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadLowerDvinaTraceRevision9Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const historical = structuredClone(historicalBundle);
  const [
    phase3ManifestFile,
    phase1AManifestFile,
    materializationBindingsFile,
    definitionFile,
    itemContainerFile,
    previousPhase3ManifestFile,
    previousPhase1AManifestFile,
    previousBindingsFile,
    previousDefinitionFile,
    previousItemContainerFile
  ] = await Promise.all([
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content-v2/manifest.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v5/manifest.json`),
    readJson(
      rootDir,
      `${SCENARIO_ROOT}/phase-1a-v5/materialization-bindings.json`
    ),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content-v2/definition.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0c-v2/item-container-set.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/manifest.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v4/manifest.json`),
    readJson(
      rootDir,
      `${SCENARIO_ROOT}/phase-1a-v4/materialization-bindings.json`
    ),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/definition.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0c/item-container-set.json`)
  ]);
  const phase3 = phase3ManifestFile.value;
  const phase1A = phase1AManifestFile.value;
  if (phase3.schema !== 'rus.lower_dvina_trace_phase_3_content_manifest.v1'
      || phase3.package_id !== 'lower_dvina_trace_phase_3_content_v2'
      || phase3.revision !== 2
      || phase3.scenario_definition_revision !== 9
      || phase3.status !== 'approved'
      || phase3.publication_status !== 'internal_only'
      || phase3.fallback_policy !== 'forbidden'
      || phase3.normalization_policy !== 'forbidden'
      || phase3.alias_policy !== 'forbidden') {
    fail(
      'TRACE_PHASE_3_MANIFEST_INVALID',
      'Phase 3 pickup-correction manifest is incomplete.'
    );
  }
  if (phase1A.schema !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
      || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v5'
      || phase1A.revision !== 5
      || phase1A.scenario_definition_revision !== 9
      || phase1A.status !== 'approved'
      || phase1A.publication_status !== 'internal_only'
      || phase1A.materialization_status !== 'phase_1a_internal'
      || phase1A.fallback_policy !== 'forbidden') {
    fail(
      'TRACE_PHASE_1A_MANIFEST_INVALID',
      'Phase 1A revision 5 materialization manifest is incomplete.'
    );
  }
  assertVersionedRawPin(
    phase3.superseded_package_ref,
    previousPhase3ManifestFile,
    {
      path: `${SCENARIO_ROOT}/phase-3-content/manifest.json`,
      id: 'lower_dvina_trace_phase_3_content_v1',
      revision: 1,
      schema: 'rus.lower_dvina_trace_phase_3_content_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    phase1A.superseded_package_ref,
    previousPhase1AManifestFile,
    {
      path: `${SCENARIO_ROOT}/phase-1a-v4/manifest.json`,
      id: 'lower_dvina_trace_phase_1a_v4',
      revision: 4,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    definitionFile.value.supersedes_definition_ref,
    previousDefinitionFile,
    {
      path: `${SCENARIO_ROOT}/phase-3-content/definition.json`,
      id: 'lower_dvina_trace_v1',
      revision: 8,
      schema: 'rus.trace_scenario_definition.v1',
      idField: 'scenario_id'
    }
  );
  assertVersionedRawPin(
    itemContainerFile.value.supersedes_ref,
    previousItemContainerFile,
    {
      path: `${SCENARIO_ROOT}/phase-0c/item-container-set.json`,
      id: 'trace_ld_v1_item_container_set',
      revision: 1,
      schema: 'rus.trace_item_container_set.v1',
      idField: 'item_container_set_id'
    }
  );
  assertVersionedRawPin(
    phase1A.base_definition_ref,
    phase3ManifestFile,
    {
      path: `${SCENARIO_ROOT}/phase-3-content-v2/manifest.json`,
      id: 'lower_dvina_trace_phase_3_content_v2',
      revision: 2,
      schema: 'rus.lower_dvina_trace_phase_3_content_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    materializationBindingsFile.value.superseded_binding_ref,
    previousBindingsFile,
    {
      path:
        `${SCENARIO_ROOT}/phase-1a-v4/materialization-bindings.json`,
      id: 'lower_dvina_trace_phase_1a_materialization_bindings_v4',
      revision: 4,
      schema:
        'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
      idField: 'binding_set_id'
    }
  );
  const materializationBindingsPin = {
    key: 'materialization_bindings',
    path:
      `${SCENARIO_ROOT}/phase-1a-v5/materialization-bindings.json`,
    digest: materializationBindingsFile.digest,
    canonical_digest: canonicalDigest(materializationBindingsFile.value),
    schema: materializationBindingsFile.value.schema,
    revision: materializationBindingsFile.value.revision
  };
  assertExactContentRef(
    phase1A.content_refs?.materialization_bindings,
    materializationBindingsPin,
    {
      path:
        `${SCENARIO_ROOT}/phase-1a-v5/materialization-bindings.json`,
      id: 'lower_dvina_trace_phase_1a_materialization_bindings_v5',
      revision: 5,
      schema:
        'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    }
  );
  const definitionPin = {
    key: 'definition',
    path: `${SCENARIO_ROOT}/phase-3-content-v2/definition.json`,
    digest: definitionFile.digest,
    canonical_digest: canonicalDigest(definitionFile.value),
    schema: definitionFile.value.schema,
    revision: definitionFile.value.revision
  };
  const itemContainerPin = {
    key: 'item_container_set',
    path: `${SCENARIO_ROOT}/phase-0c-v2/item-container-set.json`,
    digest: itemContainerFile.digest,
    canonical_digest: canonicalDigest(itemContainerFile.value),
    schema: itemContainerFile.value.schema,
    revision: itemContainerFile.value.revision
  };
  assertExactContentRef(phase3.content_refs?.definition, definitionPin, {
    path: 'definition.json',
    id: 'lower_dvina_trace_v1',
    revision: 9,
    schema: 'rus.trace_scenario_definition.v1'
  });
  assertExactContentRef(
    phase3.reused_content_refs?.item_container_set,
    itemContainerPin,
    {
      path: `${SCENARIO_ROOT}/phase-0c-v2/item-container-set.json`,
      id: 'trace_ld_v1_item_container_set',
      revision: 2,
      schema: 'rus.trace_item_container_set.v1'
    }
  );
  for (const key of [
    'knowledge_lie_memory_rules',
    'activity_check_consequence_profiles',
    'npc_decision_schedule_policies'
  ]) {
    assertExactContentRef(
      phase3.reused_content_refs?.[key],
      historical.artifact_pins[key],
      {
        path: historical.artifact_pins[key].path,
        id: phase3.reused_content_refs[key].id,
        revision: historical.artifact_pins[key].revision,
        schema: historical.artifact_pins[key].schema
      }
    );
  }
  const contentDigest = Object.entries(phase3.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n') + '\n';
  if (phase3.files?.['definition.json'] !== definitionFile.digest
      || phase3.content_digest_algorithm
        !== 'sha256_sorted_filename_colon_digest_lf_v1'
      || createHash('sha256').update(contentDigest).digest('hex')
        !== phase3.content_digest) {
    fail(
      'TRACE_PHASE_3_CONTENT_DIGEST_MISMATCH',
      'Phase 3 pickup-correction content digest mismatch.'
    );
  }
  historical.definition_revision = 9;
  historical.manifest_digest = phase1AManifestFile.digest;
  historical.phase_1a_manifest = phase1A;
  historical.materialization_bindings =
    materializationBindingsFile.value;
  historical.definition = definitionFile.value;
  historical.item_container_set = itemContainerFile.value;
  historical.artifact_pins.phase_1a_manifest = {
    key: 'phase_1a_manifest',
    path: `${SCENARIO_ROOT}/phase-1a-v5/manifest.json`,
    digest: phase1AManifestFile.digest,
    canonical_digest: canonicalDigest(phase1A),
    schema: phase1A.schema,
    revision: phase1A.revision
  };
  historical.artifact_pins.definition = definitionPin;
  historical.artifact_pins.item_container_set = itemContainerPin;
  historical.artifact_pins.materialization_bindings =
    materializationBindingsPin;
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

async function readJson(rootDir, relativePath) {
  const raw = await readFile(resolve(rootDir, relativePath));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}
