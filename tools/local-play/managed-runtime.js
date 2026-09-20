import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from
  'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { localDataRoot, localPlayError } from './local-postgres.js';

export const MANAGED_RUNTIME_PINS = Object.freeze({
  uv: Object.freeze({ version: '0.12.10',
    file: 'uv-x86_64-pc-windows-msvc.zip',
    sha256: 'f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2' }),
  python: '3.11.11',
  giga: Object.freeze({
    model: 'ai-sage/Giga-Embeddings-instruct-480M-0826',
    revision: '0c94f705aa35719324fb46f7e75b0a5c275da6e4',
    files: Object.freeze([
      Object.freeze({ file: 'model.safetensors', size: 967_470_272,
        sha256: '9ce03c6c5ae02baebb42ce3015b6f3e628c5fec7b7745bc2490f6ff961a654a5' }),
      Object.freeze({ file: 'tokenizer.json', size: 10_728_166,
        sha256: '0870f9c0f06a677f7e939e7765ae3a5d9582f2a6d7e7258176ecd1a3eab96cef' })
    ])
  })
});

export async function provisionManagedRuntime({ repositoryRoot = process.cwd(),
  dataRoot = localDataRoot(), fetchImpl = fetch,
  command = spawnSync, log = console.log } = {}) {
  const giga = await provisionGiga({ repositoryRoot, dataRoot, fetchImpl,
    command, log });
  return Object.freeze({ giga, async close() {} });
}

export async function provisionGiga({ repositoryRoot = process.cwd(),
  dataRoot = localDataRoot(), fetchImpl = fetch, command = spawnSync,
  log = console.log } = {}) {
  const { uv, python, giga } = MANAGED_RUNTIME_PINS;
  const downloads = join(dataRoot, 'cache', 'downloads');
  const uvArchive = join(downloads, uv.file);
  const uvDir = join(dataRoot, 'runtime', 'uv', uv.version);
  const uvPath = join(uvDir, 'uv.exe');
  if (!existsSync(uvPath)) {
    await ensureArtifact({
      url: `https://releases.astral.sh/github/uv/releases/download/${uv.version}/${uv.file}`,
      path: uvArchive, sha256: uv.sha256, fetchImpl, log
    });
    await mkdir(uvDir, { recursive: true });
    requireCommand(command('tar', ['-xf', uvArchive, '-C', uvDir],
      { encoding: 'utf8', windowsHide: true, timeout: 60_000 }),
    'LOCAL_GIGA_UV_EXTRACT_FAILED', 'Не удалось распаковать managed uv.');
  }
  const pythonDir = join(dataRoot, 'runtime', 'python');
  const managedPython = join(pythonDir,
    `cpython-${python}-windows-x86_64-none`, 'python.exe');
  const venvDir = join(dataRoot, 'runtime', 'giga-python');
  const pythonPath = join(venvDir, 'Scripts', 'python.exe');
  const hfHome = join(dataRoot, 'cache', 'huggingface');
  const managedEnv = { ...process.env, UV_PYTHON_INSTALL_DIR: pythonDir,
    UV_CACHE_DIR: join(dataRoot, 'cache', 'uv'), HF_HOME: hfHome,
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONUTF8: '1' };
  if (!existsSync(managedPython)) runChecked(command, uvPath,
    ['python', 'install', python], managedEnv,
    'LOCAL_GIGA_PYTHON_INSTALL_FAILED');
  if (!existsSync(pythonPath)) runChecked(command, uvPath,
    ['venv', '--python', python, '--seed', venvDir], managedEnv,
    'LOCAL_GIGA_VENV_FAILED');
  const requirements = resolve(repositoryRoot,
    'tools/world-catalog-workflow/requirements-embeddings.txt');
  const markerPath = join(venvDir, '.novgorod-requirements');
  const marker = `${uv.version}\n${python}\n${await readFile(requirements, 'utf8')}`;
  const currentMarker = await readFile(markerPath, 'utf8').catch(() => '');
  if (currentMarker !== marker) {
    runChecked(command, uvPath, ['pip', 'install', '--python', pythonPath,
      '-r', requirements], managedEnv, 'LOCAL_GIGA_DEPENDENCIES_FAILED',
    30 * 60_000);
    await writeFile(markerPath, marker, 'utf8');
  }
  const snapshot = join(dataRoot, 'models', 'giga', giga.revision);
  if (!(await gigaSnapshotReady(snapshot))) {
    const hf = join(venvDir, 'Scripts', 'hf.exe');
    runChecked(command, hf, ['download', giga.model, '--revision',
      giga.revision, '--local-dir', snapshot], managedEnv,
    'LOCAL_GIGA_MODEL_DOWNLOAD_FAILED',
    30 * 60_000);
    for (const file of giga.files) await assertArtifact({
      path: join(snapshot, file.file), ...file });
  }
  return Object.freeze({ python: pythonPath, hf: join(venvDir, 'Scripts', 'hf.exe'),
    hfHome, modelPath: snapshot,
    identity: Object.freeze({ model: giga.model, revision: giga.revision,
      python, uv: uv.version }) });
}

