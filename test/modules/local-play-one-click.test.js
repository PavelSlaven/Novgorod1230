import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { createOneClickDependencies, runOneClickBootstrap } from
  '../../tools/local-play/one-click.js';

test('one-click reads the raw key into process env without printing it',
  async () => {
    const secret = 'test-deepseek-key';
    let launchedEnv;
    let output = '';
    await runOneClickBootstrap({
      env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
      nodeVersion: '24.0.0',
      repositoryRoot: 'C:/repo',
      output: { write(value) { output += value; } },
      dependencies: fixtureDependencies({
        readFile: async () => `${secret}\n`,
        runLocalPlay: async ({ env }) => { launchedEnv = env; }
      })
    });
    assert.equal(launchedEnv.DEEPSEEK_API_KEY, secret);
    assert.equal(output.includes(secret), false);
  });

test('one-click runs npm ci once when node_modules is absent', async () => {
  const order = [];
  await runOneClickBootstrap({
    env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
    nodeVersion: '24.0.0',
    repositoryRoot: 'C:/repo',
    output: { write() {} },
    dependencies: fixtureDependencies({
      pathExists: (path) => path === 'C:/private/key.env',
      runNpmCi: async () => { order.push('npm-ci'); },
      runLocalPlay: async () => { order.push('local-play'); }
    })
  });
  assert.deepEqual(order, ['npm-ci', 'local-play']);
});

test('Windows npm bootstrap uses ComSpec instead of spawning npm.cmd', () => {
  const calls = [];
  const dependencies = createOneClickDependencies({
    platform: 'win32',
    environment: { ComSpec: 'C:/Windows/System32/cmd.exe' },
    spawnSyncCommand: (executable, args, options) => {
      calls.push({ executable, args, options });
      return { status: 0 };
    }
  });
  dependencies.runNpmCi({ repositoryRoot: 'C:/repo' });
  assert.equal(calls[0].executable, 'C:/Windows/System32/cmd.exe');
  assert.deepEqual(calls[0].args, ['/d', '/s', '/c', 'npm ci']);
  assert.equal(calls[0].options.cwd, 'C:/repo');
});

test('one-click starts Docker Desktop and waits for the daemon', async () => {
  let probes = 0;
  let starts = 0;
  let sleeps = 0;
  await runOneClickBootstrap({
    env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
    nodeVersion: '24.0.0',
    platform: 'win32',
    repositoryRoot: 'C:/repo',
    output: { write() {} },
    dependencies: fixtureDependencies({
      dockerReady: () => ++probes >= 3,
      startDockerDesktop: () => { starts += 1; },
      sleep: async () => { sleeps += 1; }
    })
  });
  assert.equal(starts, 1);
  assert.equal(probes, 3);
  assert.equal(sleeps, 2);
});

test('one-click opens the browser through the readiness callback', async () => {
  const opened = [];
  await runOneClickBootstrap({
    env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
    nodeVersion: '24.0.0',
    repositoryRoot: 'C:/repo',
    output: { write() {} },
    dependencies: fixtureDependencies({
      openBrowser: async (url) => { opened.push(url); },
      runLocalPlay: async ({ dependencies }) => {
        assert.equal(opened.length, 0);
        await dependencies.onReady('http://127.0.0.1:3000');
      }
    })
  });
  assert.deepEqual(opened, ['http://127.0.0.1:3000']);
});

test('one-click rejects missing and malformed key files before Docker or npm',
  async () => {
    const cases = [
      { exists: false, value: 'unused', code: 'LOCAL_PLAY_KEY_FILE_MISSING' },
      { exists: true, value: '', code: 'LOCAL_PLAY_KEY_FILE_INVALID' },
      { exists: true, value: 'first\nsecond',
        code: 'LOCAL_PLAY_KEY_FILE_INVALID' },
      { exists: true, value: 'token with spaces',
        code: 'LOCAL_PLAY_KEY_FILE_INVALID' }
    ];
    for (const entry of cases) {
      let externalCalls = 0;
      await assert.rejects(() => runOneClickBootstrap({
        env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
        nodeVersion: '24.0.0',
        repositoryRoot: 'C:/repo',
        output: { write() {} },
        dependencies: fixtureDependencies({
          pathExists: () => entry.exists,
          readFile: async () => entry.value,
          commandAvailable: () => { externalCalls += 1; return true; },
          dockerReady: () => { externalCalls += 1; return true; },
          runNpmCi: () => { externalCalls += 1; }
        })
      }), { code: entry.code });
      assert.equal(externalCalls, 0);
    }
  });

