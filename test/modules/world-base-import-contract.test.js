import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeBundlePath, prepareExternalSource, validateArchiveEntries, verifyBundleFiles } from '../../scripts/prepare-rus13-staging.js';

const root = process.cwd();

const REQUIRED_SCRIPTS = [
  'world-db:up',
  'world-db:seed',
  'world-db:prepare-staging',
  'world-db:import:dry-run',
  'world-db:import:emit-sql',
  'world-db:import:apply',
  'world-db:fk-audit:staged',
  'world-db:fk-audit:db',
  'world-db:import:novgorod-regional:dry-run',
  'world-db:import:novgorod-regional:emit-sql',
  'world-db:import:novgorod-regional:apply',
  'party-db:seed',
  'new-game:preflight'
];

test('root package exposes every command documented by world_base import', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const name of REQUIRED_SCRIPTS) {
    assert.equal(typeof pkg.scripts[name], 'string', `missing package script ${name}`);
  }
});

test('tracked world_base bundle is complete and content-addressed', async () => {
  const manifestPath = resolve(root, 'data/world-base-sources/rus13-base-v1.manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema_version, 'rus.world_base_source_bundle.v1');
  assert.equal(manifest.bundle_id, 'rus13_world_base_v1');
  assert.match(manifest.archive.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(manifest.archive.bytes > 0);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0));

  const archive = await readFile(resolve(root, manifest.archive.path));
  assert.equal(archive.byteLength, manifest.archive.bytes);
  assert.equal(sha256(archive), manifest.archive.sha256);

  const importerManifest = await readFile(resolve(root, manifest.importer_manifest.path));
  assert.equal(sha256(importerManifest), manifest.importer_manifest.sha256);
});

test('bundle paths and extracted files fail closed on traversal or digest mismatch', async () => {
  assert.throws(() => normalizeBundlePath('../escape.tsv'), /Unsafe bundle path/u);
  assert.throws(() => normalizeBundlePath('/absolute.tsv'), /Unsafe bundle path/u);
  assert.throws(() => normalizeBundlePath('C:\\absolute.tsv'), /Unsafe bundle path/u);

  const staging = await mkdtemp(resolve(tmpdir(), 'rus13-bundle-'));
  try {
    await mkdir(resolve(staging, 'safe'), { recursive: true });
    await writeFile(resolve(staging, 'safe', 'file.tsv'), 'content', 'utf8');
    await assert.rejects(
      verifyBundleFiles(staging, [{ path: 'safe/file.tsv', bytes: 7, sha256: '0'.repeat(64) }]),
      /digest mismatch/u
    );
    await assert.rejects(
      verifyBundleFiles(staging, [{ path: 'safe/missing.tsv', bytes: 1, sha256: '0'.repeat(64) }]),
      /is missing/u
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});

test('archive preflight rejects links and special files before extraction', () => {
  assert.deepEqual(
    validateArchiveEntries(['safe/file.tsv'], ['-rw-r--r-- owner/group 7 2026-07-14 00:00 safe/file.tsv']),
    [{ path: 'safe/file.tsv', type: 'file' }]
  );
  assert.throws(
    () => validateArchiveEntries(['safe/link.tsv'], ['lrwxrwxrwx owner/group 0 2026-07-14 00:00 safe/link.tsv -> ../../outside']),
    /Unsafe archive entry type/u
  );
  assert.throws(
    () => validateArchiveEntries(['safe/hard.tsv'], ['hrw-r--r-- owner/group 0 2026-07-14 00:00 safe/hard.tsv link to outside']),
    /Unsafe archive entry type/u
  );
  assert.throws(
    () => validateArchiveEntries(['safe/device'], ['crw-r--r-- owner/group 0 2026-07-14 00:00 safe/device']),
    /Unsafe archive entry type/u
  );
  assert.throws(
    () => validateArchiveEntries(['../escape.tsv'], ['-rw-r--r-- owner/group 7 2026-07-14 00:00 ../escape.tsv']),
    /Unsafe bundle path/u
  );
});

test('external authoring override replaces stale staging and preserves it on incomplete input', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rus13-authoring-'));
  const sourceRoot = join(temporaryRoot, 'source');
  const regionSourceRoot = join(temporaryRoot, 'region');
  const stagingRoot = join(temporaryRoot, 'staging');
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(regionSourceRoot, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });
  await writeFile(join(sourceRoot, 'required.json'), '{}');
  await writeFile(join(stagingRoot, 'stale.json'), '{}');

  try {
    await prepareExternalSource({ sourceRoot, regionSourceRoot, stagingRoot, requiredPaths: ['required.json'] });
    await assert.rejects(stat(join(stagingRoot, 'stale.json')), /ENOENT/);
    await assert.doesNotReject(stat(join(stagingRoot, 'required.json')));
    await assert.rejects(
      prepareExternalSource({ sourceRoot, regionSourceRoot, stagingRoot, requiredPaths: ['missing.json'] }),
      /External authoring source is incomplete/
    );
    await assert.doesNotReject(stat(join(stagingRoot, 'required.json')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('revision 002 is registered as draft and semantic catalog does not claim runtime approval', async () => {
  const registry = JSON.parse(await readFile(resolve(root, 'data/world-catalogs/novgorod/source-registry.json'), 'utf8'));
  const source = registry.sources.find((item) => item.map_revision_id === 'novgorod_1230_research_revision_002');
  assert.ok(source, 'revision 002 must be registered');
  assert.equal(source.approval_status, 'draft');
  assert.equal(source.production_import_status, 'not_performed');
  assert.equal(source.runtime_visibility_status, 'not_verified');
  assert.equal(source.approved_at, null);
  assert.equal(source.approved_by, null);

  const catalog = await readFile(resolve(root, 'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md'), 'utf8');
  assert.match(catalog, /Статус: `draft`/u);
  assert.doesNotMatch(catalog, /Статус: `approved_local`/u);

  const overlay = JSON.parse(await readFile(resolve(root, 'data/world-catalogs/novgorod/staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-work-queue-progress-004.json'), 'utf8'));
  assert.equal(overlay.updates[0].work_status, 'draft');
  assert.equal(overlay.updates[0].local_approval_status, 'revoked_pending_production_import');
  assert.equal(overlay.updates[0].import_status, 'not_started');
  assert.equal(overlay.updates[0].supersedes_progress_file, 'g1-work-queue-progress-003.json');
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
