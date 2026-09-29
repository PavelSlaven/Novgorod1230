import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest } from '../packages/contracts/src/spatial-v3/controlled-vocabularies.js';
import { buildTransactionalImportSql, resolveTablePrimaryKey } from '../tools/spatial-v3/p12-authoring-importer.mjs';
import { buildWorldBaseSchemaReference } from './generate-world-base-schema-reference.mjs';
import { promoteM2cOpenCapacity } from './promote-m2c-open-capacity-v2.mjs';

const root = resolve(import.meta.dirname, '..');
const catalog = 'data/world-catalogs/novgorod';
const acoustic = `${catalog}/m2c-acoustic`;
const approved = `${acoustic}/approved`;
const baselinesPath = `${approved}/spatial_v3_g6_acoustic_baselines.json`;
const versionsPath = `${approved}/spatial_v3_authoring_versions.json`;
const manifestPath = `${catalog}/m2c-acoustic-import-manifest.json`;
const oldUnionApprovalPath = `${acoustic}/authoring-version-union-data-approval.json`;
const unionApprovalPath = `${acoustic}/authoring-version-union-walk-data-approval.json`;
const unionReviewPath = `${acoustic}/authoring-version-union-walk-review-request.md`;
const baseRequestPath = `${catalog}/m2c-p12-v17-after-gate1-v1/request.json`;
const requestPath = `${catalog}/m2c-p12-v17-walk-acoustics-v1/request.json`;
const kind = 'g6_acoustic_baseline';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const bytesOf = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Approved authoring packages in provenance order: '' is the generated-family base. */
export const ACOUSTIC_PACKAGES = ['', 'canonical-terminal', 'canonical-walk'];
const dirOf = (name) => (name ? `${acoustic}/${name}` : acoustic);

export async function readAcousticPackage(name) {
  const dir = dirOf(name);
  const approval = await json(`${dir}/approval.json`);
  assert.equal(approval.status, 'approved', `${dir} approval`);
  assert.equal(sha(await read(`${dir}/candidate.json`)), approval.candidate_sha256, `${dir} candidate`);
  const rowsBytes = await read(`${dir}/authoring-rows.json`);
  assert.equal(sha(rowsBytes), approval.authoring_rows_sha256, `${dir} authoring rows`);
  return { approvalPath: `${dir}/approval.json`, rows: JSON.parse(rowsBytes) };
}

/** Pure part: base + approved packages -> approved dataset, authoring versions, manifest. */
export async function buildAcousticRelease({ packages = ACOUSTIC_PACKAGES, authoringVersions, manifest } = {}) {
  const loaded = await Promise.all(packages.map(readAcousticPackage));
  const baselines = loaded.flatMap(({ rows }) => rows).map((row) => {
    const promoted = { entity_kind: kind, ...row, status: 'approved' };
    return { ...promoted, canonical_digest: canonicalDigest(promoted) };
  });
  assert.equal(new Set(baselines.map((row) => row.id)).size, baselines.length, 'unique acoustic ids');
  const owned = baselines.map((row) => ({ entity_kind: kind, entity_id: row.id, version: row.version,
    world_revision_id: row.world_revision_id, status: row.status,
    canonical_digest: row.canonical_digest, provenance_ref: row.provenance_ref }));
  const versions = authoringVersions ?? await json(versionsPath);
  const first = versions.findIndex((row) => row.entity_kind === kind);
  assert.ok(first >= 0, 'existing acoustic authoring-version block');
  const rest = versions.filter((row) => row.entity_kind !== kind);
  const next = [...rest.slice(0, first), ...owned, ...rest.slice(first)];
  assert.equal(new Set(next.map((row) => `${row.entity_kind}|${row.entity_id}|${row.version}`)).size, next.length);
  const baselinesBytes = bytesOf(baselines);
  const authoringVersionsBytes = bytesOf(next);
  const provenance = loaded.map((entry) => entry.approvalPath).join('; ');
  const out = structuredClone(manifest ?? await json(manifestPath));
  const pin = new Map([['spatial_v3_authoring_versions', authoringVersionsBytes],
    ['spatial_v3_g6_acoustic_baselines', baselinesBytes]]);
  for (const entry of out.datasets) {
    if (pin.has(entry.table)) entry.sha256 = sha(pin.get(entry.table));
    if (entry.provenance_ref.startsWith(loaded[0].approvalPath)) entry.provenance_ref = provenance;
  }
  if (out.provenance_ref.startsWith(loaded[0].approvalPath)) out.provenance_ref = provenance;
  return { baselines, baselinesBytes, authoringVersionsBytes, manifestBytes: bytesOf(out), manifest: out };
}

