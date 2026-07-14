import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../src/env.js';

const repoRoot = resolve(import.meta.dirname, '..');
const DEFAULT_BUNDLE_MANIFEST = join(repoRoot, 'data', 'world-base-sources', 'rus13-base-v1.manifest.json');
const DEFAULT_STAGING_ROOT = join(repoRoot, 'data', 'rus13-base-staging');
const DEFAULT_IMPORTER_ROOT = join(repoRoot, 'tools', 'rus13-world-base-importer', 'world_base_importer_v1');

const nestedZipTargets = new Map([
  ['novgorod_region_template_links_v1_full_pack.zip', 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED'],
  ['novgorod_full_graph_g1_g4_v6_game_ready.zip', 'nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED'],
  ['novgorod_region_place_generation_rules_v2_expanded_full_pack.zip', 'nov_region_audit/novgorod_region_place_generation_rules_v2_expanded_full_pack_EXTRACTED'],
  ['novgorod_place_generation_limits_v2_economic_full_pack.zip', 'nov_region_audit/novgorod_place_generation_limits_v2_economic_full_pack_EXTRACTED'],
  ['novgorod_regional_templates_v1_package.zip', 'nov_region_audit/novgorod_regional_templates_v1_package_EXTRACTED']
]);

export function normalizeBundlePath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/iu.test(normalized) || isAbsolute(normalized)) {
    throw new Error(`Unsafe bundle path: ${value}`);
  }
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe bundle path: ${value}`);
  }
  return normalized;
}

export function validateArchiveEntries(names, verboseLines, { allowDirectories = false } = {}) {
  if (names.length !== verboseLines.length) throw new Error('Archive listing metadata count mismatch.');
  return names.map((value, index) => {
    const raw = String(value ?? '');
    const directory = raw.endsWith('/');
    const path = normalizeBundlePath(directory ? raw.slice(0, -1) : raw);
    const type = String(verboseLines[index] ?? '').trimStart()[0] ?? '';
    if (type === '-' && !directory) return { path, type: 'file' };
    if (type === 'd' && directory && allowDirectories) return { path, type: 'directory' };
    throw new Error(`Unsafe archive entry type for ${path}: ${type || 'unknown'}`);
  });
}

export async function verifyBundleFiles(stagingRoot, files) {
  const root = resolve(stagingRoot);
  const summaries = [];
  for (const entry of files) {
    const path = normalizeBundlePath(entry.path);
    const fullPath = resolve(root, ...path.split('/'));
    const rel = relative(root, fullPath);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Bundle path escapes staging root: ${path}`);
    if (!existsSync(fullPath)) throw new Error(`Required bundle file is missing: ${path}`);
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error(`Bundle entry is not a file: ${path}`);
    if (info.size !== entry.bytes) throw new Error(`Bundle file size mismatch: ${path}`);
    const digest = await sha256File(fullPath);
    if (digest !== entry.sha256) throw new Error(`Bundle file digest mismatch: ${path}`);
    summaries.push({ path, bytes: info.size, sha256: digest });
  }
  return summaries;
}

