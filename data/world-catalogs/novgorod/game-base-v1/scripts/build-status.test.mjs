import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildStatus, parse, targets } from './build-status.mjs';

test('target resolution keeps paths and reports ambiguity and missing files', () => {
  const files = ['README.md', 'a/README.md', 'a/x.csv', 'b/x.csv', 'b/y.json', 'b/nested/z.py'];
  assert.deepEqual(targets('y.json и пояснение', files), [{ token: 'y.json', file: 'b/y.json' }]);
  assert.deepEqual(targets('b/x.csv (было rework)', files), [{ token: 'b/x.csv', file: 'b/x.csv' }]);
  assert.deepEqual(targets('wrong/y.json', files), [{ token: 'wrong/y.json', file: 'b/y.json' }]);
  assert.deepEqual(targets('a/x.csv + b/y.json', files).map(row => row.file), ['a/x.csv', 'b/y.json']);
  assert.deepEqual(targets('a/', files).map(row => row.file), ['a/README.md', 'a/x.csv']);
  assert.deepEqual(targets('b/', files).map(row => row.file), ['b/x.csv', 'b/y.json', 'b/nested/z.py']);
  assert.deepEqual(targets('x.csv', files)[0].candidates, ['a/x.csv', 'b/x.csv']);
  assert.equal(targets('missing.csv', files)[0].reason, 'файл не найден');
  assert.deepEqual(targets('a/README.md and the group README.md', files).map(row => row.file), ['a/README.md', 'README.md']);
  assert.deepEqual(targets('README.md (×2)', files).map(row => row.file), ['README.md', 'a/README.md']);
});

test('generated catalog links point to real targets and verdict lines', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const first = buildStatus(root);
  assert.equal(first.markdown, buildStatus(root).markdown);
  for (const { group, files } of first.results) {
    const lines = fs.readFileSync(path.join(root, group, 'VERIFICATION.md'), 'utf8').split(/\r?\n/);
    for (const [file, { status, line, anchor }] of files) {
      assert.ok(fs.statSync(path.join(root, group, file)).isFile(), `${group}/${file}`);
      assert.ok(lines[line - 1].includes(status), `${group}/${file}:${line}`);
      assert.ok(first.markdown.includes(`(${group}/VERIFICATION.md#${anchor})`));
    }
  }
});

test('later verdict wins across bare filename, directory, and full path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-status-'));
  try {
    for (const file of ['a/x.csv', 'a/nested/z.py', 'README.md']) {
      fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), '');
    }
    fs.writeFileSync(path.join(root, 'VERIFICATION.md'), [
      '# Проверка',
      '### a/ — rework (было пусто)',
      '### x.csv — approve_with_limits',
      '### a/nested/z.py и пояснение — approve',
      '### README.md — rework',
    ].join('\n'));
    const { files, unresolved } = parse(root);
    assert.equal(files.get('a/x.csv').status, 'approve_with_limits');
    assert.equal(files.get('a/nested/z.py').status, 'approve');
    assert.equal(files.get('README.md').status, 'rework');
    assert.deepEqual(unresolved, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
