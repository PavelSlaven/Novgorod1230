import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '../../../../..');
const VALIDATOR = path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/scripts/validate.cjs');
const WK_REL = path.join('data', 'world-catalogs', 'novgorod', 'world-knowledge', 'production-v1');

test('fauna validation fails closed when WK is missing, empty, or unreadable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iss-201-wk-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const run = (diagnostic) => {
    const result = spawnSync(process.execPath, [VALIDATOR, '--check'], {
      cwd: REPO,
      env: { ...process.env, NOVGOROD_MAIN: root },
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, diagnostic);
  };

  run(/WK directory unavailable/);

  const wkDir = path.join(root, WK_REL);
  fs.mkdirSync(wkDir, { recursive: true });
  run(/WK index has no JSON files/);

  fs.mkdirSync(path.join(wkDir, 'unreadable.json'));
  run(/WK file unreadable or invalid/);
});
