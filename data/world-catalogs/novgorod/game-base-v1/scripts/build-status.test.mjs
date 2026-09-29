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
  assert.deepEqual(targets('b/y.json (и b/nested/z.py)', files).map(row => row.file), ['b/y.json', 'b/nested/z.py']);
  assert.deepEqual(targets('a/', files).map(row => row.file), ['a/README.md', 'a/x.csv']);
  assert.deepEqual(targets('b/', files).map(row => row.file), ['b/x.csv', 'b/y.json', 'b/nested/z.py']);
  assert.deepEqual(targets('x.csv', files)[0].candidates, ['a/x.csv', 'b/x.csv']);
  assert.equal(targets('missing.csv', files)[0].reason, 'файл не найден');
  assert.deepEqual(targets('a/README.md and the group README.md', files).map(row => row.file), ['a/README.md', 'README.md']);
  assert.deepEqual(targets('README.md (×2)', files).map(row => row.file), ['README.md', 'a/README.md']);
});

test('parenthetical heading resolves only a unique existing directory', () => {
  const files = ['npc_runtime_profiles/README.md', 'npc_runtime_profiles/build.py', 'other/README.md'];
  assert.deepEqual(targets('npc_runtime_profiles (subject_applicability хозяйки)', files).map(row => row.file),
    ['npc_runtime_profiles/README.md', 'npc_runtime_profiles/build.py']);
  assert.deepEqual(targets('npc_runtime_profiles (missing.csv)', files).map(row => row.file),
    ['npc_runtime_profiles/README.md', 'npc_runtime_profiles/build.py']);
  assert.equal(targets('unknown_profiles (subject_applicability хозяйки)', files)[0].reason,
    'нет пути к файлу или каталогу');
  assert.equal(targets('unknown_profiles (missing.csv)', files)[0].reason, 'файл не найден');
  assert.equal(targets('other (note)', ['a/other/README.md', 'b/other/README.md'])[0].reason,
    'нет пути к файлу или каталогу');
  assert.equal(targets('other (missing.csv)', ['a/other/README.md', 'b/other/README.md'])[0].reason,
    'файл не найден');
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
      '## Вердикт',
      '- `a/x.csv` — **approve** (было rework).',
    ].join('\n'));
    const { files, unresolved } = parse(root);
    assert.equal(files.get('a/x.csv').status, 'approve');
    assert.equal(files.get('a/nested/z.py').status, 'approve');
    assert.equal(files.get('README.md').status, 'rework');
    assert.deepEqual(unresolved, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('.cjs targets resolve to the file, not to the whole directory', () => {
  const files = ['s/build.cjs', 's/lib.cjs', 's/src/hunting.cjs', 's/src/mammals.cjs', 's/extract.py', 's/data/in.json'];
  assert.deepEqual(targets('scripts/src/hunting.cjs', files).map(row => row.file), ['s/src/hunting.cjs']);
  assert.deepEqual(targets('s/build.cjs', files), [{ token: 's/build.cjs', file: 's/build.cjs' }]);
  assert.deepEqual(targets('build.cjs + src/mammals.cjs', files).map(row => row.file), ['s/build.cjs', 's/src/mammals.cjs']);
  assert.equal(targets('s/missing.cjs', files)[0].reason, 'файл не найден');
});

test('directory target covers its files while a file target covers only itself', () => {
  const files = ['s/build.cjs', 's/extract.py', 's/data/in.json', 't/x.csv'];
  assert.deepEqual(targets('s/', files).map(row => row.file), ['s/build.cjs', 's/extract.py', 's/data/in.json']);
  assert.deepEqual(targets('s/build.cjs', files).map(row => row.file), ['s/build.cjs']);
  assert.equal(targets('empty/', files)[0].reason, 'каталог пуст или не найден');
});

test('.cjs verdict resolves in a group and does not overwrite sibling files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-status-'));
  try {
    for (const file of ['scripts/build.cjs', 'scripts/src/hunting.cjs', 'scripts/extract.py']) {
      fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), '');
    }
    fs.writeFileSync(path.join(root, 'VERIFICATION.md'), [
      '# Проверка',
      '- scripts/extract.py — approve_with_limits',
      '- scripts/build.cjs — approve',
      '- scripts/src/hunting.cjs — approve',
    ].join('\n'));
    const { files, unresolved } = parse(root);
    assert.deepEqual(unresolved, []);
    assert.deepEqual([...files.keys()].sort(), ['scripts/build.cjs', 'scripts/extract.py', 'scripts/src/hunting.cjs']);
    assert.equal(files.get('scripts/extract.py').status, 'approve_with_limits');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
