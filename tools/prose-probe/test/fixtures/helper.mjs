import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtures = join(root, 'tools', 'prose-probe', 'test', 'fixtures');
const cli = join(root, 'tools', 'prose-probe', 'src', 'cli.mjs');

export function fixture(name) {
  return join(fixtures, name);
}

export function changeFrame(row, path, value) {
  const changed = structuredClone(row);
  const original = structuredClone(row.frame);
  const parts = path.split('.');
  assert.ok(parts.length && parts.every(Boolean));
  let target = changed.frame;
  for (const part of parts.slice(0, -1)) {
    assert.ok(target && Object.hasOwn(target, part));
    target = target[part];
  }
  const key = parts.at(-1);
  assert.ok(target && Object.hasOwn(target, key));
  const previous = target[key];
  target[key] = structuredClone(value);
  assert.notDeepEqual(changed.frame, original);
  target[key] = previous;
  assert.deepEqual(changed.frame, original);
  target[key] = structuredClone(value);
  return changed;
}

export async function setup(t, prefix = 'probe-') {
  const dir = await mkdtemp(join(tmpdir(), `prose-probe-${prefix}`));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeRecording(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}

export function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

export async function red(caseId, corruptFn) {
  if (process.env.PROSE_PROBE_RED_CASE === caseId) await corruptFn();
}
