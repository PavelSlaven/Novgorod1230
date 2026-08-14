import { spawn, spawnSync } from 'node:child_process';
import { accessSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export async function runOneClickBootstrap({
  env = process.env,
  nodeVersion = process.versions.node,
  platform = process.platform,
  documentsDirectory,
  repositoryRoot = process.cwd(),
  output = process.stdout,
  dependencies = createOneClickDependencies({ platform })
} = {}) {
  const keyFile = String(env.NOVGOROD_DEEPSEEK_KEY_FILE
    ?? resolve(documentsDirectory ?? dependencies.documentsDirectory(),
      'NOVGOROD API', 'API KEY DEEPSEEK DVINA.env')).trim();
  if (!keyFile || !dependencies.pathExists(keyFile)) {
    fail('LOCAL_PLAY_KEY_FILE_MISSING', 'DeepSeek key file was not found.');
  }
  const apiKey = validateRawApiKey(await dependencies.readFile(keyFile));
  validatePrerequisites({ nodeVersion, dependencies });
  output.write('DeepSeek key loaded from the configured private file.\n');
  await ensureDockerReady({ platform, dependencies, output });
  if (!dependencies.pathExists(resolve(repositoryRoot, 'node_modules'))) {
    output.write('Installing dependencies with npm ci...\n');
    await dependencies.runNpmCi({ repositoryRoot });
  }
  return dependencies.runLocalPlay({
    env: { ...env, DEEPSEEK_API_KEY: apiKey },
    repositoryRoot,
    dependencies: {
      nodeVersion,
      onReady: dependencies.openBrowser
    }
  });
}

export function createOneClickDependencies({
  platform = process.platform,
  environment = process.env,
  spawnSyncCommand = spawnSync
} = {}) {
  return Object.freeze({
    documentsDirectory() {
      if (platform !== 'win32') return resolve(homedir(), 'Documents');
      const result = spawnSyncCommand('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new();[Environment]::GetFolderPath('MyDocuments')"
      ], { encoding: 'utf8', windowsHide: true });
      const directory = String(result.stdout ?? '').trim();
      if (result.status !== 0 || !directory) {
        fail('LOCAL_PLAY_DOCUMENTS_UNAVAILABLE',
          'Windows My Documents directory could not be resolved.');
      }
      return directory;
    },
    pathExists(path) {
      try { accessSync(path); return true; } catch { return false; }
    },
    commandAvailable(command) {
      const probe = spawnSyncCommand(
        platform === 'win32' ? 'where.exe' : 'which',
        [command], { stdio: 'ignore', windowsHide: true });
      return probe.status === 0;
    },
    dockerReady() {
      const probe = spawnSyncCommand('docker',
        ['version', '--format', '{{.Server.Version}}'], {
          encoding: 'utf8', timeout: 30_000, windowsHide: true
        });
      return probe.status === 0 && String(probe.stdout).trim().length > 0;
    },
    readFile: (path) => readFile(path, 'utf8'),
    runNpmCi({ repositoryRoot }) {
      const executable = platform === 'win32'
        ? environment.ComSpec ?? 'cmd.exe'
        : 'npm';
      const args = platform === 'win32'
        ? ['/d', '/s', '/c', 'npm ci']
        : ['ci'];
      const result = spawnSyncCommand(executable, args,
        { cwd: repositoryRoot, stdio: 'inherit', windowsHide: false });
      if (result.status !== 0) {
        fail('LOCAL_PLAY_NPM_CI_FAILED', 'npm ci failed.');
      }
    },
    sleep: (milliseconds) => new Promise((resolvePromise) =>
      setTimeout(resolvePromise, milliseconds)),
    startDockerDesktop: (executable) => startDetached(executable, []),
    openBrowser: (url) => platform === 'win32'
      ? startDetached('cmd.exe', ['/d', '/s', '/c', 'start', '', url])
      : startDetached(platform === 'darwin' ? 'open' : 'xdg-open', [url]),
    runLocalPlay: (options) => import('./local-play.js')
      .then(({ runLocalPlay }) => runLocalPlay(options))
  });
}

function validatePrerequisites({ nodeVersion, dependencies }) {
  const major = Number(String(nodeVersion ?? '').split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    fail('LOCAL_PLAY_NODE_VERSION_UNSUPPORTED',
      `Node.js 22+ is required; found ${nodeVersion || '<unknown>'}.`);
  }
  for (const command of ['npm', 'docker']) {
    if (!dependencies.commandAvailable(command)) {
      fail('LOCAL_PLAY_COMMAND_MISSING', `${command} is required.`);
    }
  }
}

async function ensureDockerReady({ platform, dependencies, output }) {
  if (await dependencies.dockerReady()) return;
  if (platform !== 'win32') {
    fail('LOCAL_PLAY_DOCKER_UNAVAILABLE',
      'Start Docker before using the one-click launcher.');
  }
  const executable = dependencies.dockerDesktopPath
    ?? 'C:/Program Files/Docker/Docker/Docker Desktop.exe';
  if (!dependencies.pathExists(executable)) {
    fail('LOCAL_PLAY_DOCKER_DESKTOP_MISSING',
      'Docker Desktop is not installed at the standard location.');
  }
  output.write('Starting Docker Desktop...\n');
  await dependencies.startDockerDesktop(executable);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await dependencies.sleep(1_000);
    if (await dependencies.dockerReady()) return;
  }
  fail('LOCAL_PLAY_DOCKER_START_TIMEOUT',
    'Docker Desktop did not become ready within 180 seconds.');
}

function validateRawApiKey(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /\s/u.test(normalized)) {
    fail('LOCAL_PLAY_KEY_FILE_INVALID',
      'DeepSeek key file must contain one raw token without whitespace.');
  }
  return normalized;
}

function startDetached(executable, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolvePromise();
    });
  });
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