async function pinnedKeys(bundles) {
  const ddl = await buildWorldBaseSchemaReference({ root });
  const tables = new Map(ddl.schema.tables.map((table) => [table.name, table]));
  const seen = new Map();
  const refs = {};
  for (const bundle of bundles) {
    const manifestFile = resolve(root, bundle.manifest_path);
    const manifest = JSON.parse(await readFile(manifestFile));
    refs[bundle.name] = 0;
    for (const dataset of manifest.datasets) {
      const rows = JSON.parse(await readFile(resolve(dirname(manifestFile), dataset.file)));
      const key = resolveTablePrimaryKey(tables.get(dataset.table));
      for (const row of rows) {
        refs[bundle.name] += 1;
        seen.set(`${dataset.table}|${key.map((column) => row[column.name]).join('|')}`, dataset.table);
      }
    }
  }
  const byTable = {};
  for (const table of seen.values()) byTable[table] = (byTable[table] ?? 0) + 1;
  return { total: seen.size, byTable, refs };
}

function unionApproval(existing, release, versionsCount, baselineCount) {
  const old = existing ?? null;
  return { ...(old ?? {
    schema: 'rus.m2c_supplemental_data_approval.v1',
    decision: 'PENDING_INDEPENDENT_APPROVAL',
    reviewer: null,
    reviewed_on: null,
    source_issue: 'PavelSlaven/Novgorod1230#133',
    scope: `Exact acoustic P12 authoring-version union after merging the approved canonical-walk package: ${baselineCount} acoustic baselines (71 base+canonical-terminal, 147 canonical-walk; 195/195 target x slot with 2 additional-start owner rows) and ${versionsCount} authoring-version rows; two dataset SHA repins plus the manifest SHA. Expansion, connection, dependency-edge and other rows are unchanged.`,
    source_approvals: [
      `${catalog}/m2c-expansion-repin-data-approval.json`,
      `${catalog}/m2c-nonportal-availability-data-approval.json`,
      ...ACOUSTIC_PACKAGES.map((name) => `${dirOf(name)}/approval.json`),
      `${acoustic}/post-promotion-approval.json`,
    ],
    supersedes: oldUnionApprovalPath,
    checks: 'Generated by scripts/promote-m2c-acoustic-packages.mjs; review by re-running it with --check and comparing the exact_bundle pins with current bytes.',
    excludes: 'New semantic approval of any acoustic value (approved in the package approvals), PostgreSQL import/readback, runtime or production activation.',
    import_authorized: false,
    activation_authorized: false,
  }), exact_bundle: release };
}

const reviewText = (release, counts) => `# Acoustic union repin (canonical-walk): independent review request

Review as an independent Contract Auditor. Return \`APPROVE_DATA_ONLY\` or reject with exact findings. Do not self-approve. This request grants no import and no activation.

[authoring-version-union-walk-data-approval.json](authoring-version-union-walk-data-approval.json) is generated with \`decision: PENDING_INDEPENDENT_APPROVAL\`. To approve, replace \`decision\`, \`reviewer\` and \`reviewed_on\`, then re-run \`node scripts/promote-m2c-acoustic-packages.mjs\`: it re-pins the approval SHA in [the P12 walk request](../m2c-p12-v17-walk-acoustics-v1/request.json).

- Acoustic baselines: ${counts.baselines} rows = base 25 + canonical-terminal 46 + canonical-walk 147. Each package approval pins its candidate and authoring-rows SHA; the script asserts both.
- Authoring versions: ${counts.versions} rows; the acoustic block is regenerated from the baselines in place, all other rows are byte-identical.
- Acoustic manifest SHA-256: \`${release.manifest_sha256}\`. Authoring versions SHA-256: \`${release.authoring_versions_sha256}\`. Connection profile, binding and dependency-edge SHAs are unchanged and are asserted to be present in the manifest.
- Regenerate and verify: \`node scripts/promote-m2c-acoustic-packages.mjs --check\`.
`;

