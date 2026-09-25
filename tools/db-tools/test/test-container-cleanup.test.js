import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEST_OWNER_LABEL, reapOrphanTestContainers, testContainerLabel
} from '../../../test/helpers/test-containers.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...await jsFiles(p)); }
    else if (/\.(c|m)?js$/.test(e.name)) out.push(p);
  }
  return out;
}

async function sources() {
  const roots = ['test', 'tools', 'apps', 'packages', 'scripts'].map((r) => join(repo, r));
  const files = (await Promise.all(roots.map(jsFiles))).flat();
  return Promise.all(files.map(async (file) => ({ file, src: await readFile(file, 'utf8') })));
}

// GS §26: postgres-образ создаёт anonymous volume; `docker rm -f` без `-v` оставляет его навсегда.
test('test containers are removed together with their anonymous volumes', async () => {
  const offenders = [];
  for (const { file, src } of await sources()) {
    src.split('\n').forEach((line, i) => {
      if (/['"]rm['"]\s*,\s*['"](-f|--force)['"]/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'use docker rm -fv so anonymous volumes are removed');
});

// GS §26.1: убитый процесс теста не доходит до t.after; метка владельца даёт следующему прогону убрать контейнер.
test('every docker run carries the owner-pid label', async () => {
  const offenders = (await sources())
    .filter(({ src }) => /['"]docker['"]/.test(src) && /(['"])run\1\s*,\s*['"]-/.test(src))
    .map(({ file }) => file);
  assert.deepEqual(offenders, [],
    "use docker(['run', ...testContainerLabel(), ...]) from test/helpers/test-containers.js");
});

test('orphan reaper removes labelled containers of dead owners only', async (t) => {
  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const prefix = `reaper-${process.pid}-`;
  const start = (name, labelArgs) => {
    t.after(() => docker(['rm', '-fv', name]));
    const run = docker(['run', ...labelArgs, '-d', '--name', name, 'postgres:16-alpine', 'sleep', '300']);
    assert.equal(run.status, 0, run.stderr);
  };
  start(`${prefix}live`, testContainerLabel());
  start(`${prefix}dead`, ['--label', `${TEST_OWNER_LABEL}=${spawnSync(process.execPath, ['-e', '0']).pid}`]);
  reapOrphanTestContainers();
  const left = docker(['ps', '-a', '--filter', `name=${prefix}`, '--format', '{{.Names}}']).stdout;
  assert.deepEqual(left.split('\n').filter(Boolean), [`${prefix}live`]);
});
