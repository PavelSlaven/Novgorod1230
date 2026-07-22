import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json';
const EXPECTED = Object.freeze({
  package_id: 'p12_novgorod_source_approval_001',
  target_g1_id: 'gn_nov_g1_xp017_yp026',
  package_content_digest: '2e7d2f09abd46cffc82b18673ab93b1317b5942796a3c3d22516a91d3ddd9279',
  canonical_g5_inventory: 195,
  physical_exit_source_pairs: 358,
  derived_directional_traversals: 716,
  legacy_edge_mapping_bindings: 600,
  scene_profile_families: 17,
  scene_materialization_profiles: 195,
  scene_materialization_candidates: 195
});
const CATALOG_COUNT_KEYS = Object.freeze({
  canonical_g5_inventory: 'canonical_g5',
  physical_exit_source_pairs: 'physical_exit_source_pairs',
  derived_directional_traversals: 'derived_directional_traversals',
  legacy_edge_mapping_bindings: 'legacy_edge_mapping_bindings',
  scene_profile_families: 'scene_profile_families',
  scene_materialization_profiles: 'scene_materialization_profiles',
  scene_materialization_candidates: 'scene_materialization_candidates'
});

const digest = (value) => createHash('sha256').update(value).digest('hex');
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const inside = (root, candidate) => {
  const path = relative(root, candidate);
  return !!path && path !== '..' && !path.startsWith(`..${sep}`);
};

// `manifest.json` is the package control record, deliberately excluded from
// `manifest.files` to avoid a self-referential digest.  The package digest is
// the SHA-256 of the canonically serialized *complete* declared payload list:
// entries are sorted by path and every object key is sorted recursively.
// This exact rule is also used by the editorial package that supplied the
// pinned digest in EXPECTED.
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const canonicalPayloadDigest = (entries) => digest(JSON.stringify(canonical([...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0))));

async function listRegularFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await listRegularFiles(root, file));
    else if (entry.isFile()) files.push(relative(root, file).replaceAll(sep, '/'));
    else files.push(`!non_regular:${relative(root, file).replaceAll(sep, '/')}`);
  }
  return files;
}

/**
 * Verifies the immutable editorial package after it has been copied into the
 * repository.  This is deliberately source verification, not target DDL
 * compilation: P12 must still fail closed until the branch authoring bundle
 * contains contract-valid rows and its isolated PostgreSQL import succeeds.
 */
