import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const repoRoot = resolve(import.meta.dirname, '..');
const defaultSourceRoot = join(process.env.USERPROFILE ?? '', 'Desktop', 'Русь 13 ВЕК', 'БАЗА');
const sourceRoot = resolve(process.env.RUS13_BASE_SOURCE_ROOT || defaultSourceRoot);
const stagingRoot = resolve(process.env.RUS13_BASE_INPUT_ROOT || join(repoRoot, 'data', 'rus13-base-staging'));
const regionSourceRoot = resolve(process.env.RUS13_NOVGOROD_SOURCE_ROOT || join(sourceRoot, 'по регионам', 'НОВГОРОДСКИЙ РЕГИОН'));
const importerRoot = resolve(process.env.RUS13_WORLD_BASE_IMPORTER_ROOT || join(repoRoot, 'tools', 'rus13-world-base-importer', 'world_base_importer_v1'));
const manifestPath = resolve(process.env.RUS13_WORLD_BASE_MANIFEST || join(importerRoot, 'config', 'world_base_import_manifest_v1.json'));

const nestedZipTargets = new Map([
  ['novgorod_region_template_links_v1_full_pack.zip', 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED'],
  ['novgorod_full_graph_g1_g4_v6_game_ready.zip', 'nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED'],
  ['novgorod_region_place_generation_rules_v2_expanded_full_pack.zip', 'nov_region_audit/novgorod_region_place_generation_rules_v2_expanded_full_pack_EXTRACTED'],
  ['novgorod_place_generation_limits_v2_economic_full_pack.zip', 'nov_region_audit/novgorod_place_generation_limits_v2_economic_full_pack_EXTRACTED'],
  ['novgorod_regional_templates_v1_package.zip', 'nov_region_audit/novgorod_regional_templates_v1_package_EXTRACTED']
]);

if (!existsSync(sourceRoot)) {
  throw new Error(`RUS13 source root not found: ${sourceRoot}`);
}
if (!existsSync(regionSourceRoot)) {
  throw new Error(`Novgorod source root not found: ${regionSourceRoot}`);
}
if (!existsSync(manifestPath)) {
  throw new Error(`Importer manifest not found: ${manifestPath}`);
}

await mkdir(stagingRoot, { recursive: true });
await copyRootFiles();
await copyNovgorodFlatFiles();
await copyRepoDataDirs();
await extractNestedZips();

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const paths = (manifest.datasets ?? []).map((dataset) => String(dataset.path ?? '')).filter(Boolean);
const missing = [];
const summaries = [];
for (const relativePath of paths) {
  const fullPath = join(stagingRoot, relativePath);
  if (!existsSync(fullPath)) {
    missing.push(relativePath);
    continue;
  }
  const info = await stat(fullPath);
  summaries.push({ path: relativePath, bytes: info.size, sha256: await sha256File(fullPath) });
}

const result = {
  sourceRoot,
  regionSourceRoot,
  stagingRoot,
  manifestPath,
  datasets: paths.length,
  present: summaries.length,
  missing,
  files: summaries
};

console.log(JSON.stringify(result, null, 2));
if (missing.length > 0) {
  process.exitCode = 1;
}

async function copyRootFiles() {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!['.csv', '.xlsx', '.json', '.txt'].includes(ext)) continue;
    await copyFile(join(sourceRoot, entry.name), join(stagingRoot, entry.name));
  }
}

async function copyNovgorodFlatFiles() {
  const destination = join(stagingRoot, 'nov_region_audit');
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(regionSourceRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (ext === '.zip') continue;
    await copyFile(join(regionSourceRoot, entry.name), join(destination, entry.name));
  }
}

async function copyRepoDataDirs() {
  const repoData = join(repoRoot, 'data');
  for (const dirName of ['world-base-seeds', 'novgorod-region']) {
    const source = join(repoData, dirName);
    if (!existsSync(source)) continue;
    const destination = join(stagingRoot, dirName);
    await copyDirRecursive(source, destination);
  }
}

async function copyDirRecursive(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
      continue;
    }
    if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

async function extractNestedZips() {
  for (const [zipName, relativeDestination] of nestedZipTargets) {
    const zipPath = join(regionSourceRoot, zipName);
    if (!existsSync(zipPath)) continue;
    const destination = join(stagingRoot, relativeDestination);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    const result = spawnSync('tar', ['-xf', zipPath, '-C', destination], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`Failed to extract ${basename(zipPath)} into ${destination}: ${result.stderr || result.stdout}`);
    }
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}
