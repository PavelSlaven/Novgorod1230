import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, stat, statfs, unlink, writeFile } from
  'node:fs/promises';
import { totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { LOCAL_LLM_PRESET } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { localDataRoot, localPlayError } from './local-postgres.js';

const GIB = 1024 ** 3;
export const MANAGED_RUNTIME_PINS = Object.freeze({
  gemma: Object.freeze({
    model: LOCAL_LLM_PRESET.model,
    revision: '96c11c22b1128c3c8c655b21557b409f307c557f',
    file: 'Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced-Q4_K_P.gguf',
    size: 16_916_915_296,
    sha256: '295121f61edeedaa8604bcaf3171831981c546c3a10a210cea87dc992eb429ae'
  }),
  llama: Object.freeze({
    version: 'b10855', backend: 'cuda-13.3-windows-x64',
    archives: Object.freeze([
      Object.freeze({ file: 'llama-b10855-bin-win-cuda-13.3-x64.zip',
        size: 149_695_469,
        sha256: 'e3fc18370502ff3144bfc25f82f4a9fb5c726611359609a676a16201ddd01edc' }),
      Object.freeze({ file: 'cudart-llama-bin-win-cuda-13.3-x64.zip',
        size: 390_970_417,
        sha256: '1462a050eb4c684921ba51dcc4cc488a036674c3e73e9945ee705b854808d03e' })
    ])
  }),
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

export async function inspectLocalLlmHardware({ dataRoot = localDataRoot(),
  command = spawnSync, platform = process.platform, arch = process.arch,
  ramBytes = totalmem() } = {}) {
  await mkdir(dataRoot, { recursive: true });
  const disk = await statfs(dataRoot);
  const gpuResult = command('nvidia-smi', [
    '--query-gpu=name,memory.total,driver_version,compute_cap',
    '--format=csv,noheader,nounits'
  ], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  const gpu = parseGpu(gpuResult);
  const facts = Object.freeze({ platform, arch,
    ram_gib: round(ramBytes / GIB),
    disk_free_gib: round(Number(disk.bavail) * Number(disk.bsize) / GIB),
    gpu });
  const reasons = [];
  if (platform !== 'win32' || arch !== 'x64') {
    reasons.push('Поддерживаемый встроенный backend сейчас требует Windows x64.');
  }
  if (!gpu) reasons.push('NVIDIA GPU и драйвер CUDA не обнаружены.');
  else if (gpu.vram_gib < 24) reasons.push('Для pinned Gemma Q4_K_P требуется не менее 24 GiB VRAM.');
  if (facts.ram_gib < 32) reasons.push('Требуется не менее 32 GiB RAM.');
  if (facts.disk_free_gib < 30) reasons.push('Для первого provisioning требуется не менее 30 GiB свободного места.');
  return Object.freeze({ supported: reasons.length === 0, facts,
    reasons: Object.freeze(reasons) });
}

export async function provisionManagedRuntime({ repositoryRoot = process.cwd(),
  dataRoot = localDataRoot(), fetchImpl = fetch, spawnProcess = spawn,
  command = spawnSync, log = console.log, startLlm = true } = {}) {
  const hardware = await inspectLocalLlmHardware({ dataRoot, command });
  const giga = await provisionGiga({ repositoryRoot, dataRoot, fetchImpl,
    command, log });
  if (!startLlm || !hardware.supported) return Object.freeze({ hardware, giga, llm: null,
    async close() {} });
  const llm = await provisionAndStartGemma({ dataRoot, fetchImpl,
    spawnProcess, command, log, hardware, hfPath: giga.hf,
    hfHome: giga.hfHome });
  return Object.freeze({ hardware, giga, llm,
    close: () => llm.close() });
}

export async function provisionAndStartGemma({ dataRoot = localDataRoot(),
  fetchImpl = fetch, spawnProcess = spawn, command = spawnSync,
  log = console.log, hardware = null, hfPath = null, hfHome = null,
  portAvailable = localPortAvailable, readinessFetch = fetch } = {}) {
  const { gemma, llama } = MANAGED_RUNTIME_PINS;
  if (!(await portAvailable(8000))) throw localPlayError(
    'LOCAL_LLM_PORT_UNAVAILABLE',
    'Порт managed Gemma 127.0.0.1:8000 уже занят другим процессом.');
  const downloads = join(dataRoot, 'cache', 'downloads');
  const modelPath = join(dataRoot, 'models', gemma.revision, gemma.file);
  if (hfPath) await ensureHuggingFaceArtifact({ path: modelPath,
    model: gemma.model, revision: gemma.revision, file: gemma.file,
    size: gemma.size, sha256: gemma.sha256, hfPath, hfHome, command, log });
  else await ensureArtifact({ url: `https://huggingface.co/${gemma.model}/resolve/${gemma.revision}/${gemma.file}`,
    path: modelPath, size: gemma.size, sha256: gemma.sha256, fetchImpl, log });
  const engineDir = join(dataRoot, 'runtime', 'llama.cpp', llama.version);
  const serverPath = join(engineDir, 'llama-server.exe');
  if (!existsSync(serverPath)) {
    await mkdir(engineDir, { recursive: true });
    for (const archive of llama.archives) {
      const archivePath = join(downloads, archive.file);
      await ensureArtifact({
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${llama.version}/${archive.file}`,
        path: archivePath, size: archive.size, sha256: archive.sha256,
        fetchImpl, log
      });
      requireCommand(command('tar', ['-xf', archivePath, '-C', engineDir],
        { encoding: 'utf8', windowsHide: true, timeout: 180_000 }),
      'LOCAL_LLM_ENGINE_EXTRACT_FAILED', 'Не удалось распаковать llama.cpp.');
    }
  }
  if (!existsSync(serverPath)) throw localPlayError(
    'LOCAL_LLM_ENGINE_INVALID', 'В pinned llama.cpp отсутствует llama-server.exe.');
  const controller = managedLlamaProcess({ serverPath, engineDir, modelPath,
    spawnProcess, log, readinessFetch });
  await controller.start();
  return Object.freeze({ baseUrl: LOCAL_LLM_PRESET.base_url,
    model: gemma.model,
    identity: runtimeIdentity({ hardware }), close: controller.close });
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

async function ensureHuggingFaceArtifact({ path, model, revision, file, size,
  sha256, hfPath, hfHome, command, log }) {
  await mkdir(dirname(path), { recursive: true });
  const release = await acquireArtifactLock(`${path}.lock`);
  try {
    try { await assertArtifact({ path, size, sha256 }); return path; }
    catch { await unlink(path).catch(() => {}); }
    await unlink(`${path}.part`).catch(() => {});
    log(`Provisioning: загружаю ${file} через managed Hugging Face downloader.`);
    runChecked(command, hfPath, ['download', model, file, '--revision',
      revision, '--local-dir', dirname(path)], { ...process.env,
      HF_HOME: hfHome, HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
    'LOCAL_LLM_MODEL_DOWNLOAD_FAILED', 60 * 60_000);
    await assertArtifact({ path, size, sha256 });
    return path;
  } finally { await release(); }
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

function managedLlamaProcess({ serverPath, engineDir, modelPath,
  spawnProcess, log, readinessFetch }) {
  let child = null; let closing = false; let restarts = 0;
  const launch = () => {
    child = spawnProcess(serverPath, ['-m', modelPath, '--alias',
      MANAGED_RUNTIME_PINS.gemma.model, '--host', '127.0.0.1', '--port',
      '8000', '--jinja', '-c', '32768', '-ngl', '99',
      '--reasoning', 'off'], {
      cwd: engineDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${engineDir};${process.env.PATH ?? ''}` }
    });
    child.stdout.on('data', (chunk) => log(String(chunk).trim()));
    child.stderr.on('data', (chunk) => log(String(chunk).trim()));
    child.once('exit', () => {
      child = null;
      if (!closing && restarts++ < 1) launch();
    });
  };
  return Object.freeze({
    async start() { launch(); await waitForLlama(() => child, readinessFetch); },
    async close() {
      closing = true; if (!child) return;
      const current = child; current.kill('SIGTERM');
      await waitForExit(current, 10_000);
      if (current.exitCode == null) current.kill('SIGKILL');
    }
  });
}

async function waitForLlama(current, fetchImpl) {
  let last = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (!current()) throw localPlayError('LOCAL_LLM_ENGINE_EXITED',
      'llama.cpp завершился во время загрузки модели.');
    try {
      const health = await fetchImpl('http://127.0.0.1:8000/health');
      const models = health.ok
        ? await fetchImpl('http://127.0.0.1:8000/v1/models') : null;
      const payload = models?.ok ? await models.json() : null;
      if (health.ok && models?.ok && Array.isArray(payload?.data)
          && payload.data.some((entry) =>
            entry?.id === MANAGED_RUNTIME_PINS.gemma.model)) return;
      last = health.ok ? 'pinned model alias отсутствует в /v1/models'
        : `HTTP ${health.status}`;
    } catch (error) { last = error?.message; }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw localPlayError('LOCAL_LLM_READINESS_TIMEOUT',
    `Локальная Gemma не стала ready: ${last ?? 'unknown error'}.`);
}

async function gigaSnapshotReady(snapshot) {
  if (!existsSync(snapshot)) return false;
  try {
    for (const file of MANAGED_RUNTIME_PINS.giga.files) await assertArtifact({
      path: join(snapshot, file.file), ...file });
    return true;
  } catch { return false; }
}
function parseGpu(result) {
  if (result?.status !== 0) return null;
  const [name, memory, driver, compute] = String(result.stdout).trim()
    .split(',').map((value) => value.trim());
  const vram = Number(memory);
  if (!name || !Number.isFinite(vram)) return null;
  return Object.freeze({ name, vram_gib: round(vram / 1024),
    driver, compute_capability: compute });
}
function runtimeIdentity({ hardware }) {
  const { gemma, llama } = MANAGED_RUNTIME_PINS;
  return Object.freeze({ provider: 'managed_local_openai_compatible',
    base_url: LOCAL_LLM_PRESET.base_url,
    model: gemma.model, model_revision: gemma.revision,
    model_file_sha256: gemma.sha256, engine: 'llama.cpp',
    engine_version: llama.version, backend: llama.backend,
    hardware: hardware?.facts ?? null });
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
function round(value) { return Math.round(value * 10) / 10; }
function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}

function localPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer(); server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () =>
      server.close(() => resolve(true)));
  });
}