export async function ensureArtifact({ url, path, size = null, sha256,
  fetchImpl = fetch, log = console.log } = {}) {
  if (!path) throw new TypeError('artifact path is required.');
  await mkdir(dirname(path), { recursive: true });
  const release = await acquireArtifactLock(`${path}.lock`);
  try { return await ensureArtifactLocked({ url, path, size, sha256,
    fetchImpl, log }); }
  finally { await release(); }
}

async function ensureArtifactLocked({ url, path, size, sha256, fetchImpl,
  log }) {
  if (existsSync(path)) {
    try { await assertArtifact({ path, size, sha256 }); return path; }
    catch { await unlink(path); }
  }
  const partial = `${path}.part`;
  let offset = existsSync(partial) ? (await stat(partial)).size : 0;
  if (size != null && offset === size) {
    try { await assertArtifact({ path: partial, size, sha256 });
      await rename(partial, path); return path; }
    catch { await unlink(partial); offset = 0; }
  } else if (size != null && offset > size) {
    await unlink(partial); offset = 0;
  }
  const response = await fetchImpl(url, {
    redirect: 'follow', headers: offset > 0 ? { range: `bytes=${offset}-` } : {}
  });
  if (!response.ok || !response.body) throw localPlayError(
    'LOCAL_PROVISION_DOWNLOAD_FAILED', `Не удалось скачать ${url} (HTTP ${response.status}).`);
  const append = offset > 0 && response.status === 206;
  log(`Provisioning: ${append ? 'продолжаю загрузку' : 'загружаю'} ${path.split(/[\\/]/u).at(-1)}.`);
  await pipeline(Readable.fromWeb(response.body),
    createWriteStream(partial, { flags: append ? 'a' : 'w' }));
  await assertArtifact({ path: partial, size, sha256 });
  await rename(partial, path);
  return path;
}

async function acquireArtifactLock(path) {
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    try {
      const handle = await open(path, 'wx');
      try { await handle.writeFile(`${process.pid}\n`); }
      catch (error) { await handle.close(); await unlink(path).catch(() => {});
        throw error; }
      return async () => { await handle.close(); await unlink(path).catch(() => {}); };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number.parseInt(await readFile(path, 'utf8').catch(() => ''), 10);
      if (Number.isInteger(owner) && !processAlive(owner)) {
        await unlink(path).catch(() => {}); continue;
      }
      if (!Number.isInteger(owner)) {
        const details = await stat(path).catch(() => null);
        if (details && Date.now() - details.mtimeMs > 10_000) {
          await unlink(path).catch(() => {}); continue;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw localPlayError('LOCAL_PROVISION_LOCK_TIMEOUT',
    `Истекло время ожидания provisioning lock: ${path}.`);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
}

export async function assertArtifact({ path, size = null, sha256 }) {
  const details = await stat(path);
  if (size != null && details.size !== size) throw localPlayError(
    'LOCAL_PROVISION_SIZE_MISMATCH', `Неверный размер ${path}.`);
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  if (hash.digest('hex') !== sha256) throw localPlayError(
    'LOCAL_PROVISION_CHECKSUM_MISMATCH', `Checksum не совпал для ${path}.`);
}

async function gigaSnapshotReady(snapshot) {
  if (!existsSync(snapshot)) return false;
  try {
    for (const file of MANAGED_RUNTIME_PINS.giga.files) await assertArtifact({
      path: join(snapshot, file.file), ...file });
    return true;
  } catch { return false; }
}
function runChecked(command, executable, args, env, code, timeout = 10 * 60_000) {
  requireCommand(command(executable, args, { encoding: 'utf8', windowsHide: true,
    env, timeout, maxBuffer: 20 * 1024 * 1024 }), code,
  `${executable} завершился с ошибкой.`);
}
function requireCommand(result, code, message) {
  if (result?.status !== 0) throw localPlayError(code,
    `${message} ${String(result?.stderr ?? '').trim()}`.trim());
}