export async function validateP12SourceApproval({ root = ROOT, indexPath = INDEX_PATH } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  let index;
  try { index = JSON.parse(await readFile(resolve(projectRoot, indexPath), 'utf8')); }
  catch { return Object.freeze({ ok: false, errors: Object.freeze([issue('P12_SOURCE_APPROVAL_INDEX_MISSING', indexPath)]) }); }
  const packageRoot = resolve(projectRoot, index.package_root ?? '');
  if (!inside(projectRoot, packageRoot)) errors.push(issue('P12_SOURCE_APPROVAL_PATH_ESCAPE', index.package_root ?? 'unknown'));
  let manifest;
  let approval;
  try {
    [manifest, approval] = await Promise.all([
      readJson(resolve(packageRoot, 'manifest.json')),
      readJson(resolve(packageRoot, 'APPROVAL_RECORD.json'))
    ]);
  } catch {
    errors.push(issue('P12_SOURCE_APPROVAL_PACKAGE_MISSING', index.package_root ?? 'unknown'));
    return Object.freeze({ ok: false, errors: Object.freeze(errors) });
  }
  if (index.schema_version !== 'rus.spatial-v3.p12-source-approval-index.v1' || index.package_id !== EXPECTED.package_id || manifest.package_id !== EXPECTED.package_id) errors.push(issue('P12_SOURCE_APPROVAL_IDENTITY_MISMATCH', 'package_id'));
  if (index.target_g1_id !== EXPECTED.target_g1_id || manifest.target_g1_id !== EXPECTED.target_g1_id || approval.target_g1_id !== EXPECTED.target_g1_id) errors.push(issue('P12_SOURCE_APPROVAL_REGION_MISMATCH', 'target_g1_id'));
  if (approval.decision !== 'APPROVED_FOR_P12_INTEGRATION' || approval.production_activation_allowed !== false || manifest.production_activation_allowed !== false || index.activation !== 'not_authorized') errors.push(issue('P12_SOURCE_APPROVAL_STATUS_INVALID', 'approval_record'));
  const manifestEntries = Array.isArray(manifest.files) ? manifest.files : null;
  if (!manifestEntries) {
    errors.push(issue('P12_SOURCE_APPROVAL_MANIFEST_FILES_INVALID', 'manifest.files'));
  }
  const listed = new Set();
  for (const entry of manifestEntries ?? []) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || !entry.path || entry.path === 'manifest.json' || entry.path.includes('\\') || entry.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      errors.push(issue('P12_SOURCE_APPROVAL_MANIFEST_ENTRY_INVALID', String(entry?.path ?? 'unknown')));
      continue;
    }
    if (listed.has(entry.path)) errors.push(issue('P12_SOURCE_APPROVAL_MANIFEST_ENTRY_DUPLICATE', entry.path));
    listed.add(entry.path);
    const file = resolve(packageRoot, entry.path ?? '');
    if (!inside(packageRoot, file)) { errors.push(issue('P12_SOURCE_APPROVAL_FILE_PATH_ESCAPE', entry.path ?? 'unknown')); continue; }
    try {
      const [content, metadata, linkMetadata] = await Promise.all([readFile(file), stat(file), lstat(file)]);
      if (!linkMetadata.isFile()) errors.push(issue('P12_SOURCE_APPROVAL_FILE_NOT_REGULAR', entry.path));
      if (metadata.size !== entry.size || digest(content) !== entry.sha256) errors.push(issue('P12_SOURCE_APPROVAL_FILE_DIGEST_MISMATCH', entry.path));
    } catch { errors.push(issue('P12_SOURCE_APPROVAL_FILE_MISSING', entry.path)); }
  }
  // The exact file set is part of source approval.  `manifest.json` is the
  // only explicitly unlisted file; all other package files must be declared.
  try {
    const actual = new Set(await listRegularFiles(packageRoot));
    if (!actual.delete('manifest.json')) errors.push(issue('P12_SOURCE_APPROVAL_MANIFEST_MISSING', 'manifest.json'));
    for (const file of actual) {
      if (file.startsWith('!non_regular:')) errors.push(issue('P12_SOURCE_APPROVAL_NON_REGULAR_ENTRY', file.slice('!non_regular:'.length)));
      else if (!listed.has(file)) errors.push(issue('P12_SOURCE_APPROVAL_UNLISTED_FILE', file));
    }
    for (const file of listed) if (!actual.has(file)) errors.push(issue('P12_SOURCE_APPROVAL_LISTED_FILE_MISSING', file));
  } catch { errors.push(issue('P12_SOURCE_APPROVAL_PACKAGE_SCAN_FAILED', index.package_root ?? 'unknown')); }
  const computedDigest = manifestEntries ? canonicalPayloadDigest(manifestEntries) : null;
  if (computedDigest !== EXPECTED.package_content_digest || manifest.package_content_digest !== computedDigest || index.package_content_digest !== computedDigest) errors.push(issue('P12_SOURCE_APPROVAL_CONTENT_DIGEST_MISMATCH', 'manifest.json'));
  let catalog;
  try { catalog = await readJson(resolve(packageRoot, 'data/catalog.json')); }
  catch { errors.push(issue('P12_SOURCE_APPROVAL_CATALOG_MISSING', 'data/catalog.json')); }
  for (const [key, catalogKey] of Object.entries(CATALOG_COUNT_KEYS)) {
    const expected = EXPECTED[key];
    if (index.source_resolution?.[key] !== expected || catalog?.counts?.[catalogKey] !== expected) errors.push(issue('P12_SOURCE_APPROVAL_COUNT_MISMATCH', key));
  }
  return Object.freeze({
    ok: errors.length === 0,
    package_id: index.package_id,
    package_root: index.package_root,
    source_resolution: Object.freeze({ ...index.source_resolution }),
    activation: 'not_authorized',
    branch_contract_compilation: 'required',
    errors: Object.freeze(errors)
  });
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12SourceApproval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
