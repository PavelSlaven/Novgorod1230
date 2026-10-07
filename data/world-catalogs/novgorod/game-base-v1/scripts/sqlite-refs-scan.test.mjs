import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOV = path.resolve(import.meta.dirname, '../..');
const CHECKER = path.join(import.meta.dirname, 'check-sqlite-refs.py');

test('whole-data scan preserves static links and rejects malformed candidates', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-refs-scan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'references.txt'), [
    'sqlite:novgorod_1230',
    'sqlite:novgorod_1230:economy:',
    'sqlite:novgorod_1230(1)(1).economy(соль,)',
    'sqlite:novgorod_1230.sources#',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'build.mjs'), [
    'const SQ = "sqlite:novgorod_1230(1)(1).economy";',
    'const dynamic = `sqlite:novgorod_1230(1)(1).economy(${item},${confidence})`;',
    'const source = `sqlite:novgorod_1230.sources#S02`;',
  ].join('\n'));

  const script = `
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('sqlite_refs', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
refs = module.source_references(pathlib.Path(sys.argv[2]))
with module.open_database() as con:
    errors = [module.reference_error(con, ref) for _, _, ref in refs]
print(json.dumps({'refs': [ref for _, _, ref in refs], 'errors': errors}, ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', script, CHECKER, root], {
    cwd: NOV,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const scan = JSON.parse(result.stdout);
  assert.equal(scan.refs.length, 5, result.stdout);
  assert.ok(scan.refs.includes('sqlite:novgorod_1230.sources#S02'));
  assert.ok(!scan.refs.some((ref) => ref.includes('${')));
  assert.equal(scan.errors.filter(Boolean).length, 4, result.stdout);
  assert.equal(scan.errors.filter((error) => !error).length, 1, result.stdout);
});

test('repository-wide scan checks references from every data domain', () => {
  const result = spawnSync('python3', [CHECKER], {
    cwd: NOV,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /refs checked 104/);
  assert.match(result.stdout, /RESULT PASS 0/);
});
