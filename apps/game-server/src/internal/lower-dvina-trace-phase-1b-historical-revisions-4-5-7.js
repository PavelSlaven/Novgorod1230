const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadHistoricalLowerDvinaTracePhase1BV7Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v7/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v7/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v8/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-6-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'a7393882ab5528fb3d78115b159f5d9486de9e91b3934eaba5cc694f87125e8d'
    || bindingFile.digest
      !== 'f9e10a38b349ab1ce4136185754acea0a2bae22f626f84ab6d8ce128eeabe4e4'
    || phase1AFile.digest !== phase1ADigest
    || definitionFile.digest
      !== 'a2baf870be8784ca520319abd232c4383fdb4fb70fe1e39f50ab2d407c1c1b18') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 7 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v7'
    || manifest.revision !== 7
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v7'
    || binding.revision !== 7
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v8'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v8'
    || phase1A.revision !== 8
    || phase1A.scenario_definition_revision !== 12
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 12
    || definition.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 7 identity is incompatible.');
  }
  return freezePublication({
    manifestFile, bindingFile, phase1AFile, definitionFile, freezeDeep
  });
}

export async function loadHistoricalLowerDvinaTracePhase1BV5Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
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
    || phase1AFile.digest !== phase1ADigest
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
  return freezePublication({
    manifestFile, bindingFile, phase1AFile, definitionFile, freezeDeep
  });
}

export async function loadHistoricalLowerDvinaTracePhase1BV4Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
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
    || phase1AFile.digest !== phase1ADigest
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
  return freezePublication({
    manifestFile, bindingFile, phase1AFile, definitionFile, freezeDeep
  });
}

function freezePublication({
  manifestFile,
  bindingFile,
  phase1AFile,
  definitionFile,
  freezeDeep
}) {
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  return freezeDeep({
    manifest,
    manifest_digest: manifestFile.digest,
    binding,
    binding_digest: bindingFile.digest,
    phase_1a_manifest: phase1AFile.value,
    definition: definitionFile.value,
    public_projection: {
      scenario_id: binding.scenario_id,
      public_metadata: structuredClone(binding.public_metadata),
      opening_projection: structuredClone(binding.opening_projection)
    }
  });
}
