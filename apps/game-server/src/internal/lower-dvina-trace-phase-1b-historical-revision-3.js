const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadHistoricalLowerDvinaTracePhase1BV3Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] = await Promise.all([
    readJson(rootDir, `${ROOT}/phase-1b-v3/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-1b-v3/publication-binding.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v3/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-0d-v4/definition.json`)
  ]);
  if (manifestFile.digest !== 'aee59570994151f9177445d03ae8a4dcf29c098f2ffb7c7a198c8c43406818eb'
    || bindingFile.digest !== 'c5b6aa615c21ac351bbc2d1cbe6774337017f71213205858b4fdedb960a55b45'
    || phase1AFile.digest !== phase1ADigest
    || definitionFile.digest !== '1591b10d19deb48393b42fd4d84ad5c770ab8cdc153af2f94a4d7c749383f729') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH', 'Historical Phase 1A/1B revision 3 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v3' || manifest.revision !== 3
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v3' || binding.revision !== 3
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v3'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v3' || phase1A.revision !== 3
    || phase1A.scenario_definition_revision !== 7 || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 7 || definition.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID', 'Historical Phase 1A/1B revision 3 identity is incompatible.');
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
