import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  REVIEWED_BASELINE_PATH,
  REVIEWED_BASELINE_SHA256,
  invariant,
  loadReviewedBaseline,
  sha256,
  validateP02Declaration
} from './p05-reviewed-baseline.mjs';

export const HISTORICAL_FREEZE_PATH = 'docs/migration/spatial-v3/normative-freeze.json';
export const HISTORICAL_FREEZE_SHA256 = '131738c4086c6d483b569407c3de02b2e9f12af3d1883a3fe92afea6a826feb4';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  invariant(process.argv[index + 1], `${name} requires a value`);
  return process.argv[index + 1];
};

export async function verifyHistoricalP05Evidence({
  root = '.',
  freezePath = HISTORICAL_FREEZE_PATH
} = {}) {
  const resolvedRoot = path.resolve(root);
  const read = (relativePath) => readFile(path.resolve(resolvedRoot, relativePath), 'utf8');
  const { baseline } = await loadReviewedBaseline(resolvedRoot);
  const freezeBytes = await read(freezePath);
  invariant(sha256(freezeBytes) === HISTORICAL_FREEZE_SHA256, 'historical P05 freeze does not match the immutable trust anchor');
  const freeze = JSON.parse(freezeBytes);

  invariant(freeze.schema_version === '1.2.0', 'historical P05 freeze schema mismatch');
  invariant(freeze.reviewed_baseline?.path === REVIEWED_BASELINE_PATH, 'historical P05 baseline path mismatch');
  invariant(freeze.reviewed_baseline?.sha256 === REVIEWED_BASELINE_SHA256, 'historical P05 baseline digest mismatch');
  invariant(
    JSON.stringify(freeze.source_digests) === JSON.stringify(baseline.source_digests),
    'historical P05 source digest map differs from the independently reviewed baseline'
  );

  const declarationPath = freeze.active_target_boundary.declaration_path;
  const schemaPath = freeze.active_target_boundary.schema_path;
  const declarationBytes = await read(declarationPath);
  const schemaBytes = await read(schemaPath);
  invariant(sha256(declarationBytes) === freeze.active_target_boundary.declaration_sha256, 'historical P02 declaration digest mismatch');
  invariant(sha256(schemaBytes) === freeze.active_target_boundary.schema_sha256, 'historical P02 schema digest mismatch');
  validateP02Declaration(JSON.parse(declarationBytes), baseline.source_digests);

  invariant(freeze.contract_registry.names_sha256 === baseline.contract_registry.names_sha256, 'historical contract registry digest mismatch');
  invariant(freeze.typed_error_registry.names_sha256 === baseline.typed_error_registry.names_sha256, 'historical typed-error registry digest mismatch');
  invariant(freeze.ownership_registry.contract_rows_sha256 === baseline.ownership_registry.contract_rows_sha256, 'historical contract ownership digest mismatch');
  invariant(freeze.ownership_registry.error_rows_sha256 === baseline.ownership_registry.error_rows_sha256, 'historical error ownership digest mismatch');
  invariant(freeze.conflict_registry.ids_sha256 === baseline.conflict_registry.ids_sha256, 'historical conflict registry digest mismatch');
  invariant(freeze.conflict_registry.open_findings === 0, 'historical freeze contains open findings');
  return { freezeBytes, freeze, baseline };
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) {
  await verifyHistoricalP05Evidence({
    root: argument('--root', '.'),
    freezePath: argument('--freeze', HISTORICAL_FREEZE_PATH)
  });
  console.log('P05 checks passed: immutable historical freeze and independently reviewed baseline are intact.');
}
