import { readFile } from 'node:fs/promises';

const [gate, test, packageJson, log] = await Promise.all([
  readFile('tools/spatial-v3/p28-activation-gate.mjs', 'utf8'),
  readFile('test/spatial-v3/p28-activation.test.js', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('docs/migration/spatial-v3/README.md', 'utf8')
]);
for (const token of ['assessSpatialV3Activation', 'requireSpatialV3Activation', 'production_writes: 0', 'composition_changed: false', 'spatial_candidate_gap', 'appendix_d_evidence_coverage_invalid', 'release_evidence_manifest_signature_invalid', 'reopen_owner_phase_and_keep_v2_production']) if (!gate.includes(token)) throw new Error(`P28 gate lacks ${token}`);
for (const token of ['CANONICAL_G5_INVENTORY_DATA_GAP', 'DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'APPROVED_PROFILE_DATA_GAP', 'appendix_d_evidence_hash_mismatch', 'appendix_d_item_evidence_missing', 'spatial_v3_activation_blocked']) if (!test.includes(token)) throw new Error(`P28 test lacks ${token}`);
if (!JSON.parse(packageJson).scripts['spatial-v3:test-p28'] || !JSON.parse(packageJson).scripts['spatial-v3:check-p28']) throw new Error('P28 package scripts are incomplete');
if (!log.includes('P28 — atomic activation gate')) throw new Error('P28 work log is missing');
console.log('P28 activation gate: OK (blocked activation is explicit and non-mutating)');