export async function prepareTrackedBundle({
  projectRoot = repoRoot,
  stagingRoot = DEFAULT_STAGING_ROOT,
  bundleManifestPath = DEFAULT_BUNDLE_MANIFEST
} = {}) {
  const manifestPath = resolve(bundleManifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 'rus.world_base_source_bundle.v1') throw new Error('Unsupported world_base source bundle schema.');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('world_base source bundle has no files.');

  const expectedPaths = manifest.files.map((entry) => normalizeBundlePath(entry.path));
  if (new Set(expectedPaths).size !== expectedPaths.length) throw new Error('world_base source bundle contains duplicate paths.');

  const archivePath = resolve(projectRoot, normalizeBundlePath(manifest.archive?.path));
  const archiveInfo = await stat(archivePath).catch(() => null);
  if (!archiveInfo?.isFile()) throw new Error(`Tracked world_base archive is missing: ${archivePath}`);
  if (archiveInfo.size !== manifest.archive.bytes) throw new Error('Tracked world_base archive size mismatch.');
  if (await sha256File(archivePath) !== manifest.archive.sha256) throw new Error('Tracked world_base archive digest mismatch.');

  const importerManifestPath = resolve(projectRoot, normalizeBundlePath(manifest.importer_manifest?.path));
  if (await sha256File(importerManifestPath) !== manifest.importer_manifest.sha256) {
    throw new Error('Importer manifest digest does not match the source bundle.');
  }

  const listedNames = outputLines(runTar(['-tzf', archivePath]));
  const listed = validateArchiveEntries(listedNames, outputLines(runTar(['-tvzf', archivePath]))).map((entry) => entry.path);
  if (new Set(listed).size !== listed.length) throw new Error('Tracked world_base archive contains duplicate paths.');
  const expected = new Set(expectedPaths);
  const unexpected = listed.filter((path) => !expected.has(path));
  const missing = expectedPaths.filter((path) => !listed.includes(path));
  if (unexpected.length || missing.length) {
    throw new Error(`Tracked world_base archive file list mismatch: unexpected=${unexpected.join(',')}; missing=${missing.join(',')}`);
  }

  const targetRoot = assertSafeExtractionTarget(stagingRoot);
  await mkdir(dirname(targetRoot), { recursive: true });
  const temporaryRoot = await mkdtemp(join(dirname(targetRoot), `.${basename(targetRoot)}-extract-`));
  try {
    runTar(['-xzf', archivePath, '-C', temporaryRoot]);
    const files = await verifyBundleFiles(temporaryRoot, manifest.files);
    await replaceDirectory(temporaryRoot, targetRoot);
    return { sourceMode: 'tracked_bundle', bundleId: manifest.bundle_id, archivePath, manifestPath, stagingRoot: targetRoot, files };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function main() {
  await loadLocalEnv();
  const stagingRoot = resolve(process.env.RUS13_BASE_INPUT_ROOT || DEFAULT_STAGING_ROOT);
  const importerRoot = resolve(process.env.RUS13_WORLD_BASE_IMPORTER_ROOT || DEFAULT_IMPORTER_ROOT);
  const importerManifestPath = resolve(process.env.RUS13_WORLD_BASE_MANIFEST || join(importerRoot, 'config', 'world_base_import_manifest_v1.json'));
  const explicitSourceRoot = String(process.env.RUS13_BASE_SOURCE_ROOT ?? '').trim();
  const importerManifest = JSON.parse(await readFile(importerManifestPath, 'utf8'));
  const requiredPaths = (importerManifest.datasets ?? []).map((dataset) => normalizeBundlePath(dataset.path)).filter(Boolean);

  let prepared;
  if (explicitSourceRoot) {
    prepared = await prepareExternalSource({
      sourceRoot: resolve(explicitSourceRoot),
      regionSourceRoot: resolve(process.env.RUS13_NOVGOROD_SOURCE_ROOT || join(explicitSourceRoot, 'по регионам', 'НОВГОРОДСКИЙ РЕГИОН')),
      stagingRoot,
      requiredPaths
    });
  } else {
    prepared = await prepareTrackedBundle({
      projectRoot: repoRoot,
      stagingRoot,
      bundleManifestPath: resolve(process.env.RUS13_BASE_BUNDLE_MANIFEST || DEFAULT_BUNDLE_MANIFEST)
    });
  }

  const missing = requiredPaths.filter((path) => !existsSync(resolve(stagingRoot, ...path.split('/'))));
  if (missing.length) throw new Error(`Importer inputs are missing after staging: ${missing.join(', ')}`);

  console.log(JSON.stringify({
    sourceMode: prepared.sourceMode,
    sourceRoot: prepared.sourceRoot ?? null,
    bundleId: prepared.bundleId ?? null,
    archivePath: prepared.archivePath ?? null,
    stagingRoot,
    importerManifestPath,
    datasets: requiredPaths.length,
    verifiedFiles: prepared.files?.length ?? null,
    missing
  }, null, 2));
}

export async function prepareExternalSource({ sourceRoot, regionSourceRoot, stagingRoot, requiredPaths }) {
  if (!existsSync(sourceRoot)) throw new Error(`RUS13 source root not found: ${sourceRoot}`);
  if (!existsSync(regionSourceRoot)) throw new Error(`Novgorod source root not found: ${regionSourceRoot}`);
  const targetRoot = assertSafeExtractionTarget(stagingRoot);
  await mkdir(dirname(targetRoot), { recursive: true });
  const temporaryRoot = await mkdtemp(join(dirname(targetRoot), `.${basename(targetRoot)}-authoring-`));
  try {
    await copyRootFiles(sourceRoot, temporaryRoot);
    await copyNovgorodFlatFiles(regionSourceRoot, temporaryRoot);
    await copyRepoDataDirs(temporaryRoot);
    await extractNestedZips(regionSourceRoot, temporaryRoot);
    const missing = requiredPaths.filter((path) => !existsSync(resolve(temporaryRoot, ...path.split('/'))));
    if (missing.length) throw new Error(`External authoring source is incomplete: ${missing.join(', ')}`);
    await replaceDirectory(temporaryRoot, targetRoot);
    return { sourceMode: 'external_authoring_override', sourceRoot, regionSourceRoot, stagingRoot: targetRoot };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function copyRootFiles(sourceRoot, stagingRoot) {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !['.csv', '.xlsx', '.json', '.txt'].includes(extname(entry.name).toLowerCase())) continue;
    await copyFile(join(sourceRoot, entry.name), join(stagingRoot, entry.name));
  }
}

async function copyNovgorodFlatFiles(regionSourceRoot, stagingRoot) {
  const destination = join(stagingRoot, 'nov_region_audit');
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(regionSourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() === '.zip') continue;
    await copyFile(join(regionSourceRoot, entry.name), join(destination, entry.name));
  }
}

async function copyRepoDataDirs(stagingRoot) {
  for (const dirName of ['world-base-seeds', 'novgorod-region']) {
    const source = join(repoRoot, 'data', dirName);
    if (existsSync(source)) await copyDirRecursive(source, join(stagingRoot, dirName));
  }
}

async function copyDirRecursive(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyDirRecursive(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

async function extractNestedZips(regionSourceRoot, stagingRoot) {
  for (const [zipName, relativeDestination] of nestedZipTargets) {
    const zipPath = join(regionSourceRoot, zipName);
    if (!existsSync(zipPath)) continue;
    const destination = assertSafeExtractionTarget(join(stagingRoot, relativeDestination));
    const names = outputLines(runTar(['-tf', zipPath], `Failed to list ${basename(zipPath)}`));
    validateArchiveEntries(names, outputLines(runTar(['-tvf', zipPath], `Failed to inspect ${basename(zipPath)}`)), { allowDirectories: true });
    await mkdir(dirname(destination), { recursive: true });
    const temporaryRoot = await mkdtemp(join(dirname(destination), `.${basename(destination)}-extract-`));
    try {
      runTar(['-xf', zipPath, '-C', temporaryRoot], `Failed to extract ${basename(zipPath)} into ${temporaryRoot}`);
      await replaceDirectory(temporaryRoot, destination);
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }
}

function assertSafeExtractionTarget(value) {
  const target = resolve(value);
  if (dirname(target) === target) throw new Error(`Refusing to use filesystem root as extraction target: ${target}`);
  return target;
}

async function replaceDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await rename(source, destination);
}

function outputLines(value) {
  return String(value ?? '').split(/\r?\n/u).filter((line) => line.trim());
}

function runTar(args, message = 'Failed to process tracked world_base archive') {
  const result = spawnSync('tar', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
