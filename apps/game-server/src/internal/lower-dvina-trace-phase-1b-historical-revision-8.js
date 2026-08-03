const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadHistoricalLowerDvinaTracePhase1BV8Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v8/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v8/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v9/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-m1-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'd797da2ec7d78eabaa5ee46c0854948559d453a8127710c8c721b9e3978d5e50'
    || bindingFile.digest
      !== 'e2eed14f0cafe3335f28941b8e0471ce2e327eb84b722f304ebcc94330d45a81'
    || phase1AFile.digest !== phase1ADigest
    || definitionFile.digest
      !== 'cef9ad459b2ceb3f3d4edbe93926332cb22782d03e30622d74301f21aba025ef') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 8 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v8'
    || manifest.revision !== 8
    || manifest.status !== 'approved'
    || manifest.content_refs?.publication_binding?.digest
      !== bindingFile.digest
    || binding.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v8'
    || binding.revision !== 8
    || binding.status !== 'approved'
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v9'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v9'
    || phase1A.revision !== 9
    || phase1A.scenario_definition_revision !== 13
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 13
    || definition.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 8 identity is incompatible.');
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
