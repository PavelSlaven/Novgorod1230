const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadHistoricalLowerDvinaTracePhase1BV6Publication({
  rootDir, readJson, fail, freezeDeep, phase1ADigest
}) {
  const [manifestFile, bindingFile, phase1AFile, definitionFile] =
    await Promise.all([
      readJson(rootDir, `${ROOT}/phase-1b-v6/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1b-v6/publication-binding.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v7/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-5-content/definition.json`)
    ]);
  if (manifestFile.digest
      !== '84db0f6695b8bc5be1828e19b2e1b11f8752f828bbd40e87b99b79f3e6730ac4'
    || bindingFile.digest
      !== '2fe678fca0b3ff01ecc80f471e2131b557d68f6dd7d3298e95770c7b5e6002b0'
    || phase1AFile.digest !== phase1ADigest
    || definitionFile.digest
      !== '65ea080f3ba0897b47fd9ac6ed4ce92b7831ba3cc04de965bcbe7f956d2f7cd9') {
    fail('TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH',
      'Historical Phase 1A/1B revision 6 publication pins are stale.');
  }
  const manifest = manifestFile.value;
  const binding = bindingFile.value;
  const phase1A = phase1AFile.value;
  const definition = definitionFile.value;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1b_v6'
    || manifest.revision !== 6
    || binding.binding_id !== 'lower_dvina_trace_phase_1b_publication_v6'
    || binding.revision !== 6
    || binding.phase_1a_manifest_ref?.digest !== phase1AFile.digest
    || binding.scenario_definition_ref?.digest !== definitionFile.digest
    || binding.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
    || phase1A.package_id !== 'lower_dvina_trace_phase_1a_v7'
    || phase1A.revision !== 7
    || phase1A.scenario_definition_revision !== 11
    || definition.scenario_id !== 'lower_dvina_trace_v1'
    || definition.revision !== 11
    || definition.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_HISTORICAL_CONTENT_INVALID',
      'Historical Phase 1A/1B revision 6 identity is incompatible.');
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
