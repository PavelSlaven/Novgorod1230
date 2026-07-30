export async function loadLowerDvinaTracePhase1ACutover({
  rootDir,
  scenarioRoot,
  readJson
}) {
  const [
    phase1AManifestFile,
    supersededPhase1AManifestFile,
    correctionManifestFile,
    supersededCorrectionManifestFile,
    supersededDefinitionFile,
    supersededBodyEnvironmentFile,
    supersededBindingsFile
  ] = await Promise.all([
    readJson(rootDir, `${scenarioRoot}/phase-1a-v3/manifest.json`),
    readJson(rootDir, `${scenarioRoot}/phase-1a-v2/manifest.json`),
    readJson(rootDir, `${scenarioRoot}/phase-0d-v4/manifest.json`),
    readJson(rootDir, `${scenarioRoot}/phase-0d-v3/manifest.json`),
    readJson(rootDir, `${scenarioRoot}/phase-0d-v3/definition.json`),
    readJson(
      rootDir,
      `${scenarioRoot}/phase-0d-v3/body-environment-profiles.json`
    ),
    readJson(
      rootDir,
      `${scenarioRoot}/phase-1a-v2/materialization-bindings.json`
    )
  ]);
  const phase1AManifest = phase1AManifestFile.value;
  const correction = correctionManifestFile.value;
  if (phase1AManifest.schema
      !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    || phase1AManifest.package_id !== 'lower_dvina_trace_phase_1a_v3'
    || phase1AManifest.revision !== 3
    || phase1AManifest.status !== 'approved'
    || phase1AManifest.scenario_id !== 'lower_dvina_trace_v1'
    || phase1AManifest.scenario_definition_revision !== 7
    || phase1AManifest.publication_status !== 'internal_only'
    || phase1AManifest.materialization_status !== 'phase_1a_internal'
    || phase1AManifest.fallback_policy !== 'forbidden') {
    fail(
      'TRACE_PHASE_1A_MANIFEST_INVALID',
      'Phase-1A revision 3 materialization manifest is incomplete.'
    );
  }
  if (correction.schema !== 'rus.trace_phase_0d_correction_manifest.v1'
    || correction.package_id !== 'lower_dvina_trace_phase_0d_v4'
    || correction.revision !== 4
    || correction.scenario_definition_revision !== 7
    || correction.publication_status !== 'unpublished'
    || correction.remaining_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_SCENARIO_MANIFEST_INVALID',
      'Phase-0D correction manifest revision 4 is incomplete.'
    );
  }
  assertVersionedRawPin(
    phase1AManifest.superseded_package_ref,
    supersededPhase1AManifestFile,
    {
      path: `${scenarioRoot}/phase-1a-v2/manifest.json`,
      id: 'lower_dvina_trace_phase_1a_v2',
      revision: 2,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    phase1AManifest.base_definition_ref,
    correctionManifestFile,
    {
      path: `${scenarioRoot}/phase-0d-v4/manifest.json`,
      id: 'lower_dvina_trace_phase_0d_v4',
      revision: 4,
      schema: 'rus.trace_phase_0d_correction_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    correction.superseded_package_ref,
    supersededCorrectionManifestFile,
    {
      path: `${scenarioRoot}/phase-0d-v3/manifest.json`,
      id: 'lower_dvina_trace_phase_0d_v3',
      revision: 3,
      schema: 'rus.trace_phase_0d_correction_manifest.v1',
      idField: 'package_id'
    }
  );
  assertVersionedRawPin(
    correction.superseded_definition_ref,
    supersededDefinitionFile,
    {
      path: `${scenarioRoot}/phase-0d-v3/definition.json`,
      id: 'lower_dvina_trace_v1',
      revision: 6,
      schema: 'rus.trace_scenario_definition.v1',
      idField: 'scenario_id'
    }
  );
  assertVersionedRawPin(
    correction.superseded_body_environment_ref,
    supersededBodyEnvironmentFile,
    {
      path: `${scenarioRoot}/phase-0d-v3/body-environment-profiles.json`,
      id: 'trace_ld_v1_body_environment_profiles',
      revision: 3,
      schema: 'rus.trace_body_environment_profiles.v2',
      idField: 'set_id'
    }
  );
  return {
    phase1AManifestFile,
    correctionManifestFile,
    supersededBindingsFile
  };
}

export function assertVersionedRawPin(ref, loaded, expected) {
  if (ref?.path !== expected.path
    || ref?.digest !== loaded.digest
    || (ref.id ?? ref.package_id) !== expected.id
    || ref.revision !== expected.revision
    || (ref.schema != null && ref.schema !== expected.schema)
    || loaded.value?.[expected.idField] !== expected.id
    || loaded.value?.revision !== expected.revision
    || loaded.value?.schema !== expected.schema) {
    fail(
      'TRACE_SCENARIO_DEPENDENCY_MISMATCH',
      `Pinned dependency ${expected.path} is stale or incompatible.`
    );
  }
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}
