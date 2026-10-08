import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const childScript = `
const code = (error) => typeof error?.code === 'string' ? error.code : error?.name ?? 'UNKNOWN';
const emit = (result) => console.log(JSON.stringify(result));
try {
  const [catalog, configModule, common] = await Promise.all(
    process.argv.slice(1).map((url) => import(url)));
  const result = { cwd: process.cwd(), speechCount: null, speechErrorCode: null,
    configRoot: null, configErrorCode: null, commonIds: [], commonErrorCode: null };
  try { result.speechCount = (await catalog.loadNpcSpeechRegisters()).length; }
  catch (error) { result.speechErrorCode = code(error); }
  try { result.configRoot = configModule.readServerConfig({}).rootDir; }
  catch (error) { result.configErrorCode = code(error); }
  try {
    const records = await common.loadCommonCatalogLookupRecords();
    result.commonIds = records.inventory_archetypes.slice(0, 50)
      .map(({ inventory_archetype_id }) => String(inventory_archetype_id).slice(0, 100));
  } catch (error) { result.commonErrorCode = code(error); }
  emit(result);
} catch (error) { emit({ importErrorCode: code(error) }); }
`;

test('issue #548 resolves cold imports from a foreign cwd', async () => {
  const foreignCwd = await mkdtemp(join(tmpdir(), 'issue-548-cold-cwd-'));
  try {
    const modules = [
      'packages/runtime-catalog/src/index.js',
      'apps/game-server/src/config.js',
      'packages/runtime-catalog/src/common-catalog-lookups.js',
    ].map((path) => pathToFileURL(resolve(projectRoot, path)).href);
    const child = spawnSync(process.execPath,
      ['--input-type=module', '--eval', childScript, ...modules], {
        cwd: foreignCwd,
        env: { ...process.env, CUDA_VISIBLE_DEVICES: '' },
        encoding: 'utf8', maxBuffer: 32 * 1024, timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    assert.equal(child.error, undefined, 'child process must complete within 30 seconds');
    assert.equal(child.status, 0, 'child must report loader failures as bounded JSON');
    const result = JSON.parse(child.stdout);
    assert.equal(result.importErrorCode, undefined, 'production modules must import');
    assert.equal(resolve(result.cwd), foreignCwd, 'child must start in its foreign cwd');
    const cwdFromRoot = relative(projectRoot, result.cwd);
    assert.ok(cwdFromRoot.startsWith('..') || isAbsolute(cwdFromRoot),
      'child cwd must be outside the repository');
    assert.equal(result.speechErrorCode, null);
    assert.equal(result.speechCount, 139, 'pinned speech registers must load from project data');
    assert.equal(result.configErrorCode, null);
    assert.equal(resolve(result.configRoot), projectRoot,
      'server config root must resolve from its module location');

    const raw = JSON.parse(await readFile(
      join(projectRoot, 'data/world-catalogs/common/inventory-archetypes.json'), 'utf8'));
    assert.equal(result.commonErrorCode, null, 'common catalog must load from project data');
    assert.deepEqual(result.commonIds,
      raw.archetypes.map(({ inventory_archetype_id }) => inventory_archetype_id));
  } finally {
    await rm(foreignCwd, { recursive: true, force: true });
  }
});