test('one-click leaves an already-ready Docker daemon untouched', async () => {
  let probes = 0;
  await runOneClickBootstrap({
    env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
    nodeVersion: '24.0.0',
    repositoryRoot: 'C:/repo',
    output: { write() {} },
    dependencies: fixtureDependencies({
      dockerReady: () => { probes += 1; return true; },
      startDockerDesktop: () => assert.fail('must not start Docker Desktop')
    })
  });
  assert.equal(probes, 1);
});

test('one-click fails when Docker Desktop misses its readiness deadline',
  async () => {
    await assert.rejects(() => runOneClickBootstrap({
      env: { NOVGOROD_DEEPSEEK_KEY_FILE: 'C:/private/key.env' },
      nodeVersion: '24.0.0',
      platform: 'win32',
      repositoryRoot: 'C:/repo',
      output: { write() {} },
      dependencies: fixtureDependencies({
        dockerReady: () => false,
        startDockerDesktop: () => {},
        sleep: async () => {}
      })
    }), { code: 'LOCAL_PLAY_DOCKER_START_TIMEOUT' });
  });

test('one-click derives the private key path without a user name', async () => {
  const paths = [];
  await runOneClickBootstrap({
    env: {},
    documentsDirectory: 'C:/Users/example/Documents',
    nodeVersion: '24.0.0',
    repositoryRoot: 'C:/repo',
    output: { write() {} },
    dependencies: fixtureDependencies({
      pathExists: (path) => { paths.push(path); return true; }
    })
  });
  assert.equal(paths[0].replaceAll('\\', '/'),
    'C:/Users/example/Documents/NOVGOROD API/API KEY DEEPSEEK DVINA.env');
});

test('Windows bootstrap resolves the system MyDocuments known folder', () => {
  const calls = [];
  const dependencies = createOneClickDependencies({
    platform: 'win32',
    spawnSyncCommand: (executable, args) => {
      calls.push({ executable, args });
      return { status: 0, stdout: 'D:/Redirected Documents\r\n' };
    }
  });
  assert.equal(dependencies.documentsDirectory(),
    'D:/Redirected Documents');
  assert.equal(calls[0].executable, 'powershell.exe');
  assert.match(calls[0].args.at(-1), /MyDocuments/u);
});

test('shortcut installer targets the tracked one-click launcher', {
  skip: process.platform !== 'win32' && 'Windows Shell is required.'
}, async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'novgorod-shortcut-'));
  try {
    const installed = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', 'tools/local-play/install-desktop-shortcut.ps1',
      '-DestinationDirectory', destination
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(installed.status, 0, installed.stderr);
    const shortcutPath = resolve(destination, 'Новгород 1230 — играть.lnk');
    const inspected = spawnSync('powershell.exe', [
      '-NoProfile', '-Command',
      "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:NOVGOROD_SHORTCUT);@{target=($s.TargetPath -eq $env:NOVGOROD_TARGET);working=($s.WorkingDirectory -eq $env:NOVGOROD_WORKING)}|ConvertTo-Json -Compress"
    ], {
      encoding: 'utf8', windowsHide: true,
      env: {
        ...process.env,
        NOVGOROD_SHORTCUT: shortcutPath,
        NOVGOROD_TARGET: resolve('play-local.cmd'),
        NOVGOROD_WORKING: process.cwd()
      }
    });
    assert.equal(inspected.status, 0, inspected.stderr);
    const shortcut = JSON.parse(inspected.stdout);
    assert.equal(shortcut.target, true);
    assert.equal(shortcut.working, true);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

function fixtureDependencies(overrides = {}) {
  return {
    pathExists: () => true,
    commandAvailable: () => true,
    dockerReady: () => true,
    runNpmCi: () => assert.fail('npm ci must not run'),
    runLocalPlay: async () => {},
    readFile: async () => 'test-key',
    ...overrides
  };
}