export async function promoteAcousticPackages({ check = false } = {}) {
  const release = await buildAcousticRelease();
  const files = [[baselinesPath, release.baselinesBytes], [versionsPath, release.authoringVersionsBytes],
    [manifestPath, release.manifestBytes]];
  const put = async (path, bytes) => {
    if (check) assert.equal(await readFile(resolve(root, path), 'utf8'), bytes, path);
    else { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), bytes); }
  };
  for (const [path, bytes] of files) await put(path, bytes);
  const capacity = await promoteM2cOpenCapacity({ check });

  const manifestSha = sha(release.manifestBytes);
  const versionsSha = sha(release.authoringVersionsBytes);
  const oldApproval = await json(oldUnionApprovalPath);
  const exact = { ...oldApproval.exact_bundle, manifest_sha256: manifestSha, authoring_versions_sha256: versionsSha };
  for (const key of ['connection_profiles_sha256', 'connection_bindings_sha256', 'authoring_dependency_edges_sha256'])
    assert.ok(release.manifest.datasets.some((entry) => entry.sha256 === exact[key]), key);
  let existing = null;
  try { existing = await json(unionApprovalPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const versionsCount = JSON.parse(release.authoringVersionsBytes).length;
  await put(unionApprovalPath, bytesOf(unionApproval(existing, exact, versionsCount, release.baselines.length)));
  await put(unionReviewPath, reviewText({ manifest_sha256: manifestSha, authoring_versions_sha256: versionsSha },
    { baselines: release.baselines.length, versions: versionsCount }));

  const p12 = await buildWalkRequest(release);
  await put(requestPath, bytesOf(p12.request));
  return { baselines: release.baselines.length, authoringVersions: versionsCount,
    manifest_sha256: manifestSha, capacity_manifest_sha256: sha(await read(capacity.manifestPath)),
    capacity: capacity.counts, p12: { bundle: 'acoustic', ...p12.summary } };
}

async function buildWalkRequest(release) {
  const baseBytes = await read(baseRequestPath);
  const base = JSON.parse(baseBytes);
  const request = structuredClone(base);
  const approvalBytes = await read(unionApprovalPath);
  const parts = [];
  for (const bundle of request.bundle_order) {
    const part = Buffer.from(await buildTransactionalImportSql({ root, manifestPath: bundle.manifest_path,
      wrapTransaction: false, allowTypedGaps: false, temporaryTablePrefix: bundle.temporary_table_prefix }));
    parts.push(part);
    if (bundle.name !== 'acoustic') {
      assert.equal(sha(await read(bundle.manifest_path)), bundle.manifest_sha256, `${bundle.name} manifest unchanged`);
      assert.equal(sha(part), bundle.sql_part_sha256, `${bundle.name} SQL part unchanged`);
      continue;
    }
    bundle.manifest_sha256 = sha(await read(bundle.manifest_path));
    assert.equal(bundle.manifest_sha256, sha(release.manifestBytes));
    bundle.approval_path = unionApprovalPath;
    bundle.approval_sha256 = sha(approvalBytes);
    bundle.sql_part_bytes = part.length;
    bundle.sql_part_sha256 = sha(part);
  }
  const { prefix, suffix } = request.sql_builder.concatenation;
  const combined = Buffer.concat([Buffer.from(prefix), ...parts, Buffer.from(suffix)]);
  const pins = await pinnedKeys(request.bundle_order);
  for (const bundle of request.bundle_order) bundle.pinned_row_references = pins.refs[bundle.name];
  const readback = request.expected_readback;
  const changed = Object.keys(pins.byTable).filter((table) => pins.byTable[table] !== readback.by_table[table]);
  assert.deepEqual(changed.toSorted(), ['spatial_v3_authoring_versions', 'spatial_v3_g6_acoustic_baselines'].toSorted());
  const oldTotal = readback.distinct_pinned_rows;
  readback.by_table = pins.byTable;
  readback.distinct_pinned_rows = pins.total;
  readback.current_pinned_keys.absent = pins.total;
  request.sql_builder.sha256 = sha(await read(request.sql_builder.path));
  request.sql_builder.combined_sql_bytes = combined.length;
  request.sql_builder.combined_sql_sha256 = sha(combined);
  const renumber = (text) => text.replaceAll(String(oldTotal), String(pins.total));
  request.preconditions = request.preconditions.map(renumber);
  request.execution = request.execution.map(renumber);
  request.request_id = 'novgorod_m2c_p12_v17_walk_acoustics_import_001';
  request.status = 'pending_independent_high_review';
  request.supersedes = { request_path: baseRequestPath, request_sha256: sha(baseBytes),
    reason: 'acoustic bundle merges the approved canonical-walk package; previous request stays as executed history' };
  request.source_head = null;
  request.source_head_note = 'Not recorded by the generator; the independent reviewer pins the exact head at approval.';
  request.independent_import_attestation = null;
  return { request, summary: { distinct_pinned_rows: pins.total, combined_sql_bytes: combined.length } };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(JSON.stringify(await promoteAcousticPackages({ check: process.argv.includes('--check') }), null, 2));
