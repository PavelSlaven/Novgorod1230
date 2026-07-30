import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { assertExactContentRef } from './lower-dvina-trace-phase-1a-ref-validation.js';
import { assertVersionedRawPin } from './lower-dvina-trace-phase-1a-cutover.js';

const SCENARIO_ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadLowerDvinaTraceRevision8Bundle({
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
    knowledgeRulesFile,
    npcPoliciesFile,
    activityProfilesFile,
    previousDefinitionFile,
    previousKnowledgeRulesFile,
    previousNpcPoliciesFile,
    previousActivityProfilesFile,
    previousPhase1AManifestFile,
    previousBindingsFile,
    boatmanScenarioFile,
    boatmanManifestFile
  ] = await Promise.all([
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/manifest.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v4/manifest.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v4/materialization-bindings.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/definition.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/knowledge-lie-memory-rules.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/npc-decision-schedule-policies.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-3-content/activity-check-consequence-profiles.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0d-v4/definition.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0c/knowledge-lie-memory-rules.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0d/npc-decision-schedule-policies.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-0d/activity-check-consequence-profiles.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v3/manifest.json`),
    readJson(rootDir, `${SCENARIO_ROOT}/phase-1a-v3/materialization-bindings.json`),
    readJson(rootDir, 'data/world-catalogs/novgorod/first-playable-v1/scenario.json'),
    readJson(rootDir, 'data/world-catalogs/novgorod/first-playable-v1/manifest.json')
  ]);
  const phase3 = phase3ManifestFile.value;
  const phase1A = phase1AManifestFile.value;
  assertManifestIdentity(phase3, phase1A, fail);
  assertSupersedes({
    phase3,
    phase1A,
    phase3ManifestFile,
    materializationBindingsFile,
    activityProfilesFile,
    previousDefinitionFile,
    previousKnowledgeRulesFile,
    previousNpcPoliciesFile,
    previousActivityProfilesFile,
    previousPhase1AManifestFile,
    previousBindingsFile
  });

  const replacements = {
    phase_1a_manifest: phase1AManifestFile,
    materialization_bindings: materializationBindingsFile,
    definition: definitionFile,
    knowledge_lie_memory_rules: knowledgeRulesFile,
    npc_decision_schedule_policies: npcPoliciesFile,
    activity_check_consequence_profiles: activityProfilesFile
  };
  historical.definition_revision = 8;
  historical.manifest_digest = phase1AManifestFile.digest;
  historical.phase_1a_manifest = phase1A;
  for (const [key, loaded] of Object.entries(replacements)) {
    historical[key] = loaded.value;
    historical.artifact_pins[key] = {
      key,
      path: replacementPath(key),
      digest: loaded.digest,
      canonical_digest: canonicalDigest(loaded.value),
      schema: loaded.value.schema,
      revision: loaded.value.revision
    };
  }
  assertExactContentRef(
    phase1A.content_refs?.materialization_bindings,
    historical.artifact_pins.materialization_bindings,
    {
      path: `${SCENARIO_ROOT}/phase-1a-v4/materialization-bindings.json`,
      id: 'lower_dvina_trace_phase_1a_materialization_bindings_v4',
      revision: 4,
      schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    }
  );
  assertPhase3ContentRefs({ phase3, historical, fail });
  const contentDigest = Object.entries(phase3.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n') + '\n';
  if (phase3.content_digest_algorithm !== 'sha256_sorted_filename_colon_digest_lf_v1'
    || createHash('sha256').update(contentDigest).digest('hex') !== phase3.content_digest
    || phase3.legacy_boatman_regression_refs?.scenario?.digest !== boatmanScenarioFile.digest
    || phase3.legacy_boatman_regression_refs?.manifest?.digest !== boatmanManifestFile.digest) {
    fail('TRACE_PHASE_3_CONTENT_DIGEST_MISMATCH', 'Phase 3 root or boatman regression digest mismatch.');
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

function assertManifestIdentity(phase3, phase1A, fail) {
  if (phase3.schema !== 'rus.lower_dvina_trace_phase_3_content_manifest.v1'
    || phase3.package_id !== 'lower_dvina_trace_phase_3_content_v1'
    || phase3.revision !== 1
    || phase3.scenario_definition_revision !== 8
    || phase3.status !== 'approved'
    || phase3.publication_status !== 'internal_only'
    || phase3.fallback_policy !== 'forbidden'
    || phase3.normalization_policy !== 'forbidden'
    || phase3.alias_policy !== 'forbidden') {
    fail('TRACE_PHASE_3_MANIFEST_INVALID', 'Phase 3 prerequisite content manifest is incomplete.');
  }
  if (phase1A.schema !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v4'
    || phase1A.revision !== 4
    || phase1A.scenario_definition_revision !== 8
    || phase1A.status !== 'approved'
    || phase1A.publication_status !== 'internal_only'
    || phase1A.materialization_status !== 'phase_1a_internal'
    || phase1A.fallback_policy !== 'forbidden') {
    fail('TRACE_PHASE_1A_MANIFEST_INVALID', 'Phase 1A revision 4 materialization manifest is incomplete.');
  }
}

function assertSupersedes(input) {
  const refs = [
    [input.phase3.superseded_definition_ref, input.previousDefinitionFile,
      `${SCENARIO_ROOT}/phase-0d-v4/definition.json`, 'lower_dvina_trace_v1', 7,
      'rus.trace_scenario_definition.v1', 'scenario_id'],
    [input.phase3.superseded_content_refs?.knowledge_lie_memory_rules,
      input.previousKnowledgeRulesFile, `${SCENARIO_ROOT}/phase-0c/knowledge-lie-memory-rules.json`,
      'trace_ld_v1_knowledge_lie_memory_rules', 1, 'rus.trace_knowledge_lie_memory_rules.v1',
      'knowledge_lie_memory_rules_id'],
    [input.phase3.superseded_content_refs?.npc_decision_schedule_policies,
      input.previousNpcPoliciesFile, `${SCENARIO_ROOT}/phase-0d/npc-decision-schedule-policies.json`,
      'trace_ld_v1_npc_decision_schedule_policies', 1,
      'rus.trace_npc_decision_schedule_policies.v1', 'set_id'],
    [input.phase3.superseded_content_refs?.activity_check_consequence_profiles,
      input.previousActivityProfilesFile,
      `${SCENARIO_ROOT}/phase-0d/activity-check-consequence-profiles.json`,
      'trace_ld_v1_activity_check_consequence_profiles', 1,
      'rus.trace_activity_check_consequence_profiles.v1', 'set_id'],
    [input.activityProfilesFile?.value?.supersedes_ref,
      input.previousActivityProfilesFile,
      `${SCENARIO_ROOT}/phase-0d/activity-check-consequence-profiles.json`,
      'trace_ld_v1_activity_check_consequence_profiles', 1,
      'rus.trace_activity_check_consequence_profiles.v1', 'set_id'],
    [input.phase1A.superseded_package_ref, input.previousPhase1AManifestFile,
      `${SCENARIO_ROOT}/phase-1a-v3/manifest.json`, 'lower_dvina_trace_phase_1a_v3', 3,
      'rus.lower_dvina_trace_phase_1a_manifest.v1', 'package_id'],
    [input.phase1A.base_definition_ref, input.phase3ManifestFile,
      `${SCENARIO_ROOT}/phase-3-content/manifest.json`, 'lower_dvina_trace_phase_3_content_v1', 1,
      'rus.lower_dvina_trace_phase_3_content_manifest.v1', 'package_id'],
    [input.materializationBindingsFile.value.superseded_binding_ref, input.previousBindingsFile,
      `${SCENARIO_ROOT}/phase-1a-v3/materialization-bindings.json`,
      'lower_dvina_trace_phase_1a_materialization_bindings_v3', 3,
      'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 'binding_set_id']
  ];
  for (const [ref, loaded, path, id, revision, schema, idField] of refs) {
    assertVersionedRawPin(ref, loaded, { path, id, revision, schema, idField });
  }
}

function assertPhase3ContentRefs({ phase3, historical, fail }) {
  for (const [key, filename, id, revision, schema] of [
    ['definition', 'definition.json', 'lower_dvina_trace_v1', 8, 'rus.trace_scenario_definition.v1'],
    ['knowledge_lie_memory_rules', 'knowledge-lie-memory-rules.json',
      'trace_ld_v1_knowledge_lie_memory_rules', 2, 'rus.trace_knowledge_lie_memory_rules.v1'],
    ['activity_check_consequence_profiles', 'activity-check-consequence-profiles.json',
      'trace_ld_v1_activity_check_consequence_profiles', 2,
      'rus.trace_activity_check_consequence_profiles.v1'],
    ['npc_decision_schedule_policies', 'npc-decision-schedule-policies.json',
      'trace_ld_v1_npc_decision_schedule_policies', 2,
      'rus.trace_npc_decision_schedule_policies.v1']
  ]) {
    assertExactContentRef(
      phase3.content_refs?.[key],
      historical.artifact_pins[key],
      { path: filename, id, revision, schema }
    );
    if (phase3.files?.[filename] !== historical.artifact_pins[key].digest) {
      fail(
        'TRACE_SCENARIO_ARTIFACT_DIGEST_MISMATCH',
        `Phase 3 manifest file digest mismatch for ${filename}.`
      );
    }
  }
}

function replacementPath(key) {
  if (key === 'phase_1a_manifest') return `${SCENARIO_ROOT}/phase-1a-v4/manifest.json`;
  if (key === 'materialization_bindings') {
    return `${SCENARIO_ROOT}/phase-1a-v4/materialization-bindings.json`;
  }
  return `${SCENARIO_ROOT}/phase-3-content/${key.replaceAll('_', '-')}.json`;
}

async function readJson(rootDir, relativePath) {
  const raw = await readFile(resolve(rootDir, relativePath));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}
