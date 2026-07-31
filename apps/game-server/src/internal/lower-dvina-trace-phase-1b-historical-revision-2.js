const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadHistoricalLowerDvinaTracePhase1BV2Publication({
  rootDir,
  readJson,
  fail,
  freezeDeep,
  phase1ADigest
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v2/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v2/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v2/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-0d-v3/definition.json`)
    ]);
  if (manifestFile.digest
      !== 'a8ca136f815b662add09b5cfe7d981fced6a64583944f2b9af157262862e917f'
    || bindingFile.digest
      !== '1e7a45b5017631f381fa972642455cdb8eef81c19d0ecf76bc284bd018560eb9'
    || phase1AFile.digest !== phase1ADigest
    || definitionFile.digest
      !== '3f181993af99ddd7e7d3c0292ac853e168960b99f5cc2c06aaaddd13b8db703c') {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 2 publication pins are stale.'
    );
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.schema !== 'rus.lower_dvina_trace_phase_1b_manifest.v1'
    || manifest.package_id !== 'lower_dvina_trace_phase_1b_v2'
    || manifest.revision !== 2
    || manifest.status !== 'approved'
    || manifest.content_refs?.publication_binding?.digest !== bindingFile.digest
    || binding.schema !== 'rus.lower_dvina_trace_publication_binding.v1'
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v2'
    || binding.revision !== 2
    || binding.status !== 'approved'
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v2'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v2'
    || phase1A.revision !== 2
    || phase1A.scenario_definition_revision !== 6
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 6
    || definition.required_unresolved_refs?.length !== 0) {
    fail(
      'TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 2 publication identity is incompatible.'
    );
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
