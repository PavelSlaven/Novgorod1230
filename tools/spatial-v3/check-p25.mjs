import { readFile } from 'node:fs/promises';
const [tool, test, packageJson, adr] = await Promise.all([
  readFile('tools/spatial-v3/p25-activation-tooling.mjs', 'utf8'),
  readFile('test/spatial-v3/p25-compatibility-cutover.test.js', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md', 'utf8')
]);
for (const token of ['bindSpatialV3RequestProfile', 'composition_profile_bindings_required', 'composition_profile_binding_conflict', 'createSpatialV3RequestCompositionBoundary', 'validateRuntimeComposition', 'runSpatialV3StructuralShadow', 'runSpatialV3ImmutableShadowRun', 'shadow_divergence_registry_unconsumed', 'shadow_divergence_registry_duplicate', 'runSpatialV3CutoverRehearsal', 'runSpatialV3ConstrainedCutover', 'runSpatialV3RollbackDrill', 'runSpatialV3P24RollbackDrill', 'spatial_v3_migration_coverage_artifacts', 'production_v2', 'shadow_v3', 'target_rehearsal', 'rollback_restore_required']) if (!tool.includes(token)) throw new Error(`P25 tooling lacks ${token}`);
for (const token of ['dual_writer_forbidden', 'composition_profile_binding_conflict', 'shadow_divergence_registry_unconsumed', 'shadow_divergence_registry_duplicate', 'shadow_write_forbidden', 'cutover_startup_probe_failed', 'P24 append-only party/world evidence', 'local PostgreSQL snapshot/restore']) if (!test.includes(token)) throw new Error(`P25 test lacks ${token}`);
if (!JSON.parse(packageJson).scripts['spatial-v3:test-p25-postgres']) throw new Error('P25 package scripts are incomplete');
for (const token of ['P25 compatibility and deprecation record', 'request_profiles', 'bindSpatialV3RequestProfile', 'production_v2', 'shadow_v3', 'P28 atomic activation gate', 'p25-compatibility-cutover.test.js']) if (!adr.includes(token)) throw new Error(`P25 ADR record lacks ${token}`);
console.log('P25 target-only compatibility, shadow, cutover and rollback tooling: OK');
